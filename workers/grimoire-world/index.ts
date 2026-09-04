/**
 * GrimoireWorldDO — one valley, one Durable Object.
 *
 * It owns the regions (cells, flows, entities), the sky, every spell record
 * with its writing, the persistent source (wards, automata, charters,
 * workings), the spell cache (verse fingerprints → writing), the lexicon's
 * inscriptions, bargains, council cards, the undone list, festivals and the
 * news. Deterministic code here owns state and legal transitions; the
 * familiar and the spirits interpret language and request narrow methods; the
 * world authenticates every caller and enforces the spell record.
 *
 * Execution: the familiar runs its writing in its own eval sandbox and submits
 * the result with `commit`; unattended source (ward firings, automata,
 * workings, spirit acts) runs here through the eval service in this object's
 * own sandbox, or through a local executor in tests.
 *
 * Time: the world advances by ticks it owns. Casts, firings and presence make
 * it advance; with someone present it also advances on a slow idle cadence,
 * which is engine policy and never observable by a spell.
 */
import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import { createEvalExecutor } from "@vibestudio/service-schemas/eval";
import {
  bindingPrelude, BINDING_VERSION, buildScryPage, capabilitiesFor, checkIntent, composeProgram, computeAilments, CONCEPT_BY_ID, CONCEPTS,
  CREATURE_BEHAVIOURS, envelopeFor, evalCellPredicate, evaluateMilestones, familiarBriefing, findNames, formGate, generateEstate, golemSenses, applyGolemAction,
  initialUndone, LETTER, localExecutor, makeSnapshot, matchCache, MASTER_INDEX, MILESTONES, mintRecord, misfirePalette, needsCouncil, NOTEBOOKS,
  regionSummaryText, regionTitle, regionRestored, resonate, runResultFromEval, SEED_IDIOMS, smudgedHint, spiritBriefing, STARTER_WORDS, STALE_WORKINGS, STORIES,
  summariseRun, tickWorld, TRUE_NAMES, validateAndApply, VOICE, wardCells, writeNewsPage, applySubstitutions, makeRng,
  spiritChannelKey, hallChannelKey, isPersistent, explainWord,
  type Apprentice, type Bargain, type CellRef, type Concept, type CouncilCard, type Effect, type Entity, type EstateState, type FestivalId, type GateResult, type Idiom,
  type MisfireKind, type NewsPage, type Participant, type Receipt, type Region, type RegionId, type Rehearsal, type RunResult, type ScryPage, type Snapshot, type SourceExecutor,
  type SpellRecord, type SpellbookView, type TrailStage, type RegionThumb, type GolemSummary, type Spirit, type SpiritId, type Trigger, type UndoneItem, type Utterance, type Wake, type WorldIn, type WorldOut, type Overview, type Sky, type EffectEnvelope, type PersistentSpell,
} from "@workspace/grimoire-engine";

/** Idle cadence while someone is present: engine policy, not a game clock. */
const IDLE_TICK_MS = 60_000;
const DEEP_SCRIES_PER_BELL = 1;
const AUTOMATON_EVERY = 4;
const CHARTER_WAKE_EVERY = 12;

const HOURS: Record<string, [number, number]> = {
  dawn: [5, 7], noon: [11, 13], evening: [18, 20], night: [22, 24], afternoon: [14, 17], dusk: [18, 20], midnight: [0, 1], "hourly, briefly": [0, 24], "before storms": [0, 24], "autumn nights": [21, 24], "never, unless spoken to": [-1, -1], "when scrying her spells": [-1, -1],
};


export class GrimoireWorldDO extends DurableObjectBase {
  static override schemaVersion = 1;

  private state: EstateState | null | undefined;
  /** Injected in tests; otherwise the eval service in this object's own sandbox. */
  protected sourceExecutor: SourceExecutor | null = null;
  /** The idle cadence needs the server's alarm driver; tests turn it off. */
  protected idleCadence = true;
  private wakeDeliveryInFlight = false;

  protected override requiredTables(): readonly string[] {
    return ["estate", "regions", "spells", "participants", "channels", "wakes", "news", "bargains", "council", "idioms", "memory", "utterances", "pending", "notes"];
  }

  protected createTables(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS estate (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS regions (id TEXT PRIMARY KEY, region_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS spells (id TEXT PRIMARY KEY, caster TEXT NOT NULL, status TEXT NOT NULL, tier TEXT NOT NULL, fingerprint TEXT NOT NULL, created_tick INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0, shelved INTEGER NOT NULL DEFAULT 0, spell_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS spells_caster ON spells (caster, status)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS participants (role TEXT NOT NULL, channel_id TEXT NOT NULL, participant_id TEXT NOT NULL, target_id TEXT NOT NULL, handle TEXT NOT NULL, name TEXT NOT NULL, apprentice TEXT, room TEXT, PRIMARY KEY (role, channel_id))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS channels (key TEXT PRIMARY KEY, channel_id TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wakes (id TEXT PRIMARY KEY, target_id TEXT NOT NULL, channel_id TEXT NOT NULL, wake_json TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_tick INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS news (id TEXT PRIMARY KEY, tick INTEGER NOT NULL, page_json TEXT NOT NULL, read_by TEXT NOT NULL DEFAULT '[]')`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bargains (id TEXT PRIMARY KEY, spirit TEXT NOT NULL, status TEXT NOT NULL, bargain_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS council (id TEXT PRIMARY KEY, status TEXT NOT NULL, card_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS idioms (id TEXT PRIMARY KEY, idiom_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS memory (owner TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (owner, key))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS utterances (id TEXT PRIMARY KEY, by TEXT NOT NULL, to_whom TEXT, tick INTEGER NOT NULL, kind TEXT NOT NULL, verse TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pending (spell_id TEXT PRIMARY KEY, input_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS notes (apprentice TEXT NOT NULL, seq INTEGER NOT NULL, note TEXT NOT NULL, tick INTEGER NOT NULL, PRIMARY KEY (apprentice, seq))`);
  }

  // ── State persistence ──────────────────────────────────────────────────────

  private world(): EstateState | null {
    if (this.state !== undefined) return this.state;
    const row = this.sql.exec<{ state_json: string }>(`SELECT state_json FROM estate WHERE id = 1`).toArray()[0];
    if (!row) { this.state = null; return null; }
    const state = JSON.parse(row.state_json) as EstateState;
    state.regions = {} as EstateState["regions"];
    for (const r of this.sql.exec<{ id: string; region_json: string }>(`SELECT id, region_json FROM regions`).toArray()) {
      state.regions[r.id as RegionId] = JSON.parse(r.region_json) as Region;
    }
    this.state = state;
    return state;
  }

  private requireWorld(): EstateState {
    const w = this.world();
    if (!w) throw new Error("No estate has been founded yet. Call newEstate first.");
    return w;
  }

  private saveEstate(state: EstateState): void {
    const { regions: _regions, ...rest } = state;
    this.sql.exec(`INSERT INTO estate (id, state_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`, JSON.stringify(rest), new Date().toISOString());
  }

  private saveRegions(state: EstateState, ids: Iterable<RegionId>): void {
    for (const id of new Set(ids)) {
      const r = state.regions[id];
      if (r) this.sql.exec(`INSERT INTO regions (id, region_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET region_json = excluded.region_json`, id, JSON.stringify(r));
    }
  }

  private saveAll(state: EstateState): void {
    this.saveEstate(state);
    this.saveRegions(state, Object.keys(state.regions) as RegionId[]);
  }

  private nextId(prefix: string): string {
    const s = this.requireWorld();
    s.seq += 1;
    return `${prefix}-${s.seq.toString(36)}`;
  }

  // ── Spells ────────────────────────────────────────────────────────────────

  private loadSpell(id: string): SpellRecord | null {
    const row = this.sql.exec<{ spell_json: string }>(`SELECT spell_json FROM spells WHERE id = ?`, id).toArray()[0];
    return row ? (JSON.parse(row.spell_json) as SpellRecord) : null;
  }

  private requireSpell(id: string): SpellRecord {
    const s = this.loadSpell(id);
    if (!s) throw new Error(`No spell ${id}.`);
    return s;
  }

  /** One line per stage of the craft, as the circle shows them. Bounded. */
  private trail(spell: SpellRecord, stage: TrailStage, text: string): void {
    const state = this.requireWorld();
    if (!spell.trail) spell.trail = [];
    spell.trail.push({ stage, text: text.slice(0, 240), tick: state.sky.tick, seq: ++state.seq });
    if (spell.trail.length > 40) spell.trail.splice(0, spell.trail.length - 40);
  }

  private saveSpell(spell: SpellRecord, shelved?: boolean): void {
    const active = spell.persistent?.active && spell.status === "cast" ? 1 : 0;
    const prev = this.sql.exec<{ shelved: number }>(`SELECT shelved FROM spells WHERE id = ?`, spell.id).toArray()[0];
    const sh = shelved === undefined ? (prev?.shelved ?? 0) : shelved ? 1 : 0;
    this.sql.exec(
      `INSERT INTO spells (id, caster, status, tier, fingerprint, created_tick, active, shelved, spell_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET caster = excluded.caster, status = excluded.status, tier = excluded.tier, fingerprint = excluded.fingerprint, active = excluded.active, shelved = excluded.shelved, spell_json = excluded.spell_json`,
      spell.id, spell.caster, spell.status, spell.tier, spell.fingerprint, spell.createdTick, active, sh, JSON.stringify(spell),
    );
  }

  private spellsWhere(where: string, ...binds: unknown[]): SpellRecord[] {
    return this.sql.exec<{ spell_json: string }>(`SELECT spell_json FROM spells ${where}`, ...binds).toArray().map((r) => JSON.parse(r.spell_json) as SpellRecord);
  }

  private activeSpells(): SpellRecord[] {
    return this.spellsWhere(`WHERE active = 1 ORDER BY created_tick`);
  }

  private allSpells(): SpellRecord[] {
    return this.spellsWhere(`ORDER BY created_tick`);
  }

  private spellsByIndex(): Record<string, SpellRecord> {
    const out: Record<string, SpellRecord> = {};
    for (const s of this.allSpells()) out[s.id] = s;
    return out;
  }

  private allIdioms(): Idiom[] {
    const learned = this.sql.exec<{ idiom_json: string }>(`SELECT idiom_json FROM idioms`).toArray().map((r) => JSON.parse(r.idiom_json) as Idiom);
    return [...SEED_IDIOMS, ...learned];
  }

  private workingsFor(apprentice: string): Snapshot["workings"] {
    const out: Snapshot["workings"] = {};
    for (const i of this.allIdioms()) out[i.id] = { name: i.name, source: i.source, tier: "cantrip" };
    for (const s of this.spellsWhere(`WHERE caster = ? AND status = 'cast' AND spell_json LIKE '%"writing":"%'`, apprentice)) {
      if (s.writing && s.name) out[s.name] = { name: s.name, source: s.writing, tier: s.tier };
    }
    return out;
  }

  private memoryOf(owner: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const r of this.sql.exec<{ key: string; value_json: string }>(`SELECT key, value_json FROM memory WHERE owner = ?`, owner).toArray()) out[r.key] = JSON.parse(r.value_json);
    return out;
  }

  private writeMemory(owner: string, values: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(values)) this.sql.exec(`INSERT INTO memory (owner, key, value_json) VALUES (?, ?, ?) ON CONFLICT(owner, key) DO UPDATE SET value_json = excluded.value_json`, owner, k, JSON.stringify(v ?? null));
  }

  private utterancesFor(name: string | null, since = 0, limit = 40): Utterance[] {
    const rows = name
      ? this.sql.exec<Record<string, unknown>>(`SELECT * FROM utterances WHERE (by = ? OR to_whom = ?) AND tick >= ? ORDER BY tick DESC LIMIT ?`, name, name, since, limit).toArray()
      : this.sql.exec<Record<string, unknown>>(`SELECT * FROM utterances WHERE tick >= ? ORDER BY tick DESC LIMIT ?`, since, limit).toArray();
    return rows.reverse().map((r) => ({ id: r["id"] as string, by: r["by"] as string, to: (r["to_whom"] as string | null) ?? null, tick: r["tick"] as number, kind: r["kind"] as Utterance["kind"], verse: r["verse"] as string }));
  }

  private addUtterance(by: string, to: string | null, verse: string, kind: Utterance["kind"]): Utterance {
    const u: Utterance = { id: this.nextId("u"), by, to, verse, tick: this.requireWorld().sky.tick, kind };
    this.sql.exec(`INSERT INTO utterances (id, by, to_whom, tick, kind, verse) VALUES (?, ?, ?, ?, ?, ?)`, u.id, u.by, u.to, u.tick, u.kind, u.verse);
    return u;
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  private participants(): Participant[] {
    return this.sql.exec<Record<string, unknown>>(`SELECT * FROM participants`).toArray().map((r) => ({ role: r["role"] as string, channelId: r["channel_id"] as string, participantId: r["participant_id"] as string, targetId: r["target_id"] as string, handle: r["handle"] as string, name: r["name"] as string, apprentice: (r["apprentice"] as string | null) ?? null, room: (r["room"] as "circle" | "study" | null) ?? null }));
  }

  private seatOf(role: string, apprentice?: string | null, room?: "circle" | "study"): Participant | null {
    return this.participants().find((p) => p.role === role && (apprentice === undefined || p.apprentice === (apprentice ?? null)) && (room === undefined || p.room === room)) ?? null;
  }

  /** Agents are authenticated by their registered targetId; the household's own hand (panel/user) is trusted. */
  private assertSeat(role: string, apprentice?: string | null): void {
    if (this.rpcCallerKind !== "do") return;
    const id = this.rpcCallerId;
    const ok = this.participants().some((p) => p.role === role && (apprentice === undefined || p.apprentice === apprentice) && p.targetId === id);
    if (!ok) throw new Error(`This seat (${role}${apprentice ? ` for ${apprentice}` : ""}) is not yours.`);
  }

  private assertFamiliarFor(spell: SpellRecord): void {
    this.assertSeat("familiar", spell.caster);
  }

  private apprentice(id: string): Apprentice {
    const a = this.requireWorld().apprentices[id];
    if (!a) throw new Error(`No apprentice ${id} on this estate.`);
    return a;
  }

  // ── Executor ──────────────────────────────────────────────────────────────

  private executor(): SourceExecutor {
    if (this.sourceExecutor) return this.sourceExecutor;
    const run = createEvalExecutor(<T>(method: string, args: unknown[]) => this.rpc.call<T>("main", method, args));
    const viaService: SourceExecutor = async (program) => {
      const result = await run({ runId: `grimoire-world:${crypto.randomUUID()}`, source: { kind: "inline", code: program, syntax: "javascript" } });
      return runResultFromEval(result);
    };
    this.sourceExecutor = async (program) => {
      try {
        return await viaService(program);
      } catch (err) {
        // No eval service (tests, or a host without it): the local executor works wherever code generation is allowed.
        const local = await localExecutor(program);
        if (local.error && /not a constructor|Code generation|EvalError/i.test(local.error)) return { ...local, error: `the world's sandbox is unreachable: ${err instanceof Error ? err.message : String(err)}` };
        return local;
      }
    };
    return this.sourceExecutor;
  }

  private async runSource(source: string, snapshot: Snapshot): Promise<RunResult> {
    return this.executor()(composeProgram(source, snapshot));
  }

  // ── Wakes ─────────────────────────────────────────────────────────────────

  private enqueueWake(target: Participant, wake: Wake): void {
    const id = this.nextId("w");
    this.sql.exec(`INSERT INTO wakes (id, target_id, channel_id, wake_json, status, error, created_tick) VALUES (?, ?, ?, ?, 'pending', NULL, ?)`, id, target.targetId, target.channelId, JSON.stringify(wake), this.requireWorld().sky.tick);
    void this.deliverWakes();
  }

  private async deliverWakes(): Promise<{ delivered: number; failed: number }> {
    if (this.wakeDeliveryInFlight) return { delivered: 0, failed: 0 };
    this.wakeDeliveryInFlight = true;
    let delivered = 0, failed = 0;
    try {
      const rows = this.sql.exec<Record<string, unknown>>(`SELECT * FROM wakes WHERE status = 'pending' ORDER BY created_tick, id`).toArray();
      for (const r of rows) {
        try {
          await this.rpc.call(r["target_id"] as string, "receiveWake", [{ channelId: r["channel_id"], wake: JSON.parse(r["wake_json"] as string), steeringId: `grimoire:${this.objectKey}:${r["id"]}` }]);
          this.sql.exec(`UPDATE wakes SET status = 'delivered', error = NULL WHERE id = ?`, r["id"]);
          delivered++;
        } catch (err) {
          this.sql.exec(`UPDATE wakes SET status = 'failed', error = ? WHERE id = ?`, err instanceof Error ? err.message : String(err), r["id"]);
          failed++;
        }
      }
    } finally {
      this.wakeDeliveryInFlight = false;
    }
    return { delivered, failed };
  }

  private wakeFamiliar(apprentice: string, room: "circle" | "study", wake: Wake): boolean {
    const seat = this.seatOf("familiar", apprentice, room) ?? this.seatOf("familiar", apprentice);
    if (!seat) return false;
    this.enqueueWake(seat, wake);
    return true;
  }

  private wakeSpirit(spirit: SpiritId | "moor", why: string, utteranceId?: string): boolean {
    const role = spirit === "moor" ? "moor" : `spirit:${spirit}`;
    const seat = this.seatOf(role);
    if (!seat) return false;
    const state = this.requireWorld();
    const sp = state.spirits[spirit as SpiritId];
    if (!sp) return false;
    this.enqueueWake(seat, { kind: "spirit", spirit, why, briefing: this.spiritBriefingText(sp), utteranceId });
    return true;
  }

  // ── Briefings ─────────────────────────────────────────────────────────────

  private familiarBriefingText(apprentice: Apprentice, spell: SpellRecord | null): string {
    const state = this.requireWorld();
    const recent = this.spellsWhere(`WHERE caster = ? ORDER BY created_tick DESC LIMIT 4`, apprentice.id);
    const wants = Object.values(state.spirits).filter((s) => s.awake).map((s) => ({ spirit: s.title, wants: s.wants }));
    const notes = this.sql.exec<{ note: string }>(`SELECT note FROM notes WHERE apprentice = ? ORDER BY seq DESC LIMIT 4`, apprentice.id).toArray().map((r) => r.note).reverse();
    const step = this.firstHourStep(apprentice);
    return familiarBriefing(state, apprentice, spell, { regionSummary: (id) => regionSummaryText(state.regions[id]), recentSpells: recent, wants, firstHourStep: step, notes });
  }

  private spiritBriefingText(spirit: Spirit): string {
    const state = this.requireWorld();
    const near = this.spellsWhere(`ORDER BY created_tick DESC LIMIT 40`).filter((s) => s.scope.includes(spirit.anchor.region)).slice(0, 3);
    return spiritBriefing(state, spirit, { anchorSummary: regionSummaryText(state.regions[spirit.anchor.region]), recentUtterances: this.utterancesFor(spirit.id, 0, 8), recentSpells: near });
  }

  private firstHourStep(apprentice: Apprentice): number | null {
    const fh = this.firstHourState(apprentice.id);
    return fh.step >= 5 ? null : fh.step;
  }

  private firstHourState(apprentice: string): Overview["firstHour"] {
    const m = this.memoryOf(`first-hour:${apprentice}`);
    return { step: (m["step"] as number) ?? 0, hearthLit: !!m["hearthLit"], firstMisfire: !!m["firstMisfire"], firstScry: !!m["firstScry"], firstWard: !!m["firstWard"], firstEvening: !!m["firstEvening"], gardenCasts: (m["gardenCasts"] as number) ?? 0, scrySuggested: !!m["scrySuggested"] };
  }

  private setFirstHour(apprentice: string, patch: Partial<Overview["firstHour"]>): void {
    const cur = this.firstHourState(apprentice);
    this.writeMemory(`first-hour:${apprentice}`, { ...cur, ...patch });
  }

  // ── Founding ──────────────────────────────────────────────────────────────

  private newApprentice(state: EstateState, id: string, name: string): Apprentice {
    const hearth = state.regions.manor.places["circle"] ?? { x: 7, y: 8 };
    const a: Apprentice = { id, name, present: true, region: "manor", x: hearth.x, y: hearth.y, reserve: 12, reserveMax: 20, reagents: {}, words: [], names: [], foci: [{ id: "focus:staff", name: "the master's staff", concepts: ["ward"], tiers: ["ward"], regions: "estate", broken: true, madeBy: "Ysolde Marrow" }], wildWords: [], deepScriesThisBell: 0, proseInARow: 0, studyOpen: false, joinedTick: state.sky.tick, lastSeenTick: state.sky.tick };
    state.apprentices[id] = a;
    return a;
  }

  private installStaleWorkings(state: EstateState): void {
    for (const sw of STALE_WORKINGS) {
      const gate: Extract<GateResult, { ok: true }> = { ok: true, score: { meter: 1, rhyme: 0, form: 0.5, sincerity: 1, lines: sw.verse.split("\n").length, verseness: 1 }, lines: sw.verse.split("\n"), normalized: sw.verse.toLowerCase() };
      const rec = mintRecord({ id: sw.id, caster: sw.author, verse: sw.verse, gate, resonance: { entries: [], unknown: [], names: [], earned: ["whenever", "ward", "open", "water", "heat", "cold", "bind", "release", "stone", "light", "speak"], strength: 1 }, tick: 0, focus: null, scope: [sw.region, "near-moor"], reserve: 999 });
      rec.name = sw.name;
      rec.tier = sw.tier === "automaton" ? "automaton" : sw.tier === "charter" ? "charter" : "ward";
      rec.status = sw.released ? "released" : "cast";
      rec.writing = sw.source;
      rec.castTick = 0;
      rec.margin = sw.margin.map((text, i) => ({ hand: text.startsWith("—") ? "ysolde" as const : "familiar" as const, text, tick: i }));
      rec.persistent = { kind: sw.tier, trigger: sw.trigger, source: sw.source, checkpoint: null, phase: 0, golem: sw.golem ?? null, upkeep: 0, watches: [], active: !sw.released, dependsOn: [] };
      rec.etherBudget = 999;
      this.saveSpell(rec);
      if (!sw.released) state.activeSpells.push(rec.id);
      if (sw.golem && state.entities[sw.golem]) state.entities[sw.golem]!.bound = { mode: "stale", spellId: sw.id, source: sw.source, author: sw.author };
    }
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async newEstate(input: WorldIn<"newEstate">): Promise<WorldOut<"newEstate">> {
    this.ensureReady();
    const seed = input.seed ?? `estate-${Math.random().toString(36).slice(2, 10)}`;
    const state = generateEstate(seed);
    for (const t of ["estate", "regions", "spells", "channels", "wakes", "news", "bargains", "council", "idioms", "memory", "utterances", "pending", "notes"]) this.sql.exec(`DELETE FROM ${t}`);
    if (!input.keepParticipants) this.sql.exec(`DELETE FROM participants`);
    this.state = state;
    state.undone = initialUndone(0);
    for (const m of MILESTONES) state.milestones[m.id] = { done: false, tick: null };
    this.newApprentice(state, input.apprentice, input.apprenticeName);
    this.installStaleWorkings(state);
    this.recomputeAilments(state);
    this.saveAll(state);
    return { ok: true, letter: LETTER, undone: state.undone };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  joinEstate(input: WorldIn<"joinEstate">): WorldOut<"joinEstate"> {
    this.ensureReady();
    const state = this.requireWorld();
    const existing = state.apprentices[input.apprentice];
    if (existing) { existing.name = input.apprenticeName || existing.name; this.saveEstate(state); return { ok: true, isNew: false }; }
    this.newApprentice(state, input.apprentice, input.apprenticeName);
    this.saveEstate(state);
    return { ok: true, isNew: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  presence(input: WorldIn<"presence">): WorldOut<"presence"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = state.apprentices[input.apprentice];
    if (a) {
      a.present = input.present;
      a.lastSeenTick = state.sky.tick;
      if (input.region && state.regions[input.region]) {
        a.region = input.region;
        const p = Object.values(state.regions[input.region].places)[0];
        if (p) { a.x = p.x; a.y = p.y; }
      }
      this.saveEstate(state);
    }
    return { ok: true };
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  private recomputeAilments(state: EstateState): void {
    const wardCellsByRegion = new Map<RegionId, Set<number>>();
    for (const s of this.activeSpells()) {
      if (!s.id.startsWith("stale:")) continue;
      for (const r of s.scope) { if (!wardCellsByRegion.has(r)) wardCellsByRegion.set(r, new Set()); }
    }
    for (const r of Object.values(state.regions)) r.ailments = computeAilments(r, state);
  }

  /** A coarse picture of a region for the valley overview: averages over a small grid. */
  private thumbOf(r: Region): RegionThumb {
    const tw = Math.min(16, r.w), th = Math.min(10, r.h);
    const out: RegionThumb = { w: tw, h: th, water: [], rot: [], growth: [], light: [], heat: [], stone: [] };
    const L = r.layers;
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * r.w) / tw), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * r.w) / tw));
      const y0 = Math.floor((ty * r.h) / th), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * r.h) / th));
      let n = 0, water = 0, rot = 0, growth = 0, light = 0, heat = 0, stone = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * r.w + x; n++; water += L.water[i]!; rot += L.rot[i]!; growth += L.growth[i]!; light += L.light[i]!; heat += L.heat[i]!; stone += L.stone[i]!; }
      out.water.push(Math.round((water / n) * 10) / 10); out.rot.push(Math.round((rot / n) * 10) / 10); out.growth.push(Math.round((growth / n) * 10) / 10); out.light.push(Math.round((light / n) * 10) / 10); out.heat.push(Math.round((heat / n) * 10) / 10); out.stone.push(Math.round((stone / n) * 10) / 10);
    }
    return out;
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  overview(input: WorldIn<"overview"> = {}): WorldOut<"overview"> {
    this.ensureReady();
    const state = this.requireWorld();
    const active = this.activeSpells();
    const channels = this.channelsMap();
    const regions = (Object.keys(state.regions) as RegionId[]).map((id) => {
      const r = state.regions[id];
      const spirit = (Object.values(state.spirits).find((s) => s.anchor.region === id && s.id !== "echo")?.id ?? null) as SpiritId | null;
      return { id, name: r.name, w: r.w, h: r.h, ailments: r.ailments, wards: active.filter((s) => s.scope.includes(id)).length, entities: Object.values(state.entities).filter((e) => e.region === id).length, spirit, restored: regionRestored(r, state), apprentices: Object.values(state.apprentices).filter((a) => a.present && a.region === id).map((a) => a.id), thumb: this.thumbOf(r), golems: Object.values(state.entities).filter((e) => e.kind === "golem" && e.region === id).map((e) => e.name) };
    });
    const golems: GolemSummary[] = Object.values(state.entities).filter((e) => e.kind === "golem").map((e) => ({ name: e.name, body: e.sub as GolemSummary["body"], region: e.region, x: e.x, y: e.y, mode: e.bound?.mode ?? null, spellId: e.bound?.spellId ?? null, last: e.last, tired: e.tired }));
    const halls = (this.memoryOf("halls")["list"] as Overview["halls"] | undefined) ?? [];
    const unread = this.newsPages(input.apprentice ?? null).filter((p) => !p.read);
    const deliberating = this.spellsWhere(`WHERE status IN ('heard', 'deliberating', 'rehearsed') ORDER BY created_tick DESC LIMIT 6`).map((s) => ({ id: s.id, verse: s.verse, status: s.status, caster: s.caster, createdTick: s.createdTick }));
    return {
      sky: state.sky,
      regions,
      spirits: Object.values(state.spirits).filter((s) => s.id !== "echo").map((s) => ({ id: s.id, title: s.title, wants: s.wants, colour: s.colour, ornament: s.ornament, hour: s.hour, awake: s.awake, named: s.named, anchor: s.anchor, regard: s.regard, unmet: s.wantList.filter((w) => !w.met).length, trueName: s.named ? s.trueName : null, channelId: channels[spiritChannelKey(this.objectKey, s.id)] ?? null })),
      golems,
      halls,
      undone: state.undone,
      apprentices: Object.values(state.apprentices).map((a) => ({ id: a.id, name: a.name, present: a.present, region: a.region, reserve: a.reserve, reserveMax: a.reserveMax })),
      activeSpells: active.map((s) => ({ id: s.id, name: s.name, tier: s.tier, caster: s.caster, status: s.status, region: s.scope[0] ?? null, upkeep: s.persistent?.upkeep ?? 0 })),
      news: { unread: unread.length, latest: unread[0] ?? this.newsPages(input.apprentice ?? null)[0] ?? null },
      council: this.councilCards().filter((c) => c.status === "open").length,
      deliberating,
      moor: { pressure: state.moor.pressure, quiet: state.moor.quiet },
      estateName: state.estateName,
      firstHour: input.apprentice ? this.firstHourState(input.apprentice) : { step: 0, hearthLit: false, firstMisfire: false, firstScry: false, firstWard: false, firstEvening: false, gardenCasts: 0, scrySuggested: false },
    };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  region(input: WorldIn<"region">): WorldOut<"region"> {
    this.ensureReady();
    const state = this.requireWorld();
    const region = state.regions[input.id];
    if (!region) throw new Error(`No region ${input.id}.`);
    const wards = this.activeSpells().filter((s) => s.scope.includes(input.id) && (s.persistent?.kind === "ward" || s.persistent?.kind === "working")).map((s) => ({ id: s.id, name: s.name, caster: s.caster, cells: wardCells(s, region.w).slice(0, 400), stale: s.id.startsWith("stale:"), tier: s.tier }));
    return { region, entities: Object.values(state.entities).filter((e) => e.region === input.id), wards, sky: state.sky };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  spell(input: WorldIn<"spell">): WorldOut<"spell"> {
    this.ensureReady();
    return this.loadSpell(input.id);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  spellbook(input: WorldIn<"spellbook">): WorldOut<"spellbook"> {
    this.ensureReady();
    const rows = this.sql.exec<{ spell_json: string; shelved: number }>(`SELECT spell_json, shelved FROM spells WHERE caster = ? AND status IN ('cast', 'misfired', 'released', 'checkpointed') ORDER BY created_tick DESC`, input.apprentice).toArray();
    const spells = rows.map((r) => {
      const s = JSON.parse(r.spell_json) as SpellRecord;
      const receipts = s.receipts.filter((x) => x.status === "applied");
      const before: SpellbookView["spells"][number]["before"] = {}, after: SpellbookView["spells"][number]["after"] = {};
      for (const rc of receipts) { for (const [k, v] of Object.entries(rc.before ?? {})) before[k as keyof typeof before] = (before[k as keyof typeof before] ?? 0) + (v as number); for (const [k, v] of Object.entries(rc.after ?? {})) after[k as keyof typeof after] = (after[k as keyof typeof after] ?? 0) + (v as number); }
      return { id: s.id, name: s.name, verse: s.verse, lines: s.lines, tier: s.tier, status: s.status, castTick: s.castTick, variantOf: s.variantOf, fromCache: s.fromCache, caster: s.caster, region: s.scope[0] ?? null, before, after, shelved: r.shelved === 1, instant: s.status === "cast" && !!s.writing, firings: s.firings.length };
    });
    return { spells, shelved: rows.filter((r) => r.shelved === 1).map((r) => (JSON.parse(r.spell_json) as SpellRecord).id) };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  grimoire(input: WorldIn<"grimoire">): WorldOut<"grimoire"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const learned = this.memoryOf(`learned:${a.id}`);
    const known = CONCEPTS.filter((c) => a.words.includes(c.id)).map((c) => ({ ...c, learnedFrom: (learned[c.id] as string) ?? null }));
    const smudged = CONCEPTS.filter((c) => !a.words.includes(c.id) && c.root).map((c) => ({ id: c.id, family: c.family, hint: smudgedHint(c.id) }));
    const names = TRUE_NAMES.filter((n) => a.names.includes(n.name) || (n.kind === "golem" && state.entities[n.name]) || (n.kind === "place"));
    const libraryAwake = state.spirits.library?.awake;
    const openShelves = (learned["shelves"] as number) ?? 0;
    return {
      known,
      smudged,
      names,
      inscriptions: state.inscriptions,
      masterIndex: MASTER_INDEX.map((s, i) => ({ shelf: s.shelf, words: s.words, open: !!libraryAwake && i < openShelves })),
      foci: a.foci,
      bargains: this.bargains().filter((b) => b.by === a.id),
      active: this.activeSpells().filter((s) => s.caster === a.id).map((s) => ({ id: s.id, name: s.name, tier: s.tier, upkeep: s.persistent?.upkeep ?? 0, region: s.scope[0] ?? null })),
    };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  study(input: WorldIn<"study">): WorldOut<"study"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const told = (this.memoryOf(`stories:${a.id}`)["told"] as string[]) ?? [];
    const explained: Record<string, string> = {};
    for (const w of a.words) explained[w] = explainWord(w);
    return {
      notebooks: NOTEBOOKS.map((n) => ({ id: n.id, author: n.author, title: n.title, era: n.era, missingPages: n.missingPages, locked: n.locked || (n.id === "corwen" && !state.milestones["corwens-nine"]?.done), pages: n.pages.length })),
      stories: STORIES.filter((s) => told.includes(s.id) || s.year < state.sky.year),
      wordsExplained: explained,
    };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  notebook(input: WorldIn<"notebook">): WorldOut<"notebook"> {
    this.ensureReady();
    const nb = NOTEBOOKS.find((n) => n.id === input.id) ?? null;
    if (!nb) return null;
    const state = this.requireWorld();
    if (nb.locked && !state.milestones["corwens-nine"]?.done) return { ...nb, pages: nb.pages.slice(0, 1) };
    if (nb.id === "household") {
      const shelved = this.sql.exec<{ spell_json: string }>(`SELECT spell_json FROM spells WHERE shelved = 1 ORDER BY created_tick`).toArray().map((r) => JSON.parse(r.spell_json) as SpellRecord);
      return { ...nb, pages: shelved.length ? shelved.map((s, i) => ({ n: i + 1, text: `${s.name ?? "a verse"} — ${state.apprentices[s.caster]?.name ?? s.caster}`, verses: [{ lines: s.lines, about: s.name ?? "", echoable: true }], words: s.earned })) : nb.pages };
    }
    return nb;
  }

  private newsPages(apprentice: string | null): NewsPage[] {
    return this.sql.exec<{ page_json: string; read_by: string }>(`SELECT page_json, read_by FROM news ORDER BY tick DESC LIMIT 60`).toArray().map((r) => {
      const page = JSON.parse(r.page_json) as NewsPage;
      const readBy = JSON.parse(r.read_by) as string[];
      return { ...page, read: apprentice ? readBy.includes(apprentice) : page.read };
    });
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  news(input: WorldIn<"news">): WorldOut<"news"> {
    this.ensureReady();
    const pages = this.newsPages(input.apprentice).slice(0, input.limit ?? 30);
    return { pages, unread: pages.filter((p) => !p.read).length };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  acknowledgeNews(input: WorldIn<"acknowledgeNews">): WorldOut<"acknowledgeNews"> {
    this.ensureReady();
    for (const id of input.pageIds) {
      const row = this.sql.exec<{ read_by: string }>(`SELECT read_by FROM news WHERE id = ?`, id).toArray()[0];
      if (!row) continue;
      const readBy = new Set(JSON.parse(row.read_by) as string[]);
      readBy.add(input.apprentice);
      this.sql.exec(`UPDATE news SET read_by = ? WHERE id = ?`, JSON.stringify([...readBy]), id);
    }
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  undone(): WorldOut<"undone"> {
    this.ensureReady();
    return this.requireWorld().undone;
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  addUndone(input: WorldIn<"addUndone">): WorldOut<"addUndone"> {
    this.ensureReady();
    const state = this.requireWorld();
    const item: UndoneItem = { id: this.nextId("u"), text: input.text, hand: "apprentice", done: false, notes: [], region: input.region ?? null, milestone: null, addedTick: state.sky.tick, doneTick: null };
    state.undone.push(item);
    this.saveEstate(state);
    return item;
  }

  private councilCards(): CouncilCard[] {
    return this.sql.exec<{ card_json: string }>(`SELECT card_json FROM council ORDER BY rowid`).toArray().map((r) => JSON.parse(r.card_json) as CouncilCard);
  }

  private saveCard(card: CouncilCard): void {
    this.sql.exec(`INSERT INTO council (id, status, card_json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, card_json = excluded.card_json`, card.id, card.status, JSON.stringify(card));
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  council(): WorldOut<"council"> {
    this.ensureReady();
    return this.councilCards();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  festivals(): WorldOut<"festivals"> {
    this.ensureReady();
    return this.requireWorld().festivals;
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  entities(input: WorldIn<"entities"> = {}): WorldOut<"entities"> {
    this.ensureReady();
    const all = Object.values(this.requireWorld().entities);
    return input.region ? all.filter((e) => e.region === input.region) : all;
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  utterances(input: WorldIn<"utterances"> = {}): WorldOut<"utterances"> {
    this.ensureReady();
    return this.utterancesFor(input.spirit ?? input.apprentice ?? null, input.since ?? 0);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  idioms(): WorldOut<"idioms"> {
    this.ensureReady();
    return this.allIdioms();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  stories(input: WorldIn<"stories">): WorldOut<"stories"> {
    this.ensureReady();
    const state = this.requireWorld();
    const told = (this.memoryOf(`stories:${input.apprentice}`)["told"] as string[]) ?? [];
    return STORIES.filter((s) => told.includes(s.id) || s.year <= state.sky.year);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  letter(): WorldOut<"letter"> {
    this.ensureReady();
    return { text: LETTER, undone: this.requireWorld().undone };
  }

  private bargains(): Bargain[] {
    return this.sql.exec<{ bargain_json: string }>(`SELECT bargain_json FROM bargains ORDER BY rowid`).toArray().map((r) => JSON.parse(r.bargain_json) as Bargain);
  }

  private saveBargain(b: Bargain): void {
    this.sql.exec(`INSERT INTO bargains (id, spirit, status, bargain_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, bargain_json = excluded.bargain_json`, b.id, b.spirit, b.status, JSON.stringify(b));
  }

  private channelsMap(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.sql.exec<{ key: string; channel_id: string }>(`SELECT key, channel_id FROM channels`).toArray()) out[r.key] = r.channel_id;
    return out;
  }

  // ── Speaking ──────────────────────────────────────────────────────────────

  private glanceLine(state: EstateState, a: Apprentice): string {
    const rng = makeRng(`${state.seed}:glance:${a.proseInARow}:${state.sky.tick}`);
    return rng.pick(VOICE.glance);
  }

  private grantWords(a: Apprentice, words: string[], from: string): string[] {
    const gained: string[] = [];
    const learned = this.memoryOf(`learned:${a.id}`);
    for (const w of words) {
      if (!CONCEPT_BY_ID[w] || a.words.includes(w)) continue;
      a.words.push(w);
      learned[w] = from;
      gained.push(w);
    }
    if (gained.length) this.writeMemory(`learned:${a.id}`, learned);
    const state = this.requireWorld();
    for (const w of gained) if (!state.householdWords.includes(w)) state.householdWords.push(w);
    return gained;
  }

  private grantName(a: Apprentice, name: string): boolean {
    if (a.names.includes(name)) return false;
    a.names.push(name);
    const state = this.requireWorld();
    const sp = Object.values(state.spirits).find((s) => s.trueName === name);
    if (sp) sp.named = true;
    return true;
  }

  private scopeFor(state: EstateState, a: Apprentice, verse: string, resonance: ReturnType<typeof resonate>, focusCell?: CellRef): RegionId[] {
    const scope = new Set<RegionId>();
    if (focusCell && state.regions[focusCell.region]) scope.add(focusCell.region);
    // Regions named in the verse, by title or id.
    const lower = verse.toLowerCase();
    for (const r of Object.values(state.regions)) {
      const title = regionTitle(r.id).replace(/^the /, "");
      if (lower.includes(title) || lower.includes(r.id)) scope.add(r.id);
    }
    // Regions of places and spirits named.
    for (const n of resonance.names) {
      const tn = TRUE_NAMES.find((t) => t.name === n);
      if (!tn) continue;
      const sp = Object.values(state.spirits).find((s) => s.trueName === n);
      if (sp) scope.add(sp.anchor.region);
      const ent = state.entities[n];
      if (ent) scope.add(ent.region);
      for (const r of Object.values(state.regions)) for (const p of Object.values(r.places)) if (p.trueName === n) scope.add(r.id);
    }
    if (!scope.size) scope.add(a.region);
    return [...scope].slice(0, 3);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async speak(input: WorldIn<"speak">): Promise<WorldOut<"speak">> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    a.lastSeenTick = state.sky.tick;
    const room = input.room ?? "circle";
    const gate = formGate(input.verse);
    const fh = this.firstHourState(a.id);

    if (!gate.ok) {
      a.proseInARow += 1;
      let line = this.glanceLine(state, a);
      let studyOpened = false;
      if (gate.reason === "addressed-to-machinery") line = VOICE.lines.reject("addressed-to-machinery");
      if (a.proseInARow >= 3 && !a.studyOpen) { a.studyOpen = true; studyOpened = true; line = VOICE.toStudy; }
      this.saveEstate(state);
      return { kind: "gate", line, gate, studyOpened };
    }
    a.proseInARow = 0;

    // The first hour: the hearth lights on any verse-shaped speech, because the Hearth is kind.
    if (!fh.hearthLit) {
      const manor = state.regions.manor;
      const h = manor.places["hearth"]!;
      const id = this.nextId("s");
      const resonance = resonate(input.verse, { words: a.words, names: a.names, inscriptions: state.inscriptions });
      const rec = mintRecord({ id, caster: a.id, verse: input.verse, gate, resonance, tick: state.sky.tick, focus: null, scope: ["manor"], reserve: a.reserve });
      rec.tier = "charm"; rec.name = "the first fire"; rec.status = "cast"; rec.castTick = state.sky.tick; rec.etherBudget = 0;
      rec.writing = `// The hearth lights for anyone with the shape of a verse in them.\nconst h = read.places("manor").hearth;\nfor (const c of read.neighbours({ region: "manor", x: h.x, y: h.y }, 1)) effect.transmute(c, { heat: 4, light: 3 });\neffect.adorn({ region: "manor", x: h.x, y: h.y }, { kind: "glow", colour: "#e8a24a", intensity: 3, label: "the first fire" });`;
      rec.gloss = { "2": "the hearth's cell", "3": "warmth and light on the hearth and its neighbours", "4": "a glow that stays" };
      const receipts: Receipt[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = h.x + dx, y = h.y + dy; if (x < 0 || y < 0 || x >= manor.w || y >= manor.h) continue;
        const i = y * manor.w + x;
        const before = { heat: manor.layers.heat[i]!, light: manor.layers.light[i]! };
        manor.layers.heat[i] = Math.min(9, before.heat + 4); manor.layers.light[i] = Math.min(6, before.light + 3);
        receipts.push({ id: this.nextId("r"), effect: { kind: "transmute", cell: { region: "manor", x, y }, delta: { heat: 4, light: 3 } }, status: "applied", etherCost: 0, tick: state.sky.tick, before, after: { heat: manor.layers.heat[i]!, light: manor.layers.light[i]! } });
      }
      manor.adorns[String(h.y * manor.w + h.x)] = { kind: "glow", colour: "#e8a24a", intensity: 3, by: a.id, spellId: id, label: "the first fire" };
      rec.receipts = receipts;
      const rng = makeRng(`${state.seed}:hearth:${a.id}`);
      rec.margin.push({ hand: "familiar", text: rng.pick(VOICE.hearthLit), tick: state.sky.tick });
      this.trail(rec, "spoken", input.verse.split("\n")[0] ?? "");
      this.trail(rec, "cast", "the hearth lit on the shape of a verse; nine cells warmed");
      this.saveSpell(rec);
      this.grantWords(a, STARTER_WORDS, "the hearth, first hour");
      state.spirits.hearth.awake = true;
      state.spirits.hearth.wantList.find((w) => w.id === "hearth-lit")!.met = true;
      this.setFirstHour(a.id, { step: 1, hearthLit: true });
      this.recomputeAilments(state);
      this.saveEstate(state); this.saveRegions(state, ["manor"]);
      this.wakeFamiliar(a.id, room, { kind: "verse", spellId: id, apprentice: a.id, apprenticeName: a.name, verse: input.verse, room, briefing: this.familiarBriefingText(a, rec), firstHourStep: 1, scripted: "hearth" });
      return { kind: "instant", spellId: id, receipts, line: rec.margin[0]!.text };
    }

    const resonance = resonate(input.verse, { words: a.words, names: a.names, inscriptions: state.inscriptions });
    const scope = this.scopeFor(state, a, input.verse, resonance, input.focusCell);

    // The fast path: a spell you have cast is yours.
    const candidates = this.spellsWhere(`WHERE caster = ? AND status = 'cast' ORDER BY created_tick DESC LIMIT 200`, a.id).filter((s) => !!s.writing && !isPersistent(s.tier));
    const hit = matchCache(input.verse, resonance, candidates);
    if (hit) {
      const out = await this.recastInternal(a, hit.spell, hit.substitutions, input.verse, gate, resonance, scope);
      if (out.ok) return { kind: "instant", spellId: out.spellId, receipts: out.receipts, line: out.line };
    }

    const focus = a.foci.find((f) => !f.broken) ?? null;
    const id = this.nextId("s");
    const rec = mintRecord({ id, caster: a.id, verse: input.verse, gate, resonance, tick: state.sky.tick, focus, scope, reserve: a.reserve });
    rec.status = "deliberating";
    if (input.focusCell) rec.intent = null;
    this.trail(rec, "spoken", `${input.verse.split("\n")[0]} — heard as ${resonance.earned.slice(0, 5).join(", ") || "nothing certain"}${resonance.unknown.length ? `; no word for ${resonance.unknown.slice(0, 3).join(", ")}` : ""}`);
    this.saveSpell(rec);
    this.saveEstate(state);
    const step = this.firstHourStep(a);
    let scripted: "moths" | "scry" | undefined;
    if (scope.includes("garden") && !fh.firstMisfire && fh.hearthLit) {
      this.setFirstHour(a.id, { gardenCasts: fh.gardenCasts + 1 });
      if (fh.gardenCasts >= 1) scripted = "moths";
    }
    const woken = this.wakeFamiliar(a.id, room, { kind: "verse", spellId: id, apprentice: a.id, apprenticeName: a.name, verse: input.verse, room, briefing: this.familiarBriefingText(a, rec), firstHourStep: step, scripted });
    if (!woken) {
      rec.status = "heard"; rec.margin.push({ hand: "world", text: "the familiar is not at the hearth; seat it and speak again", tick: state.sky.tick }); this.saveSpell(rec);
      return { kind: "silence", spellId: id, line: "The fire is lit but nobody is sitting by it. The familiar must be seated at the circle." };
    }
    return { kind: "deliberating", spellId: id, line: undefined };
  }

  private async recastInternal(a: Apprentice, prior: SpellRecord, substitutions: Record<string, string | number>, verse: string, gate: Extract<GateResult, { ok: true }>, resonance: ReturnType<typeof resonate>, scope: RegionId[]): Promise<{ ok: boolean; spellId: string; receipts: Receipt[]; line: string; reason?: string }> {
    const state = this.requireWorld();
    const id = this.nextId("s");
    const rec = mintRecord({ id, caster: a.id, verse, gate, resonance, tick: state.sky.tick, focus: a.foci.find((f) => !f.broken) ?? null, scope: prior.scope.length ? prior.scope : scope, reserve: a.reserve });
    rec.tier = prior.tier; rec.name = prior.name; rec.intent = prior.intent ? applySubstitutions(prior.intent, substitutions) : null;
    rec.writing = prior.writing; rec.gloss = prior.gloss; rec.ancestry = [prior.id, ...prior.ancestry]; rec.variantOf = prior.id; rec.fromCache = true;
    rec.earned = [...new Set([...prior.earned, ...rec.earned])];
    let source = prior.writing ?? "";
    for (const [from, to] of Object.entries(substitutions)) source = source.split(String(from)).join(String(to));
    rec.writing = source;
    const envelope = envelopeFor(rec, a.foci.find((f) => !f.broken) ?? null);
    const snapshot = makeSnapshot(state, rec, { regions: rec.scope, fork: false, envelope, workings: this.workingsFor(a.id), utterances: this.utterancesFor(a.id, 0, 10), memory: this.memoryOf(`spell:${a.id}`) });
    const result = await this.runSource(source, snapshot);
    const outcome = validateAndApply(state, rec, result, { envelope, tick: state.sky.tick, nextId: () => this.nextId("r"), rehearsed: true });
    rec.receipts = outcome.receipts; rec.etherSpent = outcome.etherSpent; rec.castTick = state.sky.tick;
    rec.status = outcome.misfire ? "misfired" : "cast"; rec.misfire = outcome.misfire;
    this.writeMemory(`spell:${a.id}`, result.memory);
    rec.margin.push({ hand: "familiar", text: outcome.misfire ? VOICE.lines.misfire(outcome.misfire.kind) : "Yours. It did not need me.", tick: state.sky.tick });
    this.saveSpell(rec);
    this.afterEffects(state, rec, outcome.deferred);
    this.recomputeAilments(state);
    this.saveEstate(state); this.saveRegions(state, rec.scope);
    return { ok: !outcome.misfire || outcome.receipts.some((r) => r.status === "applied"), spellId: id, receipts: outcome.receipts, line: rec.margin[rec.margin.length - 1]!.text };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async recast(input: WorldIn<"recast">): Promise<WorldOut<"recast">> {
    this.ensureReady();
    const a = this.apprentice(input.apprentice);
    const prior = this.requireSpell(input.spellId);
    if (prior.caster !== a.id && !this.sql.exec<{ shelved: number }>(`SELECT shelved FROM spells WHERE id = ?`, prior.id).toArray()[0]?.shelved) return { ok: false, reason: "that verse is not yours and not on the shelf" };
    if (!prior.writing || prior.status !== "cast" || isPersistent(prior.tier)) return { ok: false, reason: "only a cast, non-persistent spell can be spoken again by hand" };
    const gate = formGate(prior.verse);
    if (!gate.ok) return { ok: false, reason: "the verse no longer has a shape" };
    const state = this.requireWorld();
    const resonance = resonate(prior.verse, { words: a.words, names: a.names, inscriptions: state.inscriptions });
    const out = await this.recastInternal(a, prior, input.substitutions ?? {}, prior.verse, gate, resonance, prior.scope);
    return { ok: out.ok, spellId: out.spellId, receipts: out.receipts, reason: out.ok ? undefined : out.line };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  release(input: WorldIn<"release">): WorldOut<"release"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const s = this.requireSpell(input.spellId);
    const canRelease = s.caster === a.id || (s.id.startsWith("stale:") && a.words.includes("release")) || a.words.includes("release") && a.names.includes(s.name ?? "");
    if (!canRelease) return { ok: false, reason: s.id.startsWith("stale:") ? "an old working needs the word for release (kaer)" : "not yours to release" };
    this.releaseSpell(state, s, a.id);
    this.saveEstate(state);
    return { ok: true };
  }

  private releaseSpell(state: EstateState, s: SpellRecord, by: string): void {
    s.status = "released";
    if (s.persistent) s.persistent.active = false;
    state.activeSpells = state.activeSpells.filter((x) => x !== s.id);
    if (s.persistent?.golem && state.entities[s.persistent.golem]) state.entities[s.persistent.golem]!.bound = null;
    // Its marks go quiet.
    for (const r of Object.values(state.regions)) for (const [k, m] of Object.entries(r.marks)) if (m.spellId === s.id) delete r.marks[k];
    s.margin.push({ hand: "familiar", text: `released by ${by}. Release is always free.`, tick: state.sky.tick });
    this.trail(s, "released", `by ${by}`);
    this.saveSpell(s);
    this.saveRegions(state, s.scope);
    // Wards that watched it.
    for (const w of this.activeSpells()) if (w.persistent?.watches.includes(s.id)) this.fireLater(w.id, { kind: "spell", spellId: s.id, event: "released" }, { released: s.id });
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  shelve(input: WorldIn<"shelve">): WorldOut<"shelve"> {
    this.ensureReady();
    const s = this.requireSpell(input.spellId);
    if (s.caster !== input.apprentice) throw new Error("only your own verses can be shelved");
    this.saveSpell(s, input.shelved);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  scry(input: WorldIn<"scry">): WorldOut<"scry"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const bellKey = `bell:${a.id}`;
    const seen = this.memoryOf(bellKey)["bell"] as number | undefined;
    if (seen !== state.sky.bell) { a.deepScriesThisBell = 0; this.writeMemory(bellKey, { bell: state.sky.bell }); }
    const deepLeft = Math.max(0, DEEP_SCRIES_PER_BELL - a.deepScriesThisBell);
    if (input.kind === "spell") {
      const s = this.loadSpell(input.ref);
      if (!s) return { error: `no spell ${input.ref}` };
      const deep = s.caster !== a.id && !s.id.startsWith("stale:");
      if (deep && !a.words.includes("scry")) return { error: "another's spell needs the word for scrying (mira)" };
      if (deep) { if (deepLeft <= 0) return { error: "one deep scry per bell hour; the bell has not rung" }; a.deepScriesThisBell += 1; }
      const casterName = state.apprentices[s.caster]?.name ?? s.caster;
      const hand: ScryPage["hand"] = s.caster === a.id ? "familiar" : s.caster === "Ysolde Marrow" ? "ysolde" : Object.values(state.spirits).some((x) => x.id === s.caster) ? "spirit" : s.caster === "moor" ? "moor" : "other";
      let echo: string | null = null;
      if (s.caster === "Ysolde Marrow" || s.id === "stale:ilvane-sluice") {
        const rng = makeRng(`${state.seed}:echo:${s.id}`);
        echo = rng.pick(VOICE.ysoldeEchoes);
        if (!s.margin.some((m) => m.hand === "ysolde")) { s.margin.push({ hand: "ysolde", text: echo, tick: state.sky.tick }); this.saveSpell(s); }
      }
      if (!this.firstHourState(a.id).firstScry) { this.setFirstHour(a.id, { firstScry: true, step: Math.max(this.firstHourState(a.id).step, 3) }); this.grantWords(a, ["more"], "the first scry"); }
      // Words borrowed: scrying another's cast spell teaches the concepts it used.
      if (s.caster !== a.id && s.status === "cast") this.grantWords(a, s.earned.filter((w) => CONCEPT_BY_ID[w]).slice(0, 2), `scrying ${s.name ?? s.id}`);
      this.saveEstate(state);
      return buildScryPage({ spell: s, casterName, hand, concepts: CONCEPT_BY_ID as Record<string, Concept>, idioms: this.allIdioms(), spells: this.spellsByIndex(), deepLeft: Math.max(0, DEEP_SCRIES_PER_BELL - a.deepScriesThisBell), echo });
    }
    if (input.kind === "entity") {
      const e = state.entities[input.ref];
      if (!e) return { error: `nothing called ${input.ref} lives here` };
      const beh = e.kind === "creature" ? CREATURE_BEHAVIOURS[e.sub as keyof typeof CREATURE_BEHAVIOURS] : null;
      const spellId = e.bound?.spellId ?? null;
      const s = spellId ? this.loadSpell(spellId) : null;
      const page = s ? buildScryPage({ spell: s, casterName: s.caster, hand: "other", concepts: CONCEPT_BY_ID as Record<string, Concept>, idioms: this.allIdioms(), spells: this.spellsByIndex(), deepLeft, echo: null }) : this.emptyPage(a, `${e.name}, ${e.sub} at ${e.region} ${e.x},${e.y}: ${e.last || "quiet"}`, deepLeft);
      page.behaviour = { name: e.name, source: beh?.source ?? (e.bound && "source" in e.bound ? e.bound.source : "· · ·"), lines: beh?.lines ?? (e.bound && "source" in e.bound ? e.bound.source.split("\n").length : 0) };
      if (e.sub === "sparrow" && !this.firstHourState(a.id).firstWard) this.grantWords(a, ["whenever", "ward"], "the sparrow, scried");
      this.saveEstate(state);
      return page;
    }
    if (input.kind === "cell") {
      const r = state.regions[(input.region ?? input.ref) as RegionId];
      if (!r || input.x === undefined || input.y === undefined) return { error: "which cell?" };
      const i = input.y * r.w + input.x;
      const mark = r.marks[String(i)];
      const s = mark ? this.loadSpell(mark.spellId) : null;
      if (s) return buildScryPage({ spell: s, casterName: s.caster, hand: s.id.startsWith("stale:") ? "ysolde" : "other", concepts: CONCEPT_BY_ID as Record<string, Concept>, idioms: this.allIdioms(), spells: this.spellsByIndex(), deepLeft, echo: null });
      const L = r.layers;
      const desc = `${r.name} ${input.x},${input.y}: heat ${L.heat[i]}, water ${L.water[i]}, stone ${L.stone[i]}, growth ${L.growth[i]} (${r.species[i] || "bare"}), light ${L.light[i]}, rot ${L.rot[i]}, ether ${L.ether[i]}, silt ${L.silt[i]}, elevation ${r.elevation[i]}${r.ley[i] ? ", on a ley line" : ""}`;
      return this.emptyPage(a, desc, deepLeft);
    }
    const sp = state.spirits[input.ref as SpiritId];
    if (!sp) return { error: `no spirit ${input.ref}` };
    const last = this.spellsWhere(`WHERE caster = ? ORDER BY created_tick DESC LIMIT 1`, sp.id)[0];
    if (last) return buildScryPage({ spell: last, casterName: sp.title, hand: "spirit", concepts: CONCEPT_BY_ID as Record<string, Concept>, idioms: this.allIdioms(), spells: this.spellsByIndex(), deepLeft, echo: null });
    return this.emptyPage(a, `${sp.title} wants ${sp.wants}; regard for you ${sp.regard[a.id] ?? 0}`, deepLeft);
  }

  private emptyPage(a: Apprentice, text: string, deepLeft: number): ScryPage {
    const state = this.requireWorld();
    const gate = formGate(text) as Extract<GateResult, { ok: true }>;
    const rec = mintRecord({ id: "scry", caster: a.id, verse: text, gate: gate.ok ? gate : { ok: true, score: { meter: 0, rhyme: 0, form: 0, sincerity: 0, lines: 1, verseness: 0 }, lines: [text], normalized: text }, resonance: { entries: [], unknown: [], names: [], earned: [], strength: 0 }, tick: state.sky.tick, focus: null, scope: [], reserve: 0 });
    rec.tier = "scry"; rec.status = "cast";
    return buildScryPage({ spell: rec, casterName: a.name, hand: "familiar", concepts: {}, idioms: [], spells: {}, deepLeft, echo: null });
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  adorn(input: WorldIn<"adorn">): WorldOut<"adorn"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const r = state.regions[input.cell.region];
    if (!r || input.cell.x < 0 || input.cell.y < 0 || input.cell.x >= r.w || input.cell.y >= r.h) return { ok: false };
    const id = this.nextId("s");
    const verse = `${input.charm.kind} at ${r.name}`;
    const rec = mintRecord({ id, caster: a.id, verse, gate: { ok: true, score: { meter: 0, rhyme: 0, form: 0, sincerity: 1, lines: 1, verseness: 0.5 }, lines: [verse], normalized: verse }, resonance: { entries: [{ concept: "adorn", confidence: 1, fromWord: input.charm.kind, viaRoot: false }], unknown: [], names: [], earned: ["adorn"], strength: 1 }, tick: state.sky.tick, focus: null, scope: [r.id], reserve: 0 });
    rec.tier = "charm"; rec.status = "cast"; rec.castTick = state.sky.tick; rec.name = input.charm.label ?? `a ${input.charm.kind}`;
    rec.writing = `effect.adorn({ region: "${r.id}", x: ${input.cell.x}, y: ${input.cell.y} }, ${JSON.stringify({ kind: input.charm.kind, colour: input.charm.colour, label: input.charm.label })});`;
    const i = input.cell.y * r.w + input.cell.x;
    r.adorns[String(i)] = { kind: input.charm.kind, colour: input.charm.colour, intensity: 2, by: a.id, spellId: id, label: input.charm.label };
    rec.receipts = [{ id: this.nextId("r"), effect: { kind: "adorn", cell: input.cell, charm: { kind: input.charm.kind, colour: input.charm.colour, label: input.charm.label } }, status: "applied", etherCost: 0, tick: state.sky.tick }];
    this.saveSpell(rec);
    this.saveRegions(state, [r.id]); this.saveEstate(state);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async seal(input: WorldIn<"seal">): Promise<WorldOut<"seal">> {
    this.ensureReady();
    const card = this.councilCards().find((c) => c.id === input.cardId);
    if (!card) return { ok: false, reason: "no such card" };
    if (card.status !== "open") return { ok: false, reason: `the card is ${card.status}` };
    if (!card.needs.includes(input.apprentice)) return { ok: false, reason: "your seal is not asked for" };
    if (!input.seal) { card.status = "withdrawn"; this.saveCard(card); const s = this.loadSpell(card.spellId); if (s) { s.status = "rejected"; s.reject = { reason: "council-required", line: "the council withheld its seal" }; this.saveSpell(s); } this.sql.exec(`DELETE FROM pending WHERE spell_id = ?`, card.spellId); return { ok: true, card }; }
    card.seals[input.apprentice] = true;
    if (card.needs.every((n) => card.seals[n])) {
      card.status = "sealed";
      this.saveCard(card);
      const row = this.sql.exec<{ input_json: string }>(`SELECT input_json FROM pending WHERE spell_id = ?`, card.spellId).toArray()[0];
      if (row) {
        const pending = JSON.parse(row.input_json) as WorldIn<"commit">;
        this.sql.exec(`DELETE FROM pending WHERE spell_id = ?`, card.spellId);
        const s = this.requireSpell(card.spellId);
        s.status = "rehearsed";
        this.saveSpell(s);
        await this.commitInternal(s, pending, true);
        card.status = "cast";
      }
    }
    this.saveCard(card);
    return { ok: true, card };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  enterFestival(input: WorldIn<"enterFestival">): WorldOut<"enterFestival"> {
    this.ensureReady();
    const state = this.requireWorld();
    if (!state.sky.festival) return { ok: false, reason: "no festival is on" };
    const s = this.requireSpell(input.spellId);
    if (s.caster !== input.apprentice) return { ok: false, reason: "not your verse" };
    const f = state.festivals.find((x) => x.id === state.sky.festival && x.year === state.sky.year);
    if (!f) return { ok: false, reason: "the bell has not rung it" };
    if (f.verdict) return { ok: false, reason: "already judged" };
    f.entries = f.entries.filter((e) => e.by !== input.apprentice);
    f.entries.push({ by: input.apprentice, spellId: s.id, verse: s.verse });
    this.saveEstate(state);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  address(input: WorldIn<"address">): WorldOut<"address"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const sp = state.spirits[input.spirit];
    if (!sp) return { ok: false, reason: "no such spirit" };
    const gate = formGate(input.verse);
    if (!gate.ok) return { ok: false, reason: "spirits turn from prose as from wind" };
    if (!sp.awake && input.spirit !== "hearth") { return { ok: false, reason: `${sp.title} has not woken; it wants ${sp.wants}` }; }
    const u = this.addUtterance(a.id, sp.id, input.verse, "speech");
    if (findNames(input.verse, a.names).includes(sp.trueName) || input.spirit === "hearth") {
      this.wakeSpirit(input.spirit, `${a.name} spoke to you by name in your channel.`, u.id);
      return { ok: true, utteranceId: u.id };
    }
    this.wakeSpirit(input.spirit, `${a.name} spoke to you without your name; you may answer briefly, or not.`, u.id);
    return { ok: true, utteranceId: u.id };
  }

  // ── The familiar's tools ──────────────────────────────────────────────────

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  hear(input: WorldIn<"hear">): WorldOut<"hear"> {
    this.ensureReady();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    const check = checkIntent(s, input.intent);
    s.intent = input.intent;
    if (check.ok) s.tier = check.tier;
    this.trail(s, "heard", `${input.intent.effect} (${input.intent.subject.kind} ${input.intent.subject.ref}${input.intent.binding ? `, ${input.intent.binding.kind} ${input.intent.binding.condition}` : ""})${input.intent.unsure.length ? ` · unsure of ${input.intent.unsure.join(", ")}` : ""}${check.ok ? "" : ` · the verse lacks ${check.lacking.join(", ")}`}`);
    this.saveSpell(s);
    return check;
  }

  private envelopeOf(s: SpellRecord): EffectEnvelope {
    const state = this.requireWorld();
    const a = state.apprentices[s.caster];
    const focus = a?.foci.find((f) => !f.broken) ?? null;
    return envelopeFor(s, focus);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  snapshot(input: WorldIn<"snapshot">): WorldOut<"snapshot"> {
    this.ensureReady();
    const state = this.requireWorld();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    const regions = [...new Set([...(s.scope), ...(input.regions ?? [])])].filter((r) => state.regions[r]).slice(0, 4);
    if (input.regions?.length) s.scope = [...new Set([...s.scope, ...regions])];
    if (!s.trail?.some((t) => t.stage === "looked")) this.trail(s, "looked", `read ${regions.map((r) => regionTitle(r)).join(", ")}`);
    this.saveSpell(s);
    return makeSnapshot(state, s, { regions, fork: input.fork ?? true, envelope: this.envelopeOf(s), workings: this.workingsFor(s.caster), utterances: this.utterancesFor(s.caster, 0, 10), memory: this.memoryOf(`spell:${s.caster}`) });
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  prelude(): WorldOut<"prelude"> {
    this.ensureReady();
    return { source: bindingPrelude(), version: BINDING_VERSION };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  rehearse(input: WorldIn<"rehearse">): WorldOut<"rehearse"> {
    this.ensureReady();
    const state = this.requireWorld();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    const snap = makeSnapshot(state, s, { regions: s.scope, fork: true, envelope: this.envelopeOf(s), workings: {}, utterances: [], memory: {} });
    const rehearsal: Rehearsal = summariseRun(input.result, snap);
    s.rehearsal = rehearsal;
    s.writing = input.source;
    if (s.status === "deliberating") s.status = "rehearsed";
    if (!s.trail?.some((t) => t.stage === "written")) this.trail(s, "written", `${input.source.split("\n").length} lines of writing`);
    this.trail(s, "rehearsed", rehearsal.ok ? `on a fork: ${rehearsal.summary}` : `the fork failed: ${rehearsal.error ?? "no effects"}`);
    this.saveSpell(s);
    return { ok: rehearsal.ok, rehearsal };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async commit(input: WorldIn<"commit">): Promise<WorldOut<"commit">> {
    this.ensureReady();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    return this.commitInternal(s, input, false);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async castHere(input: WorldIn<"castHere">): Promise<WorldOut<"castHere">> {
    this.ensureReady();
    const state = this.requireWorld();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    const snap = makeSnapshot(state, s, { regions: s.scope, fork: false, envelope: this.envelopeOf(s), workings: this.workingsFor(s.caster), utterances: this.utterancesFor(s.caster, 0, 10), memory: this.memoryOf(`spell:${s.caster}`) });
    const result = await this.runSource(input.source, snap);
    return this.commitInternal(s, { ...input, result }, false);
  }

  private async commitInternal(s: SpellRecord, input: WorldIn<"commit">, sealed: boolean): Promise<WorldOut<"commit">> {
    const state = this.requireWorld();
    const a = state.apprentices[s.caster];
    if (!a) throw new Error("the caster has left the estate");
    if (s.status === "cast" || s.status === "rejected" || s.status === "released") return { ok: false, status: s.status, receipts: [], rejected: [`the spell is already ${s.status}`], line: `That verse is already ${s.status}.` };
    const focus = a.foci.find((f) => !f.broken) ?? null;
    if (!sealed) {
      const council = needsCouncil(s, s.intent, a.foci);
      if (council.needed) {
        const card: CouncilCard = { id: this.nextId("c"), spellId: s.id, title: input.name ?? s.verse.split("\n")[0]!, summary: `${s.intent?.effect ?? "an unrehearsed working"} — ${council.reason}`, rehearsal: s.rehearsal, cost: s.etherBudget, needs: Object.keys(state.apprentices).slice(0, 2), seals: {}, status: "open", tick: state.sky.tick, reason: council.reason };
        this.saveCard(card);
        this.sql.exec(`INSERT INTO pending (spell_id, input_json) VALUES (?, ?) ON CONFLICT(spell_id) DO UPDATE SET input_json = excluded.input_json`, s.id, JSON.stringify(input));
        s.status = "sealed"; s.writing = input.source; s.name = input.name ?? s.name;
        this.trail(s, "sealed", `the council holds it: ${council.reason}`);
        s.margin.push({ hand: "familiar", text: VOICE.lines.reject("council-required"), tick: state.sky.tick });
        this.saveSpell(s);
        return { ok: false, status: "sealed", receipts: [], rejected: [council.reason], line: VOICE.lines.reject("council-required") };
      }
    }
    const envelope = envelopeFor(s, focus);
    const rehearsed = !!s.rehearsal && s.rehearsal.ok;
    // The first hour is designed shot by shot: the second cantrip in the garden misfires into moths, whatever the familiar wrote.
    const fh = this.firstHourState(a.id);
    const scriptedMoths = fh.hearthLit && !fh.firstMisfire && s.scope.includes("garden") && fh.gardenCasts >= 2 && !isPersistent(s.tier);
    const outcome = scriptedMoths
      ? { receipts: [] as Receipt[], rejected: ["the beds were warmer than the verse knew; moths"], misfire: { kind: "moths" as MisfireKind, note: "a light or heat spell mis-scoped; moths, in numbers. The first misfire is always this one." }, installed: null, etherSpent: 0, deferred: [] as Effect[] }
      : validateAndApply(state, s, input.result, { envelope, tick: state.sky.tick, nextId: () => this.nextId("r"), rehearsed });
    if (!s.trail?.some((t) => t.stage === "written")) this.trail(s, "written", `${input.source.split("\n").length} lines of writing`);
    s.writing = input.source; s.name = input.name ?? s.name; s.gloss = input.gloss ?? s.gloss; s.ancestry = input.ancestry ?? s.ancestry;
    s.receipts = outcome.receipts; s.etherSpent = outcome.etherSpent; s.castTick = state.sky.tick;
    if (input.margin) s.margin.push({ hand: "familiar", text: input.margin, tick: state.sky.tick });
    this.writeMemory(`spell:${s.caster}`, input.result.memory ?? {});
    if (outcome.misfire) {
      s.status = "misfired"; s.misfire = outcome.misfire;
      const vivid = this.vividMisfire(state, s, outcome.misfire.kind);
      s.receipts.push(...vivid);
      this.trail(s, "misfired", `${outcome.misfire.kind}: ${outcome.misfire.note}`);
      this.afterFirstMisfire(a, s);
    } else {
      s.status = "cast";
      if (outcome.installed || input.persistent) {
        const kind = input.persistent?.kind ?? outcome.installed?.kind ?? "ward";
        const p: PersistentSpell = outcome.installed ?? { kind, trigger: null, source: input.source, checkpoint: null, phase: 0, golem: input.persistent?.golem ?? null, upkeep: 1, watches: [], active: true, dependsOn: s.earned.slice() };
        p.kind = kind; p.source = input.source; p.active = true;
        if (input.persistent?.trigger) p.trigger = input.persistent.trigger;
        if (input.persistent?.golem) p.golem = input.persistent.golem;
        if (!p.trigger && kind === "ward") p.trigger = { kind: "sky", event: "tick" };
        if (p.trigger?.kind === "spell") p.watches = [...new Set([...p.watches, p.trigger.spellId])];
        s.persistent = p; s.tier = kind === "ward" ? "ward" : kind === "automaton" ? "automaton" : kind === "charter" ? "charter" : kind === "ritual" ? "ritual" : "working";
        if (!state.activeSpells.includes(s.id)) state.activeSpells.push(s.id);
        if (p.golem && state.entities[p.golem]) {
          const g = state.entities[p.golem]!;
          if (g.bound && g.bound.mode === "stale") { const old = this.loadSpell(g.bound.spellId); if (old) this.releaseSpell(state, old, s.caster); }
          g.bound = kind === "charter" ? { mode: "charter", spellId: s.id, charter: input.source } : { mode: "automaton", spellId: s.id, source: input.source };
          if (kind === "charter") this.wakeGolem(g, input.source);
        }
        // Mark the ward's cells so the map can draw it.
        const r = state.regions[s.scope[0]!];
        if (r && s.intent?.subject.rect) { const rc = s.intent.subject.rect; const cx = Math.min(r.w - 1, rc.x + Math.floor(rc.w / 2)), cy = Math.min(r.h - 1, rc.y + Math.floor(rc.h / 2)); r.marks[String(cy * r.w + cx)] = { sigil: `ward:${s.name ?? s.id}`, glow: "#c9b48a", by: s.caster, spellId: s.id }; }
      }
      if (!this.firstHourState(a.id).firstWard && s.persistent?.kind === "ward" && s.scope.includes("garden")) { this.setFirstHour(a.id, { firstWard: true, step: 4 }); this.grantWords(a, ["ward", "whenever"], "the first ward"); }
    }
    s.margin.push({ hand: "familiar", text: outcome.misfire ? VOICE.lines.misfire(outcome.misfire.kind) : s.persistent ? VOICE.lines.wardSet(s.name ?? "the ward") : VOICE.lines.cast(s.name ?? "the verse"), tick: state.sky.tick });
    if (!outcome.misfire) this.trail(s, "cast", `${outcome.receipts.filter((r) => r.status === "applied").length} changes${outcome.rejected.length ? `, ${outcome.rejected.length} refused` : ""}${s.persistent ? `; ${s.persistent.kind} installed` : ""}${s.etherSpent ? `; ${s.etherSpent} ether` : ""}`);
    this.saveSpell(s);
    this.afterEffects(state, s, outcome.deferred);
    // Words earned by a clean cast become the apprentice's.
    if (!outcome.misfire) this.grantWords(a, s.earned.filter((w) => CONCEPT_BY_ID[w] && s.resonance.entries.some((e) => e.concept === w && e.confidence >= 0.8)), `casting ${s.name ?? s.id}`);
    for (const n of s.resonance.names) this.grantName(a, n);
    this.updateUndone(state);
    this.recomputeAilments(state);
    this.saveEstate(state); this.saveRegions(state, s.scope);
    const line = s.margin[s.margin.length - 1]!.text;
    return { ok: !outcome.misfire, status: s.status, receipts: s.receipts, rejected: outcome.rejected, misfire: outcome.misfire ?? undefined, line };
  }

  /** The first misfire is a beat of the first hour: the familiar says "well", and once, suggests a scry. */
  private afterFirstMisfire(a: Apprentice, s: SpellRecord): void {
    const fh = this.firstHourState(a.id);
    if (fh.firstMisfire) return;
    this.setFirstHour(a.id, { firstMisfire: true, step: Math.max(fh.step, 2), scrySuggested: true });
    const state = this.requireWorld();
    s.margin.push({ hand: "familiar", text: VOICE.firstMisfire, tick: state.sky.tick });
    s.margin.push({ hand: "familiar", text: "Scry it, if you like. The page will show you which word I did not hear.", tick: state.sky.tick });
    this.pendingEvents.push({ kind: "first-misfire", text: `${a.name}'s first misfire: ${s.misfire?.note ?? "moths"}. The familiar said "well".`, region: s.scope[0], spell: s.id, rung: "quiet" });
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  convene(input: WorldIn<"convene">): WorldOut<"convene"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const spirits = [...new Set(input.spirits)].filter((id) => state.spirits[id] && id !== "echo");
    if (spirits.length < 2) return { ok: false, reason: "a hall needs two spirits", key: "" };
    const asleep = spirits.filter((id) => !state.spirits[id].awake);
    if (asleep.length) return { ok: false, reason: `${asleep.map((id) => state.spirits[id].title).join(" and ")} ${asleep.length === 1 ? "has" : "have"} not woken`, key: "" };
    const key = hallChannelKey(this.objectKey, spirits);
    const halls = (this.memoryOf("halls")["list"] as Array<{ key: string; spirits: SpiritId[]; topic: string; tick: number }> | undefined) ?? [];
    const next = [...halls.filter((h) => h.key !== key), { key, spirits, topic: input.topic.slice(0, 200), tick: state.sky.tick }].slice(-12);
    this.writeMemory("halls", { list: next });
    this.sql.exec(`INSERT INTO channels (key, channel_id) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET channel_id = excluded.channel_id`, key, input.channelId);
    const withRefs = spirits.map((id) => ({ spirit: id, title: state.spirits[id].title, ref: `agent:${id}@${input.channelId}` }));
    for (const id of spirits) {
      const seat = this.participants().find((p) => p.role === `spirit:${id}` && p.channelId === input.channelId) ?? this.seatOf(`spirit:${id}`);
      if (!seat) continue;
      const others = withRefs.filter((w) => w.spirit !== id);
      this.enqueueWake(seat, { kind: "spirit", spirit: id, why: `${a.name} has convened you in the hall with ${others.map((o) => o.title).join(" and ")} about: ${input.topic}. Speak to them there, in verse, and answer what they say; disagree where your wants differ. Say what you would need from the household, in one line.`, briefing: this.spiritBriefingText(state.spirits[id]), hall: { channelId: input.channelId, with: others, topic: input.topic } });
    }
    this.addUtterance(a.id, null, `convened ${spirits.map((id) => state.spirits[id].title).join(" and ")}: ${input.topic}`, "speech");
    return { ok: true, key };
  }

  private vividMisfire(state: EstateState, s: SpellRecord, kind: MisfireKind): Receipt[] {
    const a = state.apprentices[s.caster];
    const rng = makeRng(`${state.seed}:misfire:${s.id}`);
    const region = state.regions[s.scope[0] ?? a?.region ?? "manor"];
    const rect = s.intent?.subject.rect;
    const at: CellRef = rect ? { region: region.id, x: Math.min(region.w - 1, rect.x + Math.floor(rect.w / 2)), y: Math.min(region.h - 1, rect.y + Math.floor(rect.h / 2)) } : a ? { region: a.region, x: a.x, y: a.y } : { region: region.id, x: 1, y: 1 };
    const palette = misfirePalette(kind, { record: s, at, rng: () => rng.next(), nearestSigil: null, staleSpell: null });
    const receipts: Receipt[] = [];
    for (const e of palette.effects) {
      const r = state.regions[("cell" in e ? e.cell.region : "at" in e && typeof e.at === "object" ? e.at.region : region.id) as RegionId];
      if (!r) continue;
      if (e.kind === "spawn") {
        const cell = e.at;
        if (cell.x < 0 || cell.y < 0 || cell.x >= r.w || cell.y >= r.h) continue;
        const name = `${e.what}-${this.nextId("e")}`;
        if (["moth", "sparrow", "vermin", "carp", "silt-worm"].includes(e.what)) state.entities[name] = { name, kind: "creature", sub: e.what as Entity["sub"], region: r.id, x: cell.x, y: cell.y, state: {}, carrying: {}, behaviour: CREATURE_BEHAVIOURS[e.what as keyof typeof CREATURE_BEHAVIOURS]?.source ?? null, bound: null, last: "came with the misfire", tired: 0 };
        receipts.push({ id: this.nextId("r"), effect: e, status: "applied", etherCost: 0, tick: state.sky.tick });
      } else if (e.kind === "transmute") {
        const i = e.cell.y * r.w + e.cell.x;
        if (i < 0 || i >= r.w * r.h) continue;
        for (const [k, v] of Object.entries(e.delta)) { const arr = r.layers[k as keyof typeof r.layers]; if (arr) arr[i] = Math.max(0, Math.min(9, (arr[i] ?? 0) + (v as number))); }
        receipts.push({ id: this.nextId("r"), effect: e, status: "applied", etherCost: 0, tick: state.sky.tick });
      } else if (e.kind === "mark") {
        r.marks[String(e.cell.y * r.w + e.cell.x)] = { sigil: e.sigil, glow: e.glow, by: s.caster, spellId: s.id };
        receipts.push({ id: this.nextId("r"), effect: e, status: "applied", etherCost: 0, tick: state.sky.tick });
      } else if (e.kind === "adorn") {
        r.adorns[String(e.cell.y * r.w + e.cell.x)] = { ...e.charm, by: s.caster, spellId: s.id };
        receipts.push({ id: this.nextId("r"), effect: e, status: "applied", etherCost: 0, tick: state.sky.tick });
      }
    }
    s.misfire = { kind, note: palette.note };
    return receipts;
  }

  /** Effects the binding batched that become records here: speech, bargains, bindings, counter-workings, scheduled work. */
  private afterEffects(state: EstateState, s: SpellRecord, deferred: Effect[]): void {
    for (const e of deferred) {
      switch (e.kind) {
        case "speak": {
          const sp = Object.values(state.spirits).find((x) => x.trueName === e.name || x.id === e.name);
          const u = this.addUtterance(s.caster, sp?.id ?? e.name, e.verse, "speech");
          if (sp) { if (!sp.awake) sp.awake = true; this.wakeSpirit(sp.id, `${state.apprentices[s.caster]?.name ?? s.caster} spoke to you by name (spell ${s.id}).`, u.id); }
          const g = state.entities[e.name];
          if (g?.bound?.mode === "charter") this.wakeGolem(g, g.bound.charter, `${s.caster} said: ${e.verse}`);
          break;
        }
        case "bargain": {
          const sp = Object.values(state.spirits).find((x) => x.trueName === e.name || x.id === e.name);
          if (!sp) break;
          const b: Bargain = { id: this.nextId("b"), spirit: sp.id, by: s.caster, offer: e.offer, answer: null, status: "open", tick: state.sky.tick, spellId: s.id };
          this.saveBargain(b);
          s.coCasters.push(sp.id);
          this.wakeSpirit(sp.id, `A bargain is before you (${b.id}): ${JSON.stringify(e.offer)}. Answer it with answer_bargain.`);
          break;
        }
        case "against": {
          const target = this.loadSpell(e.spellId);
          if (!target) break;
          if (e.how === "release") this.releaseSpell(state, target, s.caster);
          if (e.how === "starve" && target.persistent) { target.persistent.upkeep += 5; target.etherBudget = Math.max(0, target.etherBudget - 5); target.margin.push({ hand: "familiar", text: `starved by ${s.name ?? s.id}`, tick: state.sky.tick }); this.saveSpell(target); }
          if (e.how === "redirect" && target.persistent && e.trigger) { target.persistent.trigger = e.trigger; target.margin.push({ hand: "familiar", text: `redirected by ${s.name ?? s.id}`, tick: state.sky.tick }); this.saveSpell(target); }
          target.triggeredBy = s.id; s.triggered.push(target.id); this.saveSpell(target);
          break;
        }
        case "release-golem": {
          const g = state.entities[e.golem];
          if (g?.bound) { const old = this.loadSpell(g.bound.spellId); if (old) this.releaseSpell(state, old, s.caster); g.bound = null; g.last = "released"; }
          break;
        }
        case "act": {
          const g = state.entities[e.golem];
          if (g) { const out = applyGolemAction(state, g, e.action); g.last = out.text; }
          break;
        }
        case "remember": this.writeMemory(`spell:${s.caster}`, { [e.key]: e.value }); break;
        case "at": {
          // Scheduled work: a working continuation at a tick.
          if (s.persistent) { s.persistent.trigger = { kind: "at", tick: e.tick }; s.persistent.source = e.source; s.persistent.checkpoint = e.state ?? s.persistent.checkpoint; s.persistent.active = true; if (!state.activeSpells.includes(s.id)) state.activeSpells.push(s.id); s.status = "cast"; this.saveSpell(s); }
          break;
        }
        default: break;
      }
    }
    this.saveSpell(s);
  }

  private wakeGolem(g: Entity, charter: string, note?: string): void {
    const seat = this.seatOf(`golem:${g.name}`);
    if (!seat) return;
    const state = this.requireWorld();
    const senses = golemSenses(state, g);
    const briefing = `${g.name} (${g.sub}) at ${g.region} ${g.x},${g.y}. Carrying: ${JSON.stringify(g.carrying)}. Tired ${g.tired}. Around: ${senses.around.map((c) => `${c.x},${c.y} stone${c.stone} water${c.water}`).join("; ")}. ${note ?? ""}\n${regionSummaryText(state.regions[g.region])}`;
    this.enqueueWake(seat, { kind: "golem", golem: g.name, charter, briefing });
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  reject(input: WorldIn<"reject">): WorldOut<"reject"> {
    this.ensureReady();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    s.status = "rejected"; s.reject = { reason: input.reason, line: input.line };
    s.margin.push({ hand: "familiar", text: input.line, tick: this.requireWorld().sky.tick });
    this.trail(s, "rejected", `${input.reason}: ${input.line}`);
    this.saveSpell(s);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  misfire(input: WorldIn<"misfire">): WorldOut<"misfire"> {
    this.ensureReady();
    const state = this.requireWorld();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    s.status = "misfired"; s.writing = input.source ?? s.writing;
    const receipts = this.vividMisfire(state, s, input.kind);
    s.receipts.push(...receipts);
    s.margin.push({ hand: "familiar", text: input.line, tick: state.sky.tick });
    this.trail(s, "misfired", `${input.kind}: ${s.misfire?.note ?? input.line}`);
    const a = state.apprentices[s.caster];
    if (a) this.afterFirstMisfire(a, s);
    if (input.kind === "moors-ear" && s.resonance.unknown[0]) state.moor.heardWords.push(s.resonance.unknown[0]);
    this.saveSpell(s);
    this.recomputeAilments(state);
    this.saveEstate(state); this.saveRegions(state, s.scope);
    return { ok: true, receipts };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  inscribe(input: WorldIn<"inscribe">): WorldOut<"inscribe"> {
    this.ensureReady();
    const state = this.requireWorld();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    const word = input.word.trim().toLowerCase();
    if (!word || word.length > 24) return { ok: false, reason: "not a word" };
    if (state.inscriptions.some((i) => i.word === word)) return { ok: false, reason: "already inscribed; challenge it at the council" };
    if (!CONCEPT_BY_ID[input.concept]) return { ok: false, reason: `no concept ${input.concept}` };
    state.inscriptions.push({ word, definition: input.definition, concept: input.concept, by: s.caster, verse: s.verse, firstEffect: input.firstEffect, tick: state.sky.tick });
    const a = state.apprentices[s.caster]; if (a) a.wildWords.push(word);
    this.saveEstate(state);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  remember(input: WorldIn<"remember">): WorldOut<"remember"> {
    this.ensureReady();
    this.assertSeat("familiar", input.apprentice);
    const seq = (this.sql.exec<{ n: number }>(`SELECT COALESCE(MAX(seq), 0) AS n FROM notes WHERE apprentice = ?`, input.apprentice).toArray()[0]?.n ?? 0) + 1;
    this.sql.exec(`INSERT INTO notes (apprentice, seq, note, tick) VALUES (?, ?, ?, ?)`, input.apprentice, seq, input.note.slice(0, 400), this.requireWorld().sky.tick);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  annotate(input: WorldIn<"annotate">): WorldOut<"annotate"> {
    this.ensureReady();
    const s = this.requireSpell(input.spellId);
    s.margin.push({ hand: this.rpcCallerKind === "do" ? "familiar" : "world", text: input.text, tick: this.requireWorld().sky.tick });
    this.saveSpell(s);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  glance(input: WorldIn<"glance">): WorldOut<"glance"> {
    this.ensureReady();
    const state = this.requireWorld();
    const a = this.apprentice(input.apprentice);
    const opened = a.proseInARow >= 3 && !a.studyOpen;
    if (opened) a.studyOpen = true;
    this.saveEstate(state);
    return { ok: true, studyOpened: opened };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  briefing(input: WorldIn<"briefing">): WorldOut<"briefing"> {
    this.ensureReady();
    const a = this.apprentice(input.apprentice);
    const s = input.spellId ? this.loadSpell(input.spellId) : null;
    return { text: this.familiarBriefingText(a, s) };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  promoteIdiom(input: WorldIn<"promoteIdiom">): WorldOut<"promoteIdiom"> {
    this.ensureReady();
    const s = this.requireSpell(input.spellId);
    this.assertFamiliarFor(s);
    if (!s.writing || s.status !== "cast") return { ok: false };
    const clean = s.receipts.filter((r) => r.status === "applied").length > 0 && s.firings.every((f) => !f.error);
    if (!clean) return { ok: false };
    const id = `idiom:learned:${s.id}`;
    const idiom: Idiom = { id, name: input.name, about: input.about, source: s.writing, concepts: s.earned, origin: "learned", provenance: s.id, usedBy: [] };
    this.sql.exec(`INSERT INTO idioms (id, idiom_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET idiom_json = excluded.idiom_json`, id, JSON.stringify(idiom));
    return { ok: true, idiomId: id };
  }

  // ── Spirits, golems, the Moor ─────────────────────────────────────────────

  private spiritById(id: SpiritId | "moor"): Spirit {
    const sp = this.requireWorld().spirits[id as SpiritId];
    if (!sp) throw new Error(`no spirit ${id}`);
    return sp;
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  spiritBriefing(input: WorldIn<"spiritBriefing">): WorldOut<"spiritBriefing"> {
    this.ensureReady();
    const sp = this.spiritById(input.spirit);
    return { text: this.spiritBriefingText(sp), wants: sp.wants, regard: sp.regard };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  spiritSpeak(input: WorldIn<"spiritSpeak">): WorldOut<"spiritSpeak"> {
    this.ensureReady();
    this.assertSeat(input.spirit === "moor" ? "moor" : `spirit:${input.spirit}`);
    const sp = this.spiritById(input.spirit);
    const u = this.addUtterance(sp.id, input.to, input.verse, input.kind ?? "speech");
    return { ok: true, utteranceId: u.id };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  spiritWants(input: WorldIn<"spiritWants">): WorldOut<"spiritWants"> {
    this.ensureReady();
    this.assertSeat(`spirit:${input.spirit}`);
    const state = this.requireWorld();
    this.spiritById(input.spirit).wants = input.wants.slice(0, 120);
    this.saveEstate(state);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  spiritRegard(input: WorldIn<"spiritRegard">): WorldOut<"spiritRegard"> {
    this.ensureReady();
    this.assertSeat(`spirit:${input.spirit}`);
    const state = this.requireWorld();
    const sp = this.spiritById(input.spirit);
    const next = Math.max(-3, Math.min(3, (sp.regard[input.apprentice] ?? 0) + Math.max(-2, Math.min(2, input.delta))));
    sp.regard[input.apprentice] = next;
    this.saveEstate(state);
    return { ok: true, regard: next };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  answerBargain(input: WorldIn<"answerBargain">): WorldOut<"answerBargain"> {
    this.ensureReady();
    this.assertSeat(`spirit:${input.spirit}`);
    const state = this.requireWorld();
    const b = this.bargains().find((x) => x.id === input.bargainId && x.spirit === input.spirit);
    if (!b || b.status !== "open") return { ok: false };
    b.answer = input.answer; b.status = input.accept ? "accepted" : "refused";
    const a = state.apprentices[b.by];
    if (input.accept && a) {
      for (const [k, n] of Object.entries(b.offer.give)) if (typeof n === "number" && k !== "word") a.reagents[k as keyof typeof a.reagents] = Math.max(0, (a.reagents[k as keyof typeof a.reagents] ?? 0) - n);
      if (input.give?.word && CONCEPT_BY_ID[input.give.word]) this.grantWords(a, [input.give.word], `a bargain with ${this.spiritById(input.spirit).title}`);
      if (input.give?.name) this.grantName(a, input.give.name);
      b.status = "settled";
    }
    this.saveBargain(b);
    this.addUtterance(input.spirit, b.by, input.answer, "answer");
    this.saveEstate(state);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async spiritAct(input: WorldIn<"spiritAct">): Promise<WorldOut<"spiritAct">> {
    this.ensureReady();
    const role = input.spirit === "moor" ? "moor" : `spirit:${input.spirit}`;
    this.assertSeat(role);
    const state = this.requireWorld();
    const sp = this.spiritById(input.spirit);
    if (input.spirit === "moor" && (state.sky.festival || state.moor.quiet)) return { ok: false, status: "rejected", receipts: [], rejected: ["the Moor is quiet on festival nights"], line: "Quiet, tonight." };
    const id = this.nextId("s");
    const verse = input.note || `${sp.title} acts`;
    const scope: RegionId[] = input.spirit === "moor" ? ["near-moor", "lower-reach", "grate"] : [sp.anchor.region];
    const rec = mintRecord({ id, caster: sp.id, verse, gate: { ok: true, score: { meter: 0.5, rhyme: 0, form: 0, sincerity: 1, lines: 1, verseness: 0.6 }, lines: [verse], normalized: verse }, resonance: { entries: [], unknown: [], names: [], earned: input.spirit === "moor" ? ["rot", "air", "cold", "water", "whenever", "ward"] : ["heat", "water", "stone", "growth", "air", "light", "ether", "more", "cold", "adorn", "whenever", "ward", "open", "close"], strength: 1 }, tick: state.sky.tick, focus: null, scope, reserve: sp.reserve });
    rec.tier = "cantrip"; rec.etherBudget = Math.min(sp.reserve, input.spirit === "moor" ? 6 + Math.floor(state.moor.reserve / 4) : 12);
    const envelope: EffectEnvelope = { cells: input.spirit === "moor" ? 64 : 96, ether: rec.etherBudget, regions: scope, capabilities: capabilitiesFor(rec.earned, []) };
    const snap = makeSnapshot(state, rec, { regions: scope, fork: false, envelope, workings: {}, utterances: this.utterancesFor(sp.id, 0, 6), memory: this.memoryOf(`spirit:${sp.id}`) });
    const result = await this.runSource(input.source, snap);
    // Spirits pay from their own reserve, which the ley lines refill; the world charges the caster in validateAndApply only for apprentices.
    const outcome = validateAndApply(state, rec, result, { envelope, tick: state.sky.tick, nextId: () => this.nextId("r"), rehearsed: true });
    rec.writing = input.source; rec.receipts = outcome.receipts; rec.etherSpent = outcome.etherSpent; rec.castTick = state.sky.tick; rec.status = outcome.misfire ? "misfired" : "cast"; rec.misfire = outcome.misfire;
    sp.reserve = Math.max(0, sp.reserve - outcome.etherSpent);
    rec.margin.push({ hand: "spirit", text: input.note, tick: state.sky.tick });
    this.saveSpell(rec);
    this.writeMemory(`spirit:${sp.id}`, result.memory ?? {});
    this.afterEffects(state, rec, outcome.deferred);
    this.recomputeAilments(state);
    this.saveEstate(state); this.saveRegions(state, scope);
    return { ok: !outcome.misfire, status: rec.status, receipts: rec.receipts, rejected: outcome.rejected, misfire: outcome.misfire ?? undefined, line: input.note };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  judgeFestival(input: WorldIn<"judgeFestival">): WorldOut<"judgeFestival"> {
    this.ensureReady();
    this.assertSeat(`spirit:${input.spirit}`);
    const state = this.requireWorld();
    const f = state.festivals.find((x) => `${x.id}:${x.year}` === input.festivalId || x.id === input.festivalId && !x.verdict);
    if (!f) return { ok: false };
    f.verdict = input.verdict; f.winner = input.winner; f.judge = input.spirit;
    this.addUtterance(input.spirit, null, input.verdict, "judgement");
    this.pushNews(state, [{ kind: "festival", text: `${this.spiritById(input.spirit).title} judged: ${input.verdict.split("\n")[0]}${input.winner ? ` — ${state.apprentices[input.winner]?.name ?? input.winner} won` : ""}`, rung: "inbox", by: input.spirit, hand: input.spirit, region: "green" }]);
    this.saveEstate(state);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  spiritNews(input: WorldIn<"spiritNews">): WorldOut<"spiritNews"> {
    this.ensureReady();
    this.assertSeat(input.spirit === "moor" ? "moor" : `spirit:${input.spirit}`);
    const state = this.requireWorld();
    this.pushNews(state, [{ kind: input.spirit === "moor" ? "moor" : "spirit-note", text: input.text.slice(0, 400), rung: input.rung ?? "quiet", by: input.spirit, hand: input.spirit as SpiritId, region: input.region }]);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  golemSenses(input: WorldIn<"golemSenses">): WorldOut<"golemSenses"> {
    this.ensureReady();
    const state = this.requireWorld();
    const g = state.entities[input.golem];
    if (!g || g.kind !== "golem") throw new Error(`no golem ${input.golem}`);
    return golemSenses(state, g);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  golemAct(input: WorldIn<"golemAct">): WorldOut<"golemAct"> {
    this.ensureReady();
    this.assertSeat(`golem:${input.golem}`);
    const state = this.requireWorld();
    const g = state.entities[input.golem];
    if (!g || g.kind !== "golem") return { ok: false, reason: "no such golem" };
    if (g.bound?.mode !== "charter") return { ok: false, reason: "this body is not chartered" };
    const out = applyGolemAction(state, g, input.action);
    g.last = out.text;
    const receipt: Receipt = { id: this.nextId("r"), effect: { kind: "act", golem: g.name, action: input.action }, status: out.ok ? "applied" : "rejected", reason: out.reason, etherCost: 0, tick: state.sky.tick };
    const s = this.loadSpell(g.bound.spellId);
    if (s) { const f = s.firings[s.firings.length - 1]; if (f && f.tick === state.sky.tick) f.receipts.push(receipt); else s.firings.push({ tick: state.sky.tick, receipts: [receipt], log: [] }); this.saveSpell(s); }
    this.saveEstate(state); this.saveRegions(state, [g.region]);
    return { ok: out.ok, reason: out.reason, receipt };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  golemSay(input: WorldIn<"golemSay">): WorldOut<"golemSay"> {
    this.ensureReady();
    this.assertSeat(`golem:${input.golem}`);
    const state = this.requireWorld();
    const g = state.entities[input.golem];
    if (g) { g.last = input.line.slice(0, 160); this.addUtterance(g.name, null, input.line, "speech"); this.saveEstate(state); }
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  golemNews(input: WorldIn<"golemNews">): WorldOut<"golemNews"> {
    this.ensureReady();
    this.assertSeat(`golem:${input.golem}`);
    const state = this.requireWorld();
    this.pushNews(state, [{ kind: "golem-note", text: `${input.golem}: ${input.text.slice(0, 300)}`, rung: "inbox", by: input.golem, hand: "golem", region: state.entities[input.golem]?.region }]);
    return { ok: true };
  }

  // ── Time ──────────────────────────────────────────────────────────────────

  private pendingEvents: Array<{ kind: string; text: string; region?: RegionId; entity?: string; spell?: string; rung?: "quiet" | "inbox" | "urgent"; by?: string; hand?: NewsPage["items"][number]["hand"] }> = [];

  private pushNews(state: EstateState, events: typeof this.pendingEvents): void {
    this.pendingEvents.push(...events);
    const urgent = events.some((e) => e.rung === "urgent");
    if (urgent || this.pendingEvents.length >= 12) this.flushNews(state);
  }

  private flushNews(state: EstateState): NewsPage | null {
    if (!this.pendingEvents.length) return null;
    const page = writeNewsPage(state, { events: this.pendingEvents.splice(0), spells: [], pageId: this.nextId("n"), tick: state.sky.tick });
    if (page) this.sql.exec(`INSERT INTO news (id, tick, page_json, read_by) VALUES (?, ?, ?, '[]')`, page.id, state.sky.tick, JSON.stringify(page));
    return page;
  }

  private fireLater(spellId: string, trigger: Trigger, payload: unknown): void {
    this.dueFirings.push({ spellId, trigger, payload });
  }
  private dueFirings: Array<{ spellId: string; trigger: Trigger; payload: unknown }> = [];

  private triggerMatches(state: EstateState, s: SpellRecord, skyEvents: string[]): Array<{ trigger: Trigger; payload: unknown }> {
    const p = s.persistent;
    if (!p || !p.active || !p.trigger) return [];
    const t = p.trigger;
    switch (t.kind) {
      case "sky": return skyEvents.includes(t.event) || (t.event === "tick") ? [{ trigger: t, payload: { event: t.event, tick: state.sky.tick } }] : [];
      case "at": return state.sky.tick >= t.tick ? [{ trigger: t, payload: { tick: state.sky.tick } }] : [];
      case "cell": {
        const r = state.regions[t.region];
        if (!r) return [];
        const rect = t.rect ?? { x: 0, y: 0, w: r.w, h: r.h };
        const hits: Array<{ x: number; y: number }> = [];
        for (let y = Math.max(0, rect.y); y < Math.min(r.h, rect.y + rect.h) && hits.length < 8; y++) for (let x = Math.max(0, rect.x); x < Math.min(r.w, rect.x + rect.w) && hits.length < 8; x++) {
          const i = y * r.w + x;
          const cell = { region: r.id, x, y, elevation: r.elevation[i]!, ley: r.ley[i] === 1, roofed: r.roof[i] === 1, species: (r.species[i] || null) as never, mark: r.marks[String(i)] ?? null, adorn: r.adorns[String(i)] ?? null, ...Object.fromEntries(Object.entries(r.layers).map(([k, arr]) => [k, arr[i] ?? 0])) } as never;
          if (evalCellPredicate(t.predicate, cell)) hits.push({ x, y });
        }
        return hits.length ? [{ trigger: t, payload: { region: t.region, x: hits[0]!.x, y: hits[0]!.y, cells: hits } }] : [];
      }
      case "entity": {
        const e = state.entities[t.name];
        if (!e) return [];
        const key = `${t.name}:${t.event}`;
        const seen = this.entityEventsThisTick.has(key);
        return seen ? [{ trigger: t, payload: { entity: t.name, event: t.event, x: e.x, y: e.y } }] : [];
      }
      case "speech": {
        const said = this.utterancesFor(t.name, state.sky.tick, 1);
        return said.length ? [{ trigger: t, payload: said[0] }] : [];
      }
      case "spell": return [];
    }
  }
  private entityEventsThisTick = new Set<string>();

  private async fireSpell(state: EstateState, s: SpellRecord, trigger: Trigger, payload: unknown): Promise<void> {
    const p = s.persistent!;
    const a = state.apprentices[s.caster];
    const golem = p.golem ? state.entities[p.golem] : null;
    const envelope: EffectEnvelope = { ...envelopeFor(s, a?.foci.find((f) => !f.broken) ?? null), ether: Math.max(4, s.etherBudget), regions: s.scope };
    const snap = makeSnapshot(state, s, { regions: s.scope, fork: false, envelope, workings: this.workingsFor(s.caster), utterances: [], memory: { ...this.memoryOf(`spell:${s.caster}`), consents: Object.fromEntries(Object.values(state.spirits).map((x) => [x.id, x.wantList.every((w) => w.met)])), wallStands: state.wallStands }, trigger: { spellId: s.id, trigger, payload, tick: state.sky.tick }, senses: golem ? golemSenses(state, golem) : undefined });
    let result: RunResult;
    try { result = await this.runSource(p.source, snap); } catch (err) { result = { ok: false, effects: [], log: [], error: err instanceof Error ? err.message : String(err), touched: 0, ether: 0, memory: {} }; }
    const before = p.upkeep;
    const outcome = validateAndApply(state, s, result, { envelope, tick: state.sky.tick, nextId: () => this.nextId("r"), rehearsed: true });
    const firing = { tick: state.sky.tick, receipts: outcome.receipts, log: result.log.slice(-10), error: result.error, misfire: outcome.misfire?.kind };
    s.firings.push(firing);
    if (s.firings.length > 60) s.firings.splice(0, s.firings.length - 60);
    s.etherSpent += outcome.etherSpent;
    if (p.kind !== "automaton" && !s.id.startsWith("stale:")) this.trail(s, "fired", `${outcome.receipts.filter((r) => r.status === "applied").length} changes on ${trigger.kind === "sky" ? trigger.event : trigger.kind}${outcome.misfire ? `; ${outcome.misfire.kind}` : ""}`);
    // The familiar remembers how it was done: three clean firings and the writing joins the lineage's library.
    const clean = s.firings.filter((f) => !f.error && !f.misfire && f.receipts.some((r) => r.status === "applied")).length;
    if (!s.promotedIdiom && !s.id.startsWith("stale:") && clean >= 3 && s.writing) {
      const id = `idiom:learned:${s.id}`;
      const idiom: Idiom = { id, name: s.name ?? `${s.caster}'s ${p.kind}`, about: `${s.intent?.effect ?? s.verse.split("\n")[0]} — learned from ${s.caster}'s ${p.kind} after ${clean} clean firings`, source: s.writing, concepts: s.earned, origin: "learned", provenance: s.id, usedBy: [] };
      this.sql.exec(`INSERT INTO idioms (id, idiom_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET idiom_json = excluded.idiom_json`, id, JSON.stringify(idiom));
      s.promotedIdiom = id;
      s.margin.push({ hand: "familiar", text: "I will remember how you did this. It is in the library now, in your name.", tick: state.sky.tick });
      this.trail(s, "promoted", `into the idiom library as ${idiom.name}`);
      this.pendingEvents.push({ kind: "promoted", text: `The familiar remembers how ${s.name ?? "a ward"} was done; it is in the library now.`, region: s.scope[0], spell: s.id, rung: "inbox" });
    }
    if (outcome.installed?.checkpoint !== undefined && outcome.installed && (p.kind === "working" || p.kind === "ritual")) { p.checkpoint = outcome.installed.checkpoint; p.phase = outcome.installed.phase; if (outcome.installed.trigger) p.trigger = outcome.installed.trigger; }
    if (trigger.kind === "at" && !outcome.deferred.some((e) => e.kind === "at" || e.kind === "checkpoint")) { p.active = false; state.activeSpells = state.activeSpells.filter((x) => x !== s.id); s.status = "cast"; s.margin.push({ hand: "world", text: "the working is complete", tick: state.sky.tick }); }
    if (outcome.misfire && !s.id.startsWith("stale:")) this.pendingEvents.push({ kind: "ward-misfired", text: `${s.name ?? s.id} misfired: ${outcome.misfire.note}`, region: s.scope[0], spell: s.id, rung: "inbox" });
    else if (outcome.receipts.some((r) => r.status === "applied") && p.kind !== "automaton" && !s.id.startsWith("stale:")) this.pendingEvents.push({ kind: "ward-fired", text: `${s.name ?? s.id} fired in ${regionTitle(s.scope[0] ?? "")}`, region: s.scope[0], spell: s.id, rung: "quiet" });
    p.upkeep = before;
    this.afterEffects(state, s, outcome.deferred);
    for (const w of this.activeSpells()) if (w.id !== s.id && w.persistent?.trigger?.kind === "spell" && w.persistent.trigger.spellId === s.id && w.persistent.trigger.event === (outcome.misfire ? "misfires" : "fires")) { w.triggeredBy = s.id; s.triggered.push(w.id); this.saveSpell(w); this.fireLater(w.id, w.persistent.trigger, { fired: s.id }); }
    this.saveSpell(s);
  }

  private updateUndone(state: EstateState): void {
    const spells = this.spellsWhere(`WHERE status IN ('cast', 'released') ORDER BY created_tick`);
    for (const m of evaluateMilestones(state, spells)) {
      const cur = state.milestones[m.id] ?? { done: false, tick: null };
      if (m.done && !cur.done) {
        state.milestones[m.id] = { done: true, tick: state.sky.tick };
        const ms = MILESTONES.find((x) => x.id === m.id)!;
        for (const u of state.undone) if (u.milestone === m.id && !u.done) { u.done = true; u.doneTick = state.sky.tick; this.pendingEvents.push({ kind: "undone-done", text: `Crossed out: ${u.text}`, region: u.region ?? undefined, rung: "inbox" }); }
        this.pendingEvents.push({ kind: "milestone", text: `${ms.title}: ${ms.reward}.`, region: ms.region, rung: "inbox" });
        this.onMilestone(state, m.id);
      }
    }
    // The familiar adds spirits' wants to the list in its own hand.
    for (const sp of Object.values(state.spirits)) {
      if (!sp.awake || sp.id === "echo") continue;
      for (const w of sp.wantList) {
        const id = `want:${sp.id}:${w.id}`;
        const item = state.undone.find((u) => u.id === id);
        if (!w.met && !item) state.undone.push({ id, text: `${sp.title} wants ${w.text}`, hand: "familiar", done: false, notes: [], region: sp.anchor.region, milestone: null, addedTick: state.sky.tick, doneTick: null });
        if (w.met && item && !item.done) { item.done = true; item.doneTick = state.sky.tick; }
      }
    }
  }

  /** Spirits wake and words are given when the estate confirms a working done. */
  private onMilestone(state: EstateState, id: string): void {
    const wake = (sp: SpiritId, wantId?: string) => { const s = state.spirits[sp]; if (s) { s.awake = true; if (wantId) { const w = s.wantList.find((x) => x.id === wantId); if (w) w.met = true; } } };
    switch (id) {
      case "orchard-sluice": wake("orchard", "sluice"); for (const a of Object.values(state.apprentices)) this.grantWords(a, ["sap", "while", "release"], "the Orchard, freed"); break;
      case "hot-house-quarrel": wake("hearth", "household-fed"); break;
      case "wheel": wake("mill", "turn"); wake("river", "wheel-turns"); state.spirits.river.awake = true; break;
      case "weir": wake("river", "sluices-clear"); break;
      case "library": wake("library", "shelves-dry"); for (const a of Object.values(state.apprentices)) this.writeMemory(`learned:${a.id}`, { ...this.memoryOf(`learned:${a.id}`), shelves: 2 }); break;
      case "foundry": wake("foundry", "lit"); for (const a of Object.values(state.apprentices)) { a.reagents.ash = (a.reagents.ash ?? 0) + 3; a.reagents.salt = (a.reagents.salt ?? 0) + 1; } break;
      case "bell": wake("bell", "mended"); state.sky.bellTrue = true; break;
      case "night-house": for (const a of Object.values(state.apprentices)) { a.reagents["moon-ether"] = (a.reagents["moon-ether"] ?? 0) + 1; } break;
      case "galleries": wake("deep"); break;
      case "reeds": wake("river", "carp"); break;
      case "glassworks": wake("glass", "roof"); break;
      case "cairns": wake("ridge", "cairns"); state.moor.reserve = Math.max(0, state.moor.reserve - 10); break;
      case "third-line": wake("ridge", "line"); break;
      case "corwens-nine": wake("boneyard", "nine-released"); wake("deep", "nine-quiet"); break;
      case "familiars-name": for (const a of Object.values(state.apprentices)) this.grantName(a, "Aenithil"); break;
      default: break;
    }
  }

  private spiritHourOpen(sp: Spirit, sky: Sky): boolean {
    const range = HOURS[sp.hour];
    if (!range || range[0] < 0) return false;
    if (sp.id === "ridge") return sky.forecast.some((f) => f.weather === "storm" && f.inDays <= 1);
    if (sp.id === "moor") return sky.season === "autumn" && sky.hour >= 21;
    if (sp.id === "bell") return sky.hour % 6 === 0;
    return sky.hour >= range[0] && sky.hour < range[1];
  }

  private async advanceOne(state: EstateState, reason: string): Promise<{ fired: number }> {
    const present = Object.values(state.apprentices).filter((a) => a.present);
    const activeRegions = new Set<RegionId>();
    for (const a of present) activeRegions.add(a.region);
    for (const r of Object.values(state.regions)) if (r.ailments.length || Object.values(state.entities).some((e) => e.region === r.id)) activeRegions.add(r.id);
    for (const s of this.activeSpells()) for (const r of s.scope) activeRegions.add(r);
    this.entityEventsThisTick.clear();
    const posBefore = new Map(Object.values(state.entities).map((e) => [e.name, `${e.region}:${e.x},${e.y}`]));
    const report = tickWorld(state, { activeRegions: [...activeRegions], idle: reason === "idle" });
    for (const e of Object.values(state.entities)) if (posBefore.get(e.name) !== `${e.region}:${e.x},${e.y}`) this.entityEventsThisTick.add(`${e.name}:moves`);
    for (const e of report.events) this.pendingEvents.push({ kind: e.kind, text: e.text, region: e.region, entity: e.entity, spell: e.spell, rung: e.rung });
    let fired = 0;
    // Wards and workings.
    const active = this.activeSpells();
    for (const s of active) {
      const p = s.persistent!;
      if (p.kind === "automaton") { if (state.sky.tick % AUTOMATON_EVERY !== 0) continue; await this.fireSpell(state, s, p.trigger ?? { kind: "sky", event: "tick" }, { tick: state.sky.tick }); fired++; continue; }
      if (p.kind === "charter") { const g = p.golem ? state.entities[p.golem] : null; if (g && state.sky.tick % CHARTER_WAKE_EVERY === 0) this.wakeGolem(g, p.source); continue; }
      for (const m of this.triggerMatches(state, s, report.skyEvents)) { await this.fireSpell(state, s, m.trigger, m.payload); fired++; break; }
    }
    // Wards fed by other wards.
    const due = this.dueFirings.splice(0);
    for (const d of due) { const s = this.loadSpell(d.spellId); if (s?.persistent?.active) { await this.fireSpell(state, s, d.trigger, d.payload); fired++; } }
    // Festivals begin.
    if (report.skyEvents.includes("festival") && state.sky.festival) {
      const judge: Record<FestivalId, SpiritId> = { "first-sap": "hearth", midsummer: "glass", "first-frost": "foundry", "long-dark": "ridge" };
      if (!state.festivals.some((f) => f.id === state.sky.festival && f.year === state.sky.year)) {
        state.festivals.push({ id: state.sky.festival, year: state.sky.year, judge: judge[state.sky.festival], entries: [], verdict: null, winner: null, tick: state.sky.tick });
        state.moor.quiet = true;
        this.pendingEvents.push({ kind: "festival", text: `${state.sky.festival} is rung; the green is open. ${state.spirits[judge[state.sky.festival]].title} judges.`, rung: "inbox", region: "green" });
      }
    } else if (!state.sky.festival && state.moor.quiet) {
      state.moor.quiet = false;
      const f = state.festivals[state.festivals.length - 1];
      if (f && !f.verdict) this.wakeSpirit(f.judge, `The festival ${f.id} is over. Judge its entries with judge_festival (festivalId "${f.id}:${f.year}"): ${f.entries.map((e) => `${e.by}: ${e.verse.replace(/\n/g, " / ")}`).join(" || ") || "no entries; say so, briefly"}.`);
    }
    // Spirits at their hour, once a day, when something is before them.
    for (const sp of Object.values(state.spirits)) {
      if (!sp.awake || sp.id === "echo") continue;
      if (!this.spiritHourOpen(sp, state.sky)) continue;
      const key = `spirit-woken:${sp.id}`;
      const last = this.memoryOf(key)["day"] as string | undefined;
      const today = `${state.sky.year}:${state.sky.season}:${state.sky.day}`;
      if (last === today) continue;
      const said = this.utterancesFor(sp.id, state.sky.tick - 48, 3).filter((u) => u.to === sp.id);
      const bargains = this.bargains().filter((b) => b.spirit === sp.id && b.status === "open");
      if (!said.length && !bargains.length && state.sky.tick % 96 !== 0) continue;
      this.writeMemory(key, { day: today });
      this.wakeSpirit(sp.id, said.length ? "The household spoke to you." : bargains.length ? `A bargain waits: ${bargains[0]!.id}.` : "It is your hour. Say what you want, in a line, and act if a want of yours has been met.");
    }
    // The Moor's own turn.
    if (state.sky.season === "autumn" && state.sky.hour === 22 && !state.sky.festival && state.sky.year >= 1) {
      const key = "moor-woken"; const today = `${state.sky.year}:${state.sky.day}`;
      if (this.memoryOf(key)["day"] !== today) { this.writeMemory(key, { day: today }); state.spirits.moor.awake = true; this.wakeSpirit("moor", "Autumn night. Act on the valley through the wind and the grate, patiently; scry only what your own spells touched."); }
    }
    // Stories at the bell hour.
    if (state.sky.hour === 21) {
      for (const a of present) {
        const told = (this.memoryOf(`stories:${a.id}`)["told"] as string[]) ?? [];
        const next = STORIES.find((s) => !told.includes(s.id) && s.year <= state.sky.year);
        const fh = this.firstHourState(a.id);
        if (next && (fh.firstWard || told.length)) {
          if (this.wakeFamiliar(a.id, "study", { kind: "story", apprentice: a.id, apprenticeName: a.name, storyId: next.id, briefing: this.familiarBriefingText(a, null) })) {
            this.writeMemory(`stories:${a.id}`, { told: [...told, next.id] });
            if (!fh.firstEvening) this.setFirstHour(a.id, { firstEvening: true, step: 5 });
          }
        }
      }
    }
    this.updateUndone(state);
    // A page a day.
    if (state.sky.hour === 0 || this.pendingEvents.some((e) => e.rung === "urgent")) this.flushNews(state);
    return { fired };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async advance(input: WorldIn<"advance"> = {}): Promise<WorldOut<"advance">> {
    this.ensureReady();
    const state = this.requireWorld();
    const n = Math.max(1, Math.min(96, input.ticks ?? 1));
    let fired = 0;
    const touched = new Set<RegionId>();
    for (let i = 0; i < n; i++) {
      const before = state.sky.tick;
      const out = await this.advanceOne(state, input.reason ?? "advance");
      fired += out.fired;
      if (state.sky.tick === before) state.sky.tick++;
    }
    this.recomputeAilments(state);
    const newsBefore = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM news`).toArray()[0]?.n ?? 0;
    if (n >= 24) this.flushNews(state);
    for (const id of Object.keys(state.regions) as RegionId[]) touched.add(id);
    this.saveEstate(state); this.saveRegions(state, touched);
    const newsAfter = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM news`).toArray()[0]?.n ?? 0;
    return { ok: true, tick: state.sky.tick, fired, news: newsAfter - newsBefore };
  }

  /** Idle cadence: while somebody is present, the world advances a tick a minute. Engine policy; no spell can observe it. */
  protected override nextAlarmAfterRequest(): { wakeAt: number } | undefined {
    if (!this.idleCadence) return undefined;
    const state = this.world();
    if (!state) return undefined;
    const present = Object.values(state.apprentices).some((a) => a.present);
    return present ? { wakeAt: Date.now() + IDLE_TICK_MS } : undefined;
  }

  override async alarm(): Promise<{ wakeAt: number } | null> {
    await super.alarm();
    this.ensureReady();
    const state = this.world();
    if (!state) return null;
    const present = Object.values(state.apprentices).some((a) => a.present);
    if (!present) return null;
    await this.advance({ ticks: 1, reason: "idle" });
    await this.deliverWakes();
    return { wakeAt: Date.now() + IDLE_TICK_MS };
  }

  // ── Seating ───────────────────────────────────────────────────────────────

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  registerParticipant(input: WorldIn<"registerParticipant">): WorldOut<"registerParticipant"> {
    this.ensureReady();
    this.sql.exec(
      `INSERT INTO participants (role, channel_id, participant_id, target_id, handle, name, apprentice, room) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(role, channel_id) DO UPDATE SET participant_id = excluded.participant_id, target_id = excluded.target_id, handle = excluded.handle, name = excluded.name, apprentice = excluded.apprentice, room = excluded.room`,
      input.role, input.channelId, input.participantId, input.targetId, input.handle, input.name, input.apprentice ?? null, input.room ?? null,
    );
    // A newly seated familiar picks up verses that were waiting.
    if (input.role === "familiar") {
      for (const s of this.spellsWhere(`WHERE caster = ? AND status = 'heard' ORDER BY created_tick DESC LIMIT 1`, input.apprentice ?? "")) {
        const state = this.requireWorld(); const a = state.apprentices[s.caster];
        if (a) { s.status = "deliberating"; this.saveSpell(s); this.wakeFamiliar(a.id, input.room ?? "circle", { kind: "verse", spellId: s.id, apprentice: a.id, apprenticeName: a.name, verse: s.verse, room: input.room ?? "circle", briefing: this.familiarBriefingText(a, s), firstHourStep: this.firstHourStep(a) }); }
      }
    }
    return this.participants();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  listParticipants(): WorldOut<"listParticipants"> {
    this.ensureReady();
    return this.participants();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  setChannel(input: WorldIn<"setChannel">): WorldOut<"setChannel"> {
    this.ensureReady();
    this.sql.exec(`INSERT INTO channels (key, channel_id) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET channel_id = excluded.channel_id`, input.key, input.channelId);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  channels(): WorldOut<"channels"> {
    this.ensureReady();
    return this.channelsMap();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async redeliver(): Promise<WorldOut<"redeliver">> {
    this.ensureReady();
    this.sql.exec(`UPDATE wakes SET status = 'pending' WHERE status = 'failed'`);
    return this.deliverWakes();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  dump(): WorldOut<"dump"> {
    this.ensureReady();
    const state = this.requireWorld();
    return { regions: state.regions, entities: state.entities, apprentices: state.apprentices, spells: this.allSpells(), bargains: this.bargains() };
  }
}

export default {
  fetch(_req: Request) {
    return new Response("Grimoire world: the valley, the sky, the spells and their writing.");
  },
};
