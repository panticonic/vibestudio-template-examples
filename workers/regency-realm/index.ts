import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { regencyAgentRpcMethods } from "@workspace/regency-engine/agentRpc";
import type { RegencyAgentRole } from "@workspace/regency-engine/agentRpc";
import { validateScene } from "@workspace/living-canvas";
import { runPolicies } from "./policy.js";
import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import {
  initialGame,
  finishTurn,
  finished,
  ResultSchema,
  type World,
  VoiceSchema,
  type Person,
  type Voice,
  ProgramSchema,
  programsWithProposal,
  PersonSchema,
  type Proposal,
  type Game,
  validateWorld,
  validatePeople,
  DevelopmentSchema,
  type Development,
} from "@workspace/regency-engine";

type Role = RegencyAgentRole;
type Seat = { targetId: string; channelId: string; role: Role };
type Pending = {
  id: string;
  wish: string;
  started: number;
  attempt: number;
  error: string | null;
  world: World | null;
  cast: Person[];
  audience: string[];
  voices: Record<string, Voice>;
  simulation: Awaited<ReturnType<typeof runPolicies>> | null;
  proposals: Proposal[];
  command: { proposalId?: string; months: number } | null;
  development?: { request: string; requestedBy: string };
  interactions?: Record<string, { request: string; events: string[] }>;
};
type Stored = {
  game: Game;
  seats: Seat[];
  pending: Pending | null;
  painting: (Pending & { revision: number }) | null;
};

/** One durable story per key. Pending turns survive reloads and agent delivery failures. */
export class RegencyGameDO extends DurableObjectBase {
  static override schemaVersion = 4;
  protected override requiredTables() {
    return ["living_realm", "living_receipts", "story_art"];
  }
  protected createTables() {
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS story_art (id TEXT PRIMARY KEY, body TEXT NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS living_receipts (id TEXT PRIMARY KEY, wish TEXT NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS living_realm (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)",
    );
  }
  private load(): Stored {
    this.ensureReady();
    const row = this.sql
      .exec<{ body: string }>("SELECT body FROM living_realm WHERE id=1")
      .toArray()[0];
    const state: Stored = row ? JSON.parse(row.body) : { game: initialGame(), seats: [], pending: null, painting: null };
    state.game.world = validateWorld(state.game.world);
    if (state.pending?.world) state.pending.world = validateWorld(state.pending.world);
    return state;
  }
  private save(state: Stored) {
    this.sql.exec(
      "INSERT INTO living_realm(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      JSON.stringify(state),
    );
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
  artCatalog() {
    this.ensureReady();
    return Object.fromEntries(
      this.sql
        .exec<{ id: string; body: string }>("SELECT id,body FROM story_art")
        .toArray()
        .map((row) => {
          const art = JSON.parse(row.body);
          return [row.id, { path: art.path, mimeType: art.mimeType }];
        }),
    );
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
  async getArt(input: { ids: string[] }) {
    this.ensureReady();
    if (!Array.isArray(input.ids) || input.ids.length > 6)
      throw new Error("Request at most six images.");
    const entries = await Promise.all(
      input.ids.map(async (id) => {
        const row = this.sql
          .exec<{ body: string }>("SELECT body FROM story_art WHERE id=?", id)
          .toArray()[0];
        if (!row) throw new Error("Unknown artwork.");
        const art = JSON.parse(row.body);
        const data = await this.rpc.call(
          "main",
          mainRpcMethods["blobstore.getText"],
          [art.dataRef.digest],
        );
        if (data === null)
          throw new Error("The artwork could not be retrieved.");
        return [id, { path: art.path, mimeType: art.mimeType, data }];
      }),
    );
    return Object.fromEntries(entries);
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
  async storeArt(input: {
    id: string;
    path: string;
    data: string;
    mimeType: string;
  }) {
    const s = this.load();
    if (
      this.rpcCallerKind !== "do" ||
      this.rpcCallerId !==
        s.seats.find((p) => p.role === "storyteller")?.targetId
    )
      throw new Error("Only this world's artist may store artwork.");
    if (!s.pending && !s.painting)
      throw new Error("No illustration is pending.");
    if (
      !/^[a-z0-9-]{1,100}$/.test(input.id) ||
      input.mimeType !== "image/png" ||
      typeof input.data !== "string" ||
      input.data.length > 16000000 ||
      !input.data.startsWith("iVBOR")
    )
      throw new Error("Invalid PNG artwork.");
    if (
      typeof input.path !== "string" ||
      !input.path.startsWith("panels/regency/assets/generated/")
    )
      throw new Error("Artwork must use the game's asset directory.");
    const artTurn = s.painting?.id ?? s.pending?.id;
    const dataRef = await this.rpc.call(
      "main",
      mainRpcMethods["blobstore.putText"],
      [input.data],
    );
    if ((this.load().painting?.id ?? this.load().pending?.id) !== artTurn)
      throw new Error("The conversation ended before the artwork was saved.");
    this.sql.exec(
      "INSERT INTO story_art(id,body) VALUES(?,?)",
      input.id,
      JSON.stringify({
        id: input.id,
        path: input.path,
        mimeType: input.mimeType,
        dataRef,
      }),
    );
    return { ok: true };
  }
  private player() {
    if (this.rpcCallerKind === "do")
      throw new Error("Only the player may begin or cancel a turn.");
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
  getGame() {
    const s = this.load();
    const neededSeats: { role: Role; name: string }[] = s.pending?.development
      ? s.seats.some((seat) => seat.role === "builder")
        ? []
        : [{ role: "builder", name: "The realm beyond the map" }]
      : s.pending?.audience
          .filter((id) => !s.seats.some((seat) => seat.role === `person:${id}`))
          .map((id) => ({
            role: `person:${id}` as const,
            name: s.pending!.cast.find((person) => person.id === id)!.name,
          })) ?? [];
    return {
      game: s.game,
      pending: s.pending,
      painting: !!s.painting,
      seated: ["storyteller"].every((role) =>
        s.seats.some((seat) => seat.role === role),
      ),
      neededSeats,
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
  async registerParticipant(input: Seat) {
    this.player();
    if (
      !(
        input.role === "storyteller" ||
        input.role === "builder" ||
        /^person:[a-zA-Z0-9_-]+$/.test(input.role)
      ) ||
      !input.targetId ||
      !input.channelId
    )
      throw new Error("The storyteller did not arrive.");
    const s = this.load();
    s.seats = [
      ...s.seats.filter((p) => p.role !== input.role),
      {
        targetId: input.targetId,
        channelId: input.channelId,
        role: input.role,
      },
    ];
    this.save(s);
    if (s.pending) await this.deliver();
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
  async play(input: { id: string; wish: string }) {
    if (this.begin(input)) await this.deliver();
    return this.getGame();
  }
  private begin(input: { id: string; wish: string }): boolean {
    this.player();
    const s = this.load();
    if (typeof input.id !== "string" || input.id.length > 100 || !input.id)
      throw new Error("Invalid turn id.");
    if (
      typeof input.wish !== "string" ||
      !input.wish.trim() ||
      input.wish.length > 500
    )
      throw new Error("Use between 1 and 500 characters.");
    const receipt = this.sql
      .exec<{
        wish: string;
      }>("SELECT wish FROM living_receipts WHERE id=?", input.id)
      .toArray()[0];
    if (receipt) {
      if (receipt.wish !== input.wish.trim())
        throw new Error("A different wish used that turn id.");
      return false;
    }
    if (s.pending) {
      if (s.pending.id === input.id && s.pending.wish === input.wish.trim())
        return false;
      throw new Error("A moment is already unfolding.");
    }
    if (finished(s.game)) throw new Error("This story is complete.");
    if (
      !["storyteller"].every((role) =>
        s.seats.some((seat) => seat.role === role),
      )
    )
      throw new Error("Your storyteller is still arriving. Please try again.");
    const addressed = s.game.people.filter((person) =>
      new RegExp(
        "\\b" + person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
        "i",
      ).test(input.wish),
    );
    s.pending = {
      id: input.id,
      wish: input.wish.trim(),
      started: Date.now(),
      attempt: 0,
      error: null,
      world: s.game.world,
      cast: s.game.people,
      audience: addressed.length
        ? addressed.map((p) => p.id).slice(0, 3)
        : [(s.game.people.find(p => p.place === s.game.world.location) ?? s.game.people[0])!.id],
      voices: {},
      simulation: null,
      proposals: [],
      command: null,
    };
    this.save(s);
    return true;
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
  async advance(input: { id: string; months: number }) {
    return this.playerAction(
      input.id,
      "Let " + input.months + " month(s) pass and tell me what changed.",
      undefined,
      input.months,
    );
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
  async enact(input: { id: string; proposalId: string }) {
    const proposal = this.load().game.proposals.find(
      (p) => p.id === input.proposalId,
    );
    if (!proposal) throw new Error("That proposal is not available.");
    return this.playerAction(
      input.id,
      "Enact “" + proposal.title + "” as proposed.",
      input.proposalId,
      0,
    );
  }
  private async playerAction(
    id: string,
    wish: string,
    proposalId: string | undefined,
    months: number,
  ) {
    this.player();
    if (!Number.isInteger(months) || months < 0 || months > 12)
      throw new Error("Choose zero to twelve months.");
    const before = this.load();
    if (
      proposalId &&
      before.game.programs.some((p) => p.id === proposalId) &&
      !this.sql.exec("SELECT id FROM living_receipts WHERE id=?", id).toArray()
        .length
    )
      throw new Error("That policy is already active.");
    if (!this.begin({ id, wish })) return this.getGame();
    const staged = this.load();
    staged.pending!.command = { proposalId, months };
    this.save(staged);
    return this.runCommand();
  }
  private async runCommand() {
    const s = this.load(),
      { id, wish, command } = s.pending!,
      { proposalId, months } = command!,
      proposal = s.game.proposals.find((p) => p.id === proposalId);
    try {
      const result = await runPolicies(
        createMainRpcCaller(this.rpc),
        s.game.world,
        programsWithProposal(s.game.programs, proposal),
        proposalId,
        months,
      );
      const current = this.load();
      if (current.pending?.id !== id) return this.getGame();
      current.game.world = result.world;
      current.game.programs = result.programs;
      current.pending.world = result.world;
      current.pending.cast = current.game.people;
      current.pending.audience = ["mara", "ivo"].filter((id) =>
        current.game.people.some((p) => p.id === id),
      );
      current.pending.simulation = result;
      current.pending.command = null;
      this.ctx.storage.transactionSync(() => {
        this.save(current);
        this.sql.exec(
          "INSERT INTO living_receipts(id,wish) VALUES(?,?)",
          id,
          wish,
        );
      });
      await this.deliver();
    } catch (error) {
      const current = this.load();
      if (current.pending?.id === id) {
        current.pending.error = String(error);
        this.save(current);
      }
      throw error;
    }
    return this.getGame();
  }
  private async deliver() {
    const s = this.load();
    if (!s.pending || s.pending.command) return;
    const { id, attempt } = s.pending;
    const roles = s.pending.development ? ["builder"] : s.pending.audience
      .filter((id) => !s.pending!.voices[id])
      .map((id) => "person:" + id);
    const recipients = s.seats.filter((p) => roles.includes(p.role));
    const results = await Promise.allSettled(
      recipients.map((seat) =>
        this.rpc.call(seat.targetId, regencyAgentRpcMethods.receiveMoment, [
          {
            channelId: seat.channelId,
            steeringId: `regency:${this.objectKey}:${id}:${seat.role}:${attempt}`,
          },
        ]),
      ),
    );
    const errors = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    const current = this.load();
    if (
      errors.length &&
      current.pending?.id === id &&
      current.pending.attempt === attempt
    ) {
      current.pending.error = errors.map((r) => String(r.reason)).join("; ");
      this.save(current);
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
  async proposePolicy(input: {
    turnId: string;
    title: string;
    summary: string;
    code: string;
    replaces?: string;
  }) {
    const s = this.load(),
      seat = s.seats.find((p) => p.targetId === this.rpcCallerId);
    if (
      this.rpcCallerKind !== "do" ||
      !seat?.role.startsWith("person:") ||
      !s.pending ||
      s.pending.id !== input.turnId ||
      !s.pending.audience.includes(seat.role.slice(7))
    )
      throw new Error(
        "Only an advisor in this conversation may propose policy.",
      );
    const program = ProgramSchema.parse({
      id: crypto.randomUUID(),
      title: input.title,
      summary: input.summary,
      code: input.code,
      state: {},
    });
    const base = s.pending.world ?? s.game.world;
    const activePrograms = s.pending.simulation?.programs ?? s.game.programs;
    if (input.replaces && !activePrograms.some((p) => p.id === input.replaces))
      throw new Error("Choose a running policy to amend.");
    const call = createMainRpcCaller(this.rpc);
    // Compare the same three months with and without the proposed policy.
    // Both branches include existing programs, so their interactions are real.
    const without = await runPolicies(call, base, activePrograms, undefined, 3);
    const preview = await runPolicies(
      call,
      base,
      [...activePrograms.filter((p) => p.id !== input.replaces), program],
      program.id,
      3,
    );
    const current = this.load();
    if (!current.pending || current.pending.id !== input.turnId)
      throw new Error("The conversation ended before the forecast completed.");
    const changes = preview.world.ledger
      .filter(
        (item) =>
          item.amount !== base.ledger.find((p) => p.id === item.id)?.amount ||
          item.amount !==
            without.world.ledger.find((p) => p.id === item.id)?.amount,
      )
      .map((item) => {
        const alternative =
          without.world.ledger.find((p) => p.id === item.id)?.amount ?? 0;
        return (
          item.label +
          ": " +
          item.amount +
          " " +
          item.unit +
          " after 3 months (" +
          alternative +
          " without this policy)."
        );
      });
    const localChanges = preview.world.economy.regions.flatMap((region) => {
      const alternative = without.world.economy.regions.find(
        (r) => r.id === region.id,
      );
      if (!alternative || Math.abs(region.grain - alternative.grain) < 0.5)
        return [];
      const weeks = (grain: number) =>
        Math.round((grain / Math.max(1, region.consumption)) * 40) / 10;
      return [
        region.name +
          ": " +
          weeks(region.grain) +
          " weeks of local food reserves (" +
          weeks(alternative.grain) +
          " without this policy).",
      ];
    });
    const proposal = {
      ...program,
      author: seat.role.slice(7),
      ...(input.replaces ? { replaces: input.replaces } : {}),
      forecast: [
        "Forecast · next 3 months, assuming no other changes",
        ...changes,
        ...localChanges,
        ...preview.events,
      ],
    };
    current.pending.proposals.push(proposal);
    this.save(current);
    return {
      proposalId: proposal.id,
      title: proposal.title,
      forecast: proposal.forecast,
      policies: preview.world.policies,
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
  async executePolicy(input: {
    turnId: string;
    proposalId?: string;
    months: number;
  }) {
    const s = this.load();
    this.advisor(s, input.turnId);
    if (
      !s.pending ||
      s.pending.id !== input.turnId ||
      s.pending.command ||
      Object.keys(s.pending.voices).length
    )
      throw new Error("Execute an authorized policy before anyone speaks.");
    if (s.pending.simulation) return s.pending.simulation;
    if (
      !Number.isInteger(input.months) ||
      input.months < 0 ||
      input.months > 12
    )
      throw new Error("Advance between zero and twelve months.");
    const proposal = input.proposalId
      ? s.game.proposals.find((p) => p.id === input.proposalId)
      : undefined;
    if (input.proposalId && !proposal)
      throw new Error("That proposal has not been discussed with the regent.");
    if (!proposal && !input.months)
      throw new Error("Choose a discussed proposal or a duration.");
    if (proposal && s.game.programs.some((p) => p.id === proposal.id))
      throw new Error("That policy is already enacted.");
    const programs = programsWithProposal(s.game.programs, proposal);
    const result = await runPolicies(
      createMainRpcCaller(this.rpc),
      s.game.world,
      programs,
      proposal?.id,
      input.months,
    );
    const current = this.load();
    if (!current.pending || current.pending.id !== input.turnId)
      throw new Error("The conversation ended before execution completed.");
    current.pending.simulation = result;
    current.pending.world = result.world;
    this.save(current);
    return result;
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
      seat = s.seats.find((p) => p.targetId === this.rpcCallerId);
    if (this.rpcCallerKind !== "do" || !seat)
      throw new Error("Only a seated agent may read a perspective.");
    if (seat.role === "storyteller")
      return { game: s.game, pending: s.painting };
    if (seat.role === "builder") return { world: s.pending?.world ?? s.game.world, people: s.pending?.cast ?? s.game.people, pending: s.pending?.development ? s.pending : null };

    const id = seat.role.slice(7),
      you = (s.pending?.cast.length ? s.pending.cast : s.game.people).find(
        (p) => p.id === id,
      );
    return {
      you,
      proposals: s.game.proposals,
      programs: s.game.programs,
      world: s.pending?.world ?? s.game.world,
      others: (s.pending?.cast ?? s.game.people)
        .filter((p) => p.id !== id)
        .map(({ id, name, role, place }) => ({ id, name, role, place })),
      history: s.game.history.filter((e) => e.witnesses.includes(id)),
      heard: Object.entries(s.pending?.voices ?? {}).map(([id, voice]) => ({
        speaker: s.pending!.cast.find((p) => p.id === id)!.name,
        text: voice.text,
      })),
      pending: s.pending?.audience.includes(id)
        ? { id: s.pending.id, wish: s.pending.wish, development: s.pending.development, completedInteractions: s.pending.interactions ?? {} }
        : null,
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
  async speak(input: { turnId: string; voice: unknown }) {
    const s = this.load(),
      seat = s.seats.find((p) => p.targetId === this.rpcCallerId);
    if (this.rpcCallerKind !== "do" || !seat?.role.startsWith("person:"))
      throw new Error("Only the character's own agent may speak.");
    const id = seat.role.slice(7);
    if (
      !s.pending ||
      s.pending.id !== input.turnId ||
      !s.pending.audience.includes(id) ||
      s.pending.command
      || s.pending.development
    )
      throw new Error("This is not your conversation.");
    if (s.pending.voices[id]) return { ok: true };
    s.pending.voices[id] = VoiceSchema.parse(input.voice);
    const interaction = s.pending.voices[id]!.interaction;
    if (interaction) s.pending.world!.places.find(place => place.id === s.pending!.world!.location)!.interaction = interaction;
    this.save(s);
    if (s.pending.audience.every((id) => s.pending!.voices[id]))
      await this.commitConversation(s);
    else await this.deliver();
    return { ok: true };
  }
  private advisor(s: Stored, turnId: string) {
    const seat = s.seats.find((p) => p.targetId === this.rpcCallerId);
    if (
      this.rpcCallerKind !== "do" ||
      !seat?.role.startsWith("person:") ||
      s.pending?.id !== turnId ||
      !s.pending.audience.includes(seat.role.slice(7))
      || s.pending?.development
    )
      throw new Error("Only an advisor in this conversation may act.");
  }
  @rpc({ website: { kind: "closed", reason: "Installed game interaction." }, principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async requestDevelopment(input: { turnId: string; request: string }) {
    const s = this.load();
    this.advisor(s, input.turnId);
    if (!input.request?.trim() || input.request.length > 1500) throw new Error("Describe the missing part of the world.");
    if (Object.keys(s.pending!.voices).length) throw new Error("Develop the scene before speaking.");
    s.pending!.development = { request: input.request, requestedBy: this.rpcCallerId! };
    this.save(s);
    await this.deliver();
    return { waitingForBuilder: true };
  }
  @rpc({ website: { kind: "closed", reason: "Installed game interaction." }, principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async developWorld(raw: Development) {
    const input = DevelopmentSchema.parse(raw);
    const s = this.load();
    this.author(s, "builder");
    if (s.pending?.id !== input.turnId || !s.pending.development) throw new Error("No development is pending.");
    const base = s.pending.world!;
    if (new Set(input.revisions.map(r => r.id)).size !== input.revisions.length) throw new Error("Revise each mechanism at most once.");
    if (input.revisions.some(r => !base.processes.some(p => p.id === r.id))) throw new Error("Only existing mechanisms may be revised.");
    if (Object.keys(input.systems).some(key => Object.hasOwn(base.systems, key))) throw new Error("Develop a new system without replacing an existing one.");
    const economy = { ...base.economy };
    for (const key of ["regions", "routes", "institutions", "neighbors", "forces", "factions"] as const)
      Object.assign(economy, { [key]: [...base.economy[key], ...input[key]] });
    const processes = base.processes.map(process => {
      const revision = input.revisions.find(r => r.id === process.id);
      return revision ? { ...process, code: revision.code } : process;
    });
    const world = validateWorld({ ...base, economy, systems: { ...base.systems, ...input.systems }, places: [...base.places, ...input.places], processes: [...processes, ...input.processes] });
    for (const scene of input.scenes) {
      const place = world.places.find(p => p.id === scene.placeId);
      if (!place) throw new Error("A scene belongs to an established place.");
      place.interaction = scene.interaction;
    }
    const cast = validatePeople({ people: [...s.pending.cast, ...input.people], dialogue: [] }, world);
    // Validate prospective mechanisms without advancing committed time or changing old facts.
    await runPolicies(createMainRpcCaller(this.rpc), world, s.game.programs, undefined, 1);
    const current = this.load();
    if (current.pending?.id !== input.turnId || !current.pending.development || JSON.stringify(current.pending.world) !== JSON.stringify(base)) throw new Error("The world changed during development; reread it.");
    current.pending.world = world;
    current.pending.cast = cast.people;
    delete current.pending.development;
    this.save(current);
    await this.deliver();
    return { ok: true };
  }
  @rpc({ website: { kind: "closed", reason: "Installed game interaction." }, principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async visitPlace(input: { turnId: string; placeId: string }) {
    const s = this.load(); this.advisor(s, input.turnId);
    const place = s.pending!.world!.places.find(p => p.id === input.placeId);
    if (!place) throw new Error("Ask the world-builder to establish this place first.");
    if (Object.keys(s.pending!.voices).length) throw new Error("Travel before speaking.");
    s.pending!.world!.location = place.id;
    const guideId = s.seats.find(seat => seat.targetId === this.rpcCallerId)!.role.slice(7);
    const guide = s.pending!.cast.find(person => person.id === guideId)!;
    guide.place = place.id;
    const host = s.pending!.cast.find(p => p.place === place.id && p.id !== guideId);
    if (host && !s.pending!.audience.includes(host.id)) s.pending!.audience = [...s.pending!.audience, host.id].slice(-3);
    this.save(s); await this.deliver(); return { place };
  }
  @rpc({ website: {kind:"closed",reason:"Installed game interaction."}, principals:["host","user","code"], effect:{kind:"open"}, tier:"open", sensitivity:"write" })
  async interactWorld(input: { turnId: string; actionId: string; processId: string; action: string; payload: Record<string, unknown> }) {
    const s = this.load(); this.advisor(s, input.turnId);
    if (Object.keys(s.pending!.voices).length) throw new Error("Interact before speaking.");
    if (!input.actionId || input.actionId.length > 100) throw new Error("Use a stable identifier for this intended action.");
    const request = JSON.stringify({ processId: input.processId, action: input.action, payload: input.payload });
    const completed = s.pending!.interactions?.[input.actionId];
    if (completed) {
      if (completed.request !== request) throw new Error("That action identifier already belongs to a different intention.");
      return { world: s.pending!.world, events: completed.events, alreadyApplied: true };
    }
    if (!input.action?.trim() || input.action.length > 120 || JSON.stringify(input.payload).length > 4000) throw new Error("Describe a bounded scene interaction.");
    const base = s.pending!.world!;
    const result = await runPolicies(createMainRpcCaller(this.rpc), base, s.pending!.simulation?.programs ?? s.game.programs, undefined, 0, input);
    const current = this.load();
    if (current.pending?.id !== input.turnId || JSON.stringify(current.pending.world) !== JSON.stringify(base)) throw new Error("The world changed. Reread before acting.");
    current.pending.world = result.world;
    current.pending.simulation = result;
    current.game.world = result.world;
    current.game.programs = result.programs;
    current.pending.interactions ??= {};
    current.pending.interactions[input.actionId] = { request, events: result.events };
    this.save(current); return result;
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
  async consult(input: { turnId: string; advisorId: string }) {
    const s = this.load();
    this.advisor(s, input.turnId);
    if (Object.keys(s.pending!.voices).length)
      throw new Error("Invite colleagues before anyone speaks.");
    if (!s.pending!.cast.some((p) => p.id === input.advisorId))
      throw new Error("Choose an advisor from this council.");
    if (!s.pending!.audience.includes(input.advisorId)) {
      if (s.pending!.audience.length >= 3)
        throw new Error("Let these advisors finish first.");
      s.pending!.audience.push(input.advisorId);
      this.save(s);
      await this.deliver();
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
    sensitivity: "write",
  })
  async invite(input: { turnId: string; person: unknown }) {
    const s = this.load();
    this.advisor(s, input.turnId);
    if (Object.keys(s.pending!.voices).length)
      throw new Error("Invite colleagues before anyone speaks.");
    const person = PersonSchema.parse(input.person);
    if (
      !/^[a-zA-Z0-9_-]+$/.test(person.id) ||
      s.pending!.cast.some((p) => p.id === person.id)
    )
      throw new Error("Give the new advisor a unique simple id.");
    if (s.pending!.cast.length >= 24 || s.pending!.audience.length >= 3)
      throw new Error("Let the current council finish first.");
    if (!s.pending!.world!.places.some((p) => p.id === person.place))
      throw new Error("Choose an existing place for their arrival.");
    s.pending!.cast.push(person);
    s.pending!.audience.push(person.id);
    this.save(s);
    return { ok: true, advisorId: person.id };
  }
  private author(s: Stored, role: Role) {
    if (
      this.rpcCallerKind !== "do" ||
      this.rpcCallerId !== s.seats.find((p) => p.role === role)?.targetId
    )
      throw new Error("Only the registered agent for this role may write it.");
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
    if (s.pending) {
      s.pending.attempt++;
      s.pending.started = Date.now();
      s.pending.error = null;
      this.save(s);
      if (s.pending.command) return this.runCommand();
      await this.deliver();
    }
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
  cancel() {
    this.player();
    const s = this.load();
    if (s.pending) this.sql.exec("INSERT OR IGNORE INTO living_receipts(id,wish) VALUES(?,?)", s.pending.id, s.pending.wish);
    s.pending = null;
    this.save(s);
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
  async finish(input: { turnId: string; result: unknown }) {
    const s = this.load();
    this.author(s, "storyteller");
    if (
      !s.painting ||
      s.painting.id !== input.turnId ||
      s.painting.revision !== s.game.turn
    )
      return { superseded: true };
    const result = ResultSchema.parse(input.result);
    if (result.scene) {
      for (const id of result.scene.assets ?? [])
        if (
          !this.sql.exec("SELECT id FROM story_art WHERE id=?", id).toArray()
            .length
        )
          throw new Error("Save artwork before using it.");
      s.game.scene = validateScene(result.scene);
    }
    s.painting = null;
    this.save(s);
    return { ok: true };
  }
  private async commitConversation(s: Stored) {
    const p = s.pending!;
    const people = p.cast.map((person) => {
      const v = p.voices[person.id];
      return v
        ? {
            ...person,
            desire: v.desire,
            memory: [
              ...v.memory,
              ...(v.action ? ["Intention: " + v.action] : []),
            ].slice(-16),
          }
        : person;
    });
    const dialogue = p.audience.map((id) => ({
      speaker: people.find((person) => person.id === id)!.name,
      text: p.voices[id]!.text,
    }));
    const suggestions = [
      ...new Set(p.audience.flatMap((id) => p.voices[id]!.suggestions)),
    ].slice(0, 3);
    s.game = finishTurn(
      s.game,
      p.id,
      p.wish,
      { scene: null, title: s.game.title, response: "", suggestions },
      p.world!,
      { people, dialogue },
      p.audience,
    );
    s.game.programs = p.simulation?.programs ?? s.game.programs;
    s.game.proposals = [...s.game.proposals, ...p.proposals].slice(-24);
    s.pending = null;
    const visual = p.audience.some((id) => p.voices[id]!.visual);
    s.painting = visual ? { ...p, revision: s.game.turn } : null;
    this.ctx.storage.transactionSync(() => {
      this.save(s);
      this.sql.exec(
        "INSERT OR IGNORE INTO living_receipts(id,wish) VALUES(?,?)",
        p.id,
        p.wish,
      );
    });
    if (s.painting) {
      const artist = s.seats.find((seat) => seat.role === "storyteller");
      if (artist)
        await this.rpc
          .call(artist.targetId, regencyAgentRpcMethods.receiveMoment, [
            {
              channelId: artist.channelId,
              steeringId: "paint:" + this.objectKey + ":" + p.id,
            },
          ])
          .catch(() => {});
    }
  }
}
export default {
  fetch() {
    return new Response("regency story service");
  },
};
