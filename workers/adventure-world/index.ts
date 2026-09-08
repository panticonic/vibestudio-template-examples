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
import { evaluate, defaultEngineSource } from "./evaluate.js";
type Seat = { role: AdventureRole; targetId: string; channelId: string };
type Stored = {
  world: World;
  seats: Seat[];
  pending: PendingTurn | null;
  engineSource: string;
  trajectory: any[];
  checkpoint?: { world: World; engineSource: string };
  imageJob?: { id: string; placeId: string; revision: number };
  receipts: string[];
};
export class AdventureWorldDO extends DurableObjectBase {
  static override schemaVersion = 1;
  protected override requiredTables() {
    return ["adventure"];
  }
  protected createTables() {
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS adventure (id INTEGER PRIMARY KEY, body TEXT NOT NULL)"
    );
  }
  private load(): Stored {
    this.ensureReady();
    const row = this.sql
      .exec<{ body: string }>("SELECT body FROM adventure WHERE id=1")
      .toArray()[0];
    if (!row) throw new Error("Initialize this campaign first");
    return JSON.parse(row.body);
  }
  private save(s: Stored) {
    this.sql.exec(
      "INSERT INTO adventure(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      JSON.stringify(s)
    );
  }
  private seat(s: Stored) {
    const seat = s.seats.find(
      (x) => x.targetId === this.rpcCallerId && this.rpcCallerKind === "do"
    );
    if (!seat) throw new Error("Only a registered world participant may do this");
    return seat;
  }
  private player() {
    if (this.rpcCallerKind === "do")
      throw new Error("Only the player may start turns or seat agents");
  }
  @rpc({
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
      });
    if (this.load().world.campaign !== campaign.id)
      throw new Error("This saved journey belongs to a different campaign");
    return this.getGame();
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  getGame(): ServiceView {
    const s = this.load(),
      view = createWorldAPI(s.world, s.world.playerId).observe();
    const roles: { role: AdventureRole; name: string }[] = [
      { role: "player", name: "Your guide" },
      { role: "builder", name: "World keeper" },
      { role: "artist", name: "Scene painter" },
      ...s.world.entities
        .filter((e) => e.kind === "person" && e.id !== s.world.playerId)
        .map((e) => ({ role: `person:${e.id}` as AdventureRole, name: e.name })),
    ];
    const world = structuredClone(s.world);
    world.behaviors = [];
    world.story = { premise: world.story.premise, arc: [], commitments: [] };
    world.entities = [
      ...world.entities
        .filter((e) => e.kind === "place" && e.id !== view.location.id)
        .map((e) => ({
          ...e,
          components: { exits: e.components.exits ?? {}, frontier: e.components.frontier ?? false },
        })),
      view.location,
      ...view.entities,
      ...view.inventory,
      { ...world.entities.find((e) => e.id === world.playerId)!, components: {} },
    ];
    world.journal = s.world.journal.filter(
      (e) => !e.audience || e.audience.includes(s.world.playerId)
    );
    return {
      world,
      view,
      pending: s.pending,
      seated: roles.slice(0, 3).every((r) => s.seats.some((x) => x.role === r.role)),
      neededSeats: roles.filter((r) => !s.seats.some((x) => x.role === r.role)),
    };
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  setOpeningArtwork({ asset }: { asset: any }) {
    this.player();
    const s = this.load();
    const placeId = s.world.entities.find((e) => e.id === s.world.playerId)!.location!;
    if (!s.world.artwork[placeId] && s.world.tick === 0 && asset?.id && asset?.digest) {
      s.world.artwork[placeId] = asset;
      this.save(s);
    }
    return this.getGame();
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async registerParticipant(seat: Seat) {
    this.player();
    if (!["player", "builder", "artist"].includes(seat.role) && !/^person:[\w-]+$/.test(seat.role))
      throw new Error("Unknown role");
    const s = this.load();
    s.seats = s.seats.filter((x) => x.role !== seat.role);
    s.seats.push(seat);
    this.save(s);
    if (s.pending) await this.deliver();
    return this.getGame();
  }
  @rpc({
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
    s.checkpoint = { world: structuredClone(s.world), engineSource: s.engineSource };
    s.pending = {
      id,
      text,
      phase: "player",
      replies: [],
      participants: s.world.entities
        .filter((e) => e.kind === "person" && e.id !== s.world.playerId)
        .map((e) => e.id),
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
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async retry() {
    this.player();
    const s = this.load();
    if (s.pending) {
      s.pending.attempt++;
      delete s.pending.error;
      this.save(s);
      await this.deliver();
    }
    return this.getGame();
  }
  private async deliver(): Promise<void> {
    const s = this.load();
    if (!s.pending) return;
    const pending = s.pending;
    let roles: AdventureRole[] =
      pending.phase === "participants"
        ? s.world.entities
            .filter(
              (e) =>
                e.kind === "person" &&
                pending.participants.includes(e.id) &&
                !pending.replies.includes(e.id)
            )
            .map((e) => `person:${e.id}` as AdventureRole)
        : [pending.phase];
    if (!roles.length) {
      pending.phase = "artist";
      this.save(s);
      return this.deliver();
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
        if (fresh.pending?.id === pending.id) {
          fresh.pending.error = String(error);
          this.save(fresh);
        }
      }
    }
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  participantStopped({ turnId, reason }: { turnId: string; reason?: string }) {
    const s = this.load(),
      seat = this.seat(s);
    if (s.pending?.id !== turnId) return { ok: true };
    const owesContribution =
      seat.role === s.pending.phase ||
      (s.pending.phase === "participants" &&
        seat.role.startsWith("person:") &&
        s.pending.participants.includes(seat.role.slice(7)) &&
        !s.pending.replies.includes(seat.role.slice(7)));
    if (owesContribution) {
      s.pending.error =
        reason || "The participant paused before completing this moment. Resume to continue.";
      this.save(s);
    }
    return { ok: true };
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  perspective() {
    const s = this.load(),
      seat = this.seat(s);
    if (seat.role === "builder")
      return {
        role: seat.role,
        pending: s.pending,
        world: s.world,
        engineSource: s.engineSource,
        trajectory: s.trajectory,
        checkpoint: s.checkpoint,
      };
    const actorId = seat.role.startsWith("person:") ? seat.role.slice(7) : s.world.playerId;
    return {
      role: seat.role,
      pending:
        s.pending && seat.role.startsWith("person:") ? { ...s.pending, text: "" } : s.pending,
      completedActions: s.trajectory.filter(
        (t) => t.turnId === s.pending?.id && t.role === seat.role && !t.error
      ),
      view: createWorldAPI(s.world, actorId).observe(),
      memory: createWorldAPI(s.world, actorId).recall(),
      self: s.world.entities.find((e) => e.id === actorId),
      artDirection: s.world.artDirection,
      artwork: s.world.artwork,
      imageJob: s.imageJob,
    };
  }
  @rpc({
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
      (seat.role.startsWith("person:") && s.pending.phase !== "participants")
    )
      throw new Error("Wait for your phase");
    const revision = s.world.revision;
    try {
      const result = await evaluate(
        (m, a) => this.rpc.call("main", m, a),
        s.world,
        seat.role === "player" ? s.world.playerId : seat.role.slice(7),
        code,
        s.engineSource
      );
      const fresh = this.load();
      if (fresh.world.revision !== revision || fresh.pending?.id !== turnId)
        throw new Error("World changed; reread before acting");
      result.world.revision++;
      fresh.world = result.world;
      fresh.trajectory.push({ turnId, role: seat.role, code, result: result.result });
      if (fresh.pending.continuationCode === code) delete fresh.pending.continuationCode;
      this.save(fresh);
      return result.result;
    } catch (error) {
      const fresh = this.load();
      if (fresh.pending?.id === turnId) {
        fresh.pending.diagnostic = String(error);
        delete fresh.pending.error;
        delete fresh.pending.continuationCode;
        fresh.pending.failedRole = seat.role;
        fresh.pending.phase = "builder";
        fresh.trajectory.push({ turnId, role: seat.role, code, error: String(error) });
        this.save(fresh);
        await this.deliver();
      }
      throw error;
    }
  }
  @rpc({
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
      if (text) createWorldAPI(s.world, s.world.playerId).narrate(text);
      s.pending.phase = s.world.tick === s.checkpoint?.world.tick ? "artist" : "participants";
    } else if (seat.role.startsWith("person:") && s.pending.phase === "participants") {
      const id = seat.role.slice(7);
      if (!s.pending.replies.includes(id)) s.pending.replies.push(id);
    } else throw new Error("Cannot finish this phase");
    this.save(s);
    await this.deliver();
    return this.getGame();
  }
  @rpc({
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
      true
    );
    const world = edited.world;
    const continuation =
      continuationCode ??
      [...s.trajectory].reverse().find((entry: any) => entry.error && entry.turnId === turnId)
        ?.code ??
      "return world.observe();";
    await evaluate(
      (m, a) => this.rpc.call("main", m, a),
      world,
      s.pending.failedRole?.startsWith("person:") ? s.pending.failedRole.slice(7) : world.playerId,
      continuation,
      source
    );
    const fresh = this.load();
    if (fresh.pending?.id !== turnId || fresh.world.revision !== s.world.revision)
      throw new Error("World changed during repair");
    fresh.world = world;
    fresh.world.revision++;
    fresh.engineSource = source;
    fresh.trajectory.push({ turnId, repair: note, code, continuationCode: continuation });
    fresh.pending.continuationCode = continuation;
    fresh.pending.phase = fresh.pending.failedRole?.startsWith("person:")
      ? "participants"
      : "player";
    delete fresh.pending.failedRole;
    delete fresh.pending.diagnostic;
    fresh.pending.attempt++;
    delete fresh.pending.error;
    this.save(fresh);
    await this.deliver();
    return { ok: true };
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  setImageJob(input: { turnId: string; jobId: string; placeId: string }) {
    const s = this.load();
    if (this.seat(s).role !== "artist" || s.pending?.id !== input.turnId)
      throw new Error("Only the scene artist may publish");
    s.imageJob = { id: input.jobId, placeId: input.placeId, revision: s.world.revision };
    this.save(s);
    return { ok: true };
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  publishArtwork(input: { turnId: string; asset?: any; error?: string }) {
    const s = this.load();
    if (
      this.seat(s).role !== "artist" ||
      s.pending?.id !== input.turnId ||
      s.pending.phase !== "artist"
    )
      throw new Error("No illustration pending");
    if (input.asset && s.imageJob && s.imageJob.revision === s.world.revision)
      s.world.artwork[s.imageJob.placeId] = input.asset;
    const locationId = s.world.entities.find((e) => e.id === s.world.playerId)!.location!;
    if (!input.asset && !input.error && !s.world.artwork[locationId])
      throw new Error("This place has no illustration yet. Use paint_scene before finishing.");
    if (input.error) s.trajectory.push({ turnId: input.turnId, imageError: input.error });
    s.receipts.push(s.pending.id);
    s.pending = null;
    delete s.imageJob;
    this.save(s);
    return { ok: true };
  }
}
export default {
  fetch() {
    return new Response("Adventure world");
  },
};
