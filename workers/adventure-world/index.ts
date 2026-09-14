import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import {
  initialWorld,
  createWorldAPI,
  type Campaign,
  type World,
  type AdventureRole,
  type PendingTurn,
  type ServiceView,
} from "@workspace/adventure-engine";
import {
  evaluate,
  defaultEngineSource,
  AgentProgramError,
  WorldActionRefusal,
} from "./evaluate.js";
import { sceneSnapshot, illustrationReferences } from "./scene.js";
type SceneTask = ReturnType<typeof sceneSnapshot> & {
  id: string;
  placeId: string;
  status: "queued" | "painting" | "error";
  error?: string;
  jobId?: string;
  referenceJobs?: Record<string, string>;
  attempt: number;
};
type Seat = { role: AdventureRole; targetId: string; channelId: string };
type Stored = {
  orchestrationVersion?: 2;
  world: World;
  seats: Seat[];
  pending: PendingTurn | null;
  engineSource: string;
  trajectory: any[];
  checkpoint?: { world: World; engineSource: string };
  scenes: SceneTask[];
  artworkSignatures: Record<string, string>;
  openingArtwork?: any;
  illustrationReferences?: Record<string, { signature: string; asset: any }>;
  receipts: string[];
};
export class AdventureWorldDO extends DurableObjectBase {
  static override schemaVersion = 1;
  protected override requiredTables() {
    return ["adventure"];
  }
  protected createTables() {
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS adventure (id INTEGER PRIMARY KEY, body TEXT NOT NULL)",
    );
  }
  private load(): Stored {
    this.ensureReady();
    const row = this.sql
      .exec<{ body: string }>("SELECT body FROM adventure WHERE id=1")
      .toArray()[0];
    if (!row) throw new Error("Initialize this campaign first");
    const state = JSON.parse(row.body);
    state.scenes ??= [];
    state.artworkSignatures ??= {};
    if (state.orchestrationVersion !== 2) {
      // Version 1 kept painting inside the foreground turn. Keep its exact turn/job
      // identity so an already submitted native image request resumes rather than duplicates.
      if (state.pending?.phase === "artist") {
        const snapshot = sceneSnapshot(state.world);
        state.scenes.push({
          ...snapshot,
          id: state.pending.id,
          placeId: state.imageJob?.placeId ?? snapshot.view.location.id,
          status: "queued",
          jobId: state.imageJob?.id,
          attempt: (state.pending.attempt ?? 0) + 1,
        });
        if (!state.receipts.includes(state.pending.id))
          state.receipts.push(state.pending.id);
        state.pending = null;
        delete state.imageJob;
      }
      state.orchestrationVersion = 2;
      this.save(state);
    }
    return state;
  }
  private save(s: Stored) {
    s.orchestrationVersion = 2;
    this.sql.exec(
      "INSERT INTO adventure(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      JSON.stringify(s),
    );
  }
  private seat(s: Stored) {
    const seat = s.seats.find(
      (x) => x.targetId === this.rpcCallerId && this.rpcCallerKind === "do",
    );
    if (!seat)
      throw new Error("Only a registered world participant may do this");
    return seat;
  }
  private player() {
    if (this.rpcCallerKind === "do")
      throw new Error("Only the player may start turns or seat agents");
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  init({ campaign }: { campaign: Campaign }) {
    this.player();
    this.ensureReady();
    if (!this.sql.exec("SELECT id FROM adventure WHERE id=1").toArray().length)
      this.save({
        world: initialWorld(campaign),
        seats: [],
        pending: null,
        engineSource: defaultEngineSource,
        trajectory: [],
        receipts: [],
        scenes: [],
        artworkSignatures: {},
      });
    if (this.load().world.campaign !== campaign.id)
      throw new Error("This saved journey belongs to a different campaign");
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getGame(): Promise<ServiceView> {
    let s = this.load();
    if (
      s.scenes.find((task) => !task.error)?.status === "queued" &&
      s.seats.some((seat) => seat.role === "artist")
    ) {
      await this.deliverScene();
      s = this.load();
    }
    const view = createWorldAPI(s.world, s.world.playerId).observe();
    const roles: { role: AdventureRole; name: string }[] = [
      { role: "player", name: "Your guide" },
      { role: "builder", name: "World keeper" },
      { role: "artist", name: "Scene painter" },
      ...s.world.entities
        .filter((e) => e.kind === "person" && e.id !== s.world.playerId)
        .map((e) => ({
          role: `person:${e.id}` as AdventureRole,
          name: e.name,
        })),
    ];
    const world = structuredClone(s.world);
    world.behaviors = [];
    world.relations = createWorldAPI(s.world, s.world.playerId).relations();
    world.story = { premise: world.story.premise, arc: [], commitments: [] };
    world.entities = [
      ...world.entities
        .filter((e) => e.kind === "place" && e.id !== view.location.id)
        .map((e) => ({
          ...e,
          components: {
            exits: e.components.exits ?? {},
            frontier: e.components.frontier ?? false,
          },
        })),
      view.location,
      ...view.entities,
      ...view.inventory,
      {
        ...world.entities.find((e) => e.id === world.playerId)!,
        components: {},
      },
    ];
    world.journal = s.world.journal.filter(
      (e) => !e.audience || e.audience.includes(s.world.playerId),
    );
    const demanded = new Set<string>();
    if (s.pending)
      demanded.add(
        s.pending.phase === "participants"
          ? `person:${s.pending.participants.find((id) => !s.pending!.replies.includes(id))}`
          : s.pending.phase,
      );
    if (s.scenes.length) demanded.add("artist");
    return {
      world,
      view,
      pending: s.pending,
      background: {
        scene: (() => {
          const task = s.scenes.find(
            (task) => task.placeId === view.location.id,
          );
          return task
            ? {
                id: task.id,
                placeId: task.placeId,
                signature: task.signature,
                status: task.status,
                error: task.error,
                preparing: this.references(s, task)
                  .filter((ref) => !ref.asset)
                  .map((ref) => ref.name),
              }
            : null;
        })(),
      },
      visual: {
        references: Object.fromEntries(Object.entries(s.illustrationReferences ?? {}).map(([key,ref]) => [key, ref.signature])),
        signature: sceneSnapshot(s.world).signature,
        artworkSignature: s.artworkSignatures[view.location.id],
        fresh:
          s.artworkSignatures[view.location.id] ===
          sceneSnapshot(s.world).signature,
      },
      seated: s.seats.some((x) => x.role === "player"),
      neededSeats: roles.filter(
        (r) => demanded.has(r.role) && !s.seats.some((x) => x.role === r.role),
      ),
    };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  setOpeningArtwork({ asset, signature, placeId: authoredPlace }: { asset: any; signature?: string; placeId?: string }) {
    this.player();
    const s = this.load();
    const placeId = s.world.entities.find(
      (e) => e.id === s.world.playerId,
    )!.location!;
    if (!asset?.id || !asset?.digest)
      throw new Error("An image asset is required");
    if (signature && (signature !== sceneSnapshot(s.world).signature || authoredPlace !== placeId)) return this.getGame();
    s.openingArtwork ??= asset;
    if (!s.world.artwork[placeId] && s.world.tick === 0) {
      s.world.artwork[placeId] = asset;
      s.openingArtwork = asset;
      s.artworkSignatures[placeId] = sceneSnapshot(s.world).signature;
    }
    this.save(s);
    return this.getGame();
  }
  @rpc({ website: {kind:"closed",reason:"Installed game artwork."}, principals:["host","user","code"], effect:{kind:"open"}, tier:"open", sensitivity:"write" })
  setBundledReference(input: {key: string; signature: string; asset: any}) {
    this.player();
    const s = this.load();
    const entity = s.world.entities.find(e => `${e.kind === "person" ? "person" : "place"}:${e.id}` === input.key && (e.kind === "person" || e.kind === "place"));
    if (!entity || !input.asset?.id || !input.asset?.digest) throw new Error("A known reference subject and image asset are required.");
    const ref = illustrationReferences({location:entity,entities:[],inventory:[],exits:{},events:[]},s.world.artDirection)[0]!;
    if (ref.signature !== input.signature) return { superseded: true };
    s.illustrationReferences ??= {};
    if (!s.illustrationReferences[input.key]) s.illustrationReferences[input.key] = { signature: ref.signature, asset: input.asset };
    this.save(s); return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async registerParticipant(seat: Seat) {
    this.player();
    if (
      !["player", "builder", "artist"].includes(seat.role) &&
      !/^person:[\w-]+$/.test(seat.role)
    )
      throw new Error("Unknown role");
    const s = this.load();
    s.seats = s.seats.filter((x) => x.role !== seat.role);
    s.seats.push(seat);
    this.save(s);
    await this.deliver();
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async play({ id, text }: { id: string; text: string }) {
    this.player();
    const s = this.load();
    if (s.receipts.includes(id) || s.pending?.id === id) return this.getGame();
    if (s.pending) throw new Error("The current moment is still unfolding");
    if (!text.trim()) throw new Error("Tell us what you want to do");
    s.checkpoint = {
      world: structuredClone(s.world),
      engineSource: s.engineSource,
    };
    s.pending = {
      id,
      text,
      phase: "player",
      replies: [],
      participants: [],
      attempt: 0,
    };
    s.world.journal.push({
      id: "input-" + id,
      tick: s.world.tick,
      actor: s.world.playerId,
      text,
      kind: "player",
      audience: [s.world.playerId],
    });
    s.trajectory.push({ id, text, revision: s.world.revision });
    this.save(s);
    await this.deliver();
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async retry() {
    this.player();
    const s = this.load();
    if (s.pending?.error) {
      s.pending.attempt++;
      delete s.pending.error;
      this.save(s);
      await this.deliver();
    }
    const fresh = this.load();
    for (const scene of fresh.scenes)
      if (
        scene.error &&
        !fresh.scenes.some((task) => task.status === "painting")
      ) {
        delete scene.error;
        scene.status = "queued";
        scene.attempt++;
      }
    this.save(fresh);
    await this.deliverScene();
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancel() {
    this.player();
    const s = this.load(),
      pending = s.pending;
    if (!pending) return this.getGame();
    s.receipts.push(pending.id);
    s.pending = null;
    s.trajectory.push({
      turnId: pending.id,
      cancelled: true,
      revision: s.world.revision,
    });
    this.queueScene(s, pending.id);
    this.save(s);
    const role =
      pending.phase === "participants"
        ? `person:${pending.participants.find((id) => !pending.replies.includes(id))}`
        : pending.phase;
    const seat = s.seats.find((seat) => seat.role === role);
    if (seat)
      await this.rpc.call(seat.targetId, "cancelMoment", [
        { channelId: seat.channelId, turnId: pending.id },
      ]);
    await this.deliverScene();
    return this.getGame();
  }
  private queueScene(s: Stored, id: string) {
    const snapshot = sceneSnapshot(s.world),
      placeId = snapshot.view.location.id;
    if (
      s.artworkSignatures[placeId] === snapshot.signature ||
      s.scenes.some(
        (task) =>
          task.placeId === placeId && task.signature === snapshot.signature,
      )
    )
      return;
    // Preserve the running paint; supersede queued compositions with the latest visible scene.
    s.scenes = s.scenes.filter((task) => task.status === "painting");
    s.scenes.push({
      ...snapshot,
      id: id + ":scene",
      placeId,
      status: "queued",
      attempt: 0,
    });
  }
  private async deliverScene() {
    const s = this.load(),
      scene = s.scenes.find((task) => !task.error),
      seat = s.seats.find((x) => x.role === "artist");
    if (!scene || !seat || scene.status !== "queued") return;
    scene.status = "painting";
    this.save(s);
    try {
      await this.rpc.call(seat.targetId, "receiveMoment", [
        {
          channelId: seat.channelId,
          turnId: scene.id,
          steeringId: `adventure:${this.objectKey}:${scene.id}:artist:${scene.attempt}`,
        },
      ]);
    } catch (error) {
      const fresh = this.load(),
        task = fresh.scenes.find((task) => task.id === scene.id);
      if (task) {
        task.error = String(error);
        task.status = "error";
        this.save(fresh);
      }
    }
  }
  private async deliver(): Promise<void> {
    const s = this.load();
    if (!s.pending) return this.deliverScene();
    const pending = s.pending;
    let roles: AdventureRole[] =
      pending.phase === "participants"
        ? s.world.entities
            .filter(
              (e) =>
                e.kind === "person" &&
                pending.participants.includes(e.id) &&
                !pending.replies.includes(e.id),
            )
            .map((e) => `person:${e.id}` as AdventureRole)
        : [pending.phase];
    if (!roles.length) {
      s.receipts.push(pending.id);
      s.pending = null;
      this.queueScene(s, pending.id);
      this.save(s);
      return this.deliverScene();
    }
    for (const role of roles.slice(0, 1)) {
      const seat = s.seats.find((x) => x.role === role);
      if (!seat) continue;
      try {
        await this.rpc.call(seat.targetId, "receiveMoment", [
          {
            channelId: seat.channelId,
            turnId: pending.id,
            steeringId: `adventure:${this.objectKey}:${pending.id}:${role}:${pending.attempt}`,
          },
        ]);
      } catch (error) {
        const fresh = this.load();
        if (
          fresh.pending?.id === pending.id &&
          fresh.pending.phase === pending.phase &&
          fresh.pending.attempt === pending.attempt
        ) {
          fresh.pending.error = String(error);
          this.save(fresh);
        }
      }
    }
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  participantStopped({ turnId, reason }: { turnId: string; reason?: string }) {
    const s = this.load(),
      seat = this.seat(s);
    if (seat.role === "artist") {
      const task = s.scenes.find((task) => task.id === turnId);
      if (task && !task.error) {
        task.error = reason || "The artist paused. Retry the illustration.";
        task.status = "error";
        this.save(s);
      }
      return { ok: true };
    }
    if (s.pending?.id !== turnId) return { ok: true };
    const owesContribution =
      seat.role === s.pending.phase ||
      (s.pending.phase === "participants" &&
        seat.role.startsWith("person:") &&
        s.pending.participants.includes(seat.role.slice(7)) &&
        !s.pending.replies.includes(seat.role.slice(7)));
    if (owesContribution) {
      s.pending.error =
        reason ||
        "The participant paused before completing this moment. Resume to continue.";
      this.save(s);
    }
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  perspective() {
    const s = this.load(),
      seat = this.seat(s);
    if (seat.role === "artist") {
      const task = s.scenes.find((task) => !task.error);
      return {
        role: seat.role,
        pending: task ? { id: task.id, phase: "artist" } : null,
        view: task?.view,
        signature: task?.signature,
        artwork: s.world.artwork,
        references: task ? this.references(s, task) : [],
        artDirection: task?.artDirection ?? s.world.artDirection,
        imageJob: task?.jobId ? { id: task.jobId } : undefined,
      };
    }
    if (seat.role === "builder")
      return {
        role: seat.role,
        pending: s.pending,
        world: s.world,
        engineSource: s.engineSource,
        trajectory: s.trajectory,
        checkpoint: s.checkpoint,
      };
    const actorId = seat.role.startsWith("person:")
      ? seat.role.slice(7)
      : s.world.playerId;
    return {
      role: seat.role,
      pending:
        s.pending && seat.role.startsWith("person:")
          ? { ...s.pending, text: "" }
          : s.pending,
      completedActions: s.trajectory.filter(
        (t) => t.turnId === s.pending?.id && t.role === seat.role && !t.error,
      ),
      view: createWorldAPI(s.world, actorId).observe(),
      memory: createWorldAPI(s.world, actorId).recall(),
      self: s.world.entities.find((e) => e.id === actorId),
      artDirection: s.world.artDirection,
      artwork: s.world.artwork,
    };
  }
  private references(s: Stored, task: SceneTask) {
    return illustrationReferences(
      task.view,
      task.artDirection ?? s.world.artDirection,
    ).map((ref) => {
      const saved = s.illustrationReferences?.[ref.key];
      return {
        ...ref,
        asset: saved?.signature === ref.signature ? saved.asset : undefined,
        previousAsset: saved?.asset,
        jobId: task.referenceJobs?.[ref.key],
      };
    });
  }
  @rpc({
    website: {
      kind: "closed",
      reason: "Illustration references belong to the installed adventure.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  setReferenceJob(input: { turnId: string; key: string; jobId: string }) {
    const s = this.load(),
      task = s.scenes.find((task) => !task.error);
    if (
      this.seat(s).role !== "artist" ||
      task?.id !== input.turnId ||
      !this.references(s, task).some((ref) => ref.key === input.key)
    )
      throw new Error("Only the active artist may prepare a scene reference");
    (task.referenceJobs ??= {})[input.key] = input.jobId;
    this.save(s);
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason: "Illustration references belong to the installed adventure.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  publishReference(input: { turnId: string; key: string; asset: any }) {
    const s = this.load(),
      task = s.scenes.find((task) => !task.error);
    if (this.seat(s).role !== "artist" || task?.id !== input.turnId)
      throw new Error("Only the active artist may publish a scene reference");
    const ref = this.references(s, task).find((ref) => ref.key === input.key);
    if (!ref || !input.asset?.id || !input.asset?.digest)
      throw new Error("A reference subject and image asset are required");
    (s.illustrationReferences ??= {})[ref.key] = {
      signature: ref.signature,
      asset: input.asset,
    };
    this.save(s);
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async execute({ turnId, code }: { turnId: string; code: string }) {
    const s = this.load(),
      seat = this.seat(s);
    if (!s.pending || s.pending.id !== turnId) throw new Error("Stale turn");
    if (seat.role !== "player" && !seat.role.startsWith("person:"))
      throw new Error("Use your role tools");
    if (
      (seat.role === "player" && s.pending.phase !== "player") ||
      (seat.role.startsWith("person:") &&
        (s.pending.phase !== "participants" ||
          s.pending.participants.find(
            (id) => !s.pending!.replies.includes(id),
          ) !== seat.role.slice(7)))
    )
      throw new Error("Wait for your phase");
    const revision = s.world.revision;
    try {
      const result = await evaluate(
        (m, a) => this.rpc.call("main", m, a),
        s.world,
        seat.role === "player" ? s.world.playerId : seat.role.slice(7),
        code,
        s.engineSource,
      );
      const fresh = this.load();
      if (
        fresh.pending?.id !== turnId ||
        fresh.pending.phase !== s.pending.phase
      )
        return { cancelled: true };
      if (fresh.world.revision !== revision)
        return {
          retry: true,
          message:
            "World changed; reread before acting. No effects from this call committed.",
        };
      result.world.artwork = fresh.world.artwork;
      result.world.revision++;
      fresh.world = result.world;
      fresh.trajectory.push({
        turnId,
        role: seat.role,
        code,
        result: result.result,
      });
      if (fresh.pending.continuationCode === code)
        delete fresh.pending.continuationCode;
      this.save(fresh);
      return result.result;
    } catch (error) {
      const fresh = this.load();
      if (
        fresh.pending?.id !== turnId ||
        fresh.pending.phase !== s.pending.phase
      )
        return { cancelled: true };
      if (fresh.world.revision !== revision)
        return {
          retry: true,
          message:
            "World changed; reread before acting. No effects from this call committed.",
        };
      if (
        fresh.pending?.id === turnId &&
        fresh.pending.phase === s.pending.phase &&
        fresh.world.revision === revision
      ) {
        if (
          error instanceof AgentProgramError ||
          error instanceof WorldActionRefusal
        ) {
          fresh.trajectory.push({
            turnId,
            role: seat.role,
            code,
            error: String(error),
            origin: error instanceof WorldActionRefusal ? "action" : "program",
          });
          this.save(fresh);
          return {
            ...(error instanceof WorldActionRefusal
              ? { actionError: String(error) }
              : { programError: String(error) }),
            message:
              error instanceof WorldActionRefusal
                ? "A world prerequisite refused this action; this call committed no effects. Respect the constraint and revise your program using the current perspective and already completed actions."
                : "Your JavaScript failed; this call committed no effects. Correct the program using your current perspective and already completed actions, then call eval_world again.",
          };
        }
        fresh.pending.diagnostic = String(error);
        fresh.pending.purpose = /\bFRONTIER:/.test(String(error))
          ? "frontier"
          : /\bUNMODELED:/.test(String(error))
            ? "extension"
            : "repair";
        delete fresh.pending.error;
        delete fresh.pending.continuationCode;
        fresh.pending.failedRole = seat.role;
        fresh.pending.phase = "builder";
        fresh.trajectory.push({
          turnId,
          role: seat.role,
          code,
          error: String(error),
        });
        this.save(fresh);
        await this.deliver();
      }
      throw error;
    }
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async finish({ turnId, text }: { turnId: string; text: string }) {
    const s = this.load(),
      seat = this.seat(s);
    if (s.pending?.id !== turnId) throw new Error("Stale turn");
    if (s.pending.continuationCode)
      throw new Error("Execute the corrected continuation before finishing");
    if (seat.role === "player" && s.pending.phase === "player") {
      if (text) {
        createWorldAPI(s.world, s.world.playerId).narrate(text);
        s.world.revision++;
      }
      s.pending.phase = "participants";
    } else if (
      seat.role.startsWith("person:") &&
      s.pending.phase === "participants" &&
      s.pending.participants.find((id) => !s.pending!.replies.includes(id)) ===
        seat.role.slice(7)
    ) {
      const id = seat.role.slice(7);
      if (!s.pending.replies.includes(id)) s.pending.replies.push(id);
    } else throw new Error("Cannot finish this phase");
    const previous = new Set(
      s.checkpoint?.world.journal.map((event) => event.id) ?? [],
    );
    const events = s.world.journal.filter(
      (event) =>
        !previous.has(event.id) &&
        !["player", "narration", "read"].includes(event.kind),
    );
    s.pending.participants = [
      ...new Set([
        ...s.pending.participants,
        ...s.world.entities
          .filter(
            (entity) =>
              entity.kind === "person" &&
              entity.id !== s.world.playerId &&
              events.some(
                (event) =>
                  event.actor !== entity.id &&
                  event.audience?.includes(entity.id),
              ),
          )
          .map((entity) => entity.id),
      ]),
    ];
    this.save(s);
    await this.deliver();
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async repair({
    turnId,
    code,
    engineSource,
    continuationCode,
    note,
  }: {
    turnId: string;
    code: string;
    engineSource?: string;
    continuationCode?: string;
    note: string;
  }) {
    const s = this.load();
    if (
      this.seat(s).role !== "builder" ||
      s.pending?.id !== turnId ||
      s.pending.phase !== "builder"
    )
      throw new Error("Only the active world builder may repair");
    const source = engineSource ?? s.engineSource;
    // Maintenance must remain available even if the stored engine or a local behavior is broken.
    const edited = await evaluate(
      (m, a) => this.rpc.call("main", m, a),
      s.world,
      s.world.playerId,
      code,
      defaultEngineSource,
      true,
    );
    const world = edited.world;
    const continuation =
      continuationCode ??
      [...s.trajectory]
        .reverse()
        .find((entry: any) => entry.error && entry.turnId === turnId)?.code ??
      "return world.observe();";
    await evaluate(
      (m, a) => this.rpc.call("main", m, a),
      world,
      s.pending.failedRole?.startsWith("person:")
        ? s.pending.failedRole.slice(7)
        : world.playerId,
      continuation,
      source,
    );
    const fresh = this.load();
    if (
      fresh.pending?.id !== turnId ||
      fresh.pending.phase !== "builder" ||
      fresh.world.revision !== s.world.revision
    )
      throw new Error("World changed during repair");
    world.artwork = fresh.world.artwork;
    fresh.world = world;
    fresh.world.revision++;
    fresh.engineSource = source;
    fresh.trajectory.push({
      turnId,
      repair: note,
      code,
      continuationCode: continuation,
    });
    fresh.pending.continuationCode = continuation;
    fresh.pending.phase = fresh.pending.failedRole?.startsWith("person:")
      ? "participants"
      : "player";
    delete fresh.pending.failedRole;
    delete fresh.pending.diagnostic;
    delete fresh.pending.purpose;
    fresh.pending.attempt++;
    delete fresh.pending.error;
    this.save(fresh);
    await this.deliver();
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  setImageJob(input: { turnId: string; jobId: string; placeId: string }) {
    const s = this.load(),
      task = s.scenes.find((task) => !task.error);
    if (
      this.seat(s).role !== "artist" ||
      task?.id !== input.turnId ||
      task.placeId !== input.placeId
    )
      throw new Error("Only the active scene artist may publish");
    task.jobId = input.jobId;
    task.status = "painting";
    this.save(s);
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async publishArtwork(input: { turnId: string; asset?: any; error?: string }) {
    const s = this.load(),
      task = s.scenes.find((task) => !task.error);
    if (this.seat(s).role !== "artist" || task?.id !== input.turnId)
      throw new Error("No illustration pending");
    if (!input.asset && !input.error && !s.world.artwork[task.placeId])
      throw new Error(
        "This place has no illustration yet. Use paint_scene before finishing.",
      );
    if (input.asset) {
      s.world.artwork[task.placeId] = input.asset;
      s.artworkSignatures[task.placeId] = task.signature;
    }
    if (input.error) {
      task.error = input.error;
      task.status = "error";
      s.trajectory.push({ turnId: input.turnId, imageError: input.error });
    } else s.scenes = s.scenes.filter((scene) => scene.id !== task.id);
    this.save(s);
    await this.deliverScene();
    return { ok: true };
  }
}
export default {
  fetch() {
    return new Response("Adventure world");
  },
};
