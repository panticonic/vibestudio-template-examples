/**
 * RegencyGameDO — the single source of truth for one game of Regency.
 *
 * It owns the world state, the season clock, the order book (with the
 * Regent's seal as a gate on sensitive acts), and the outbound briefings that
 * wake the agents who play ministers, sovereigns and ambassadors. Everything
 * that changes the world goes through `submitOrder` → `closeSeason`; the
 * engine in `@workspace/regency-engine` is pure and deterministic, so the
 * DO is mostly bookkeeping and identity checks.
 *
 * Callers reach it as the declared service `examples.regency.v1`; the object
 * key is the game key (`main` by default).
 */
import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import {
  allowedInPortfolio,
  autoOrders,
  bumpStanding,
  chronicle,
  crisisSummary,
  describeOrder,
  generateWorld,
  mapOverview,
  moodOf,
  provinceReport,
  realmProvinces,
  realmReport,
  requiresSeal,
  resolveSeason,
  seasonLabel,
  validateOrder,
  TREATY_GUIDE,
  type Crisis,
  type GameEvent,
  type GameState,
  type Order,
  type RealmId,
  type SubmittedOrder,
  type WorldOptions,
} from "@workspace/regency-engine";

export type MinisterRole = "chancellor" | "treasurer" | "marshal" | "envoy";
export const MINISTER_ROLES: readonly MinisterRole[] = ["chancellor", "treasurer", "marshal", "envoy"];
export type MandateLevel = "advise" | "act" | "plenary";

export type OrderStatus = "pending" | "awaiting_seal" | "vetoed" | "withdrawn" | "resolved" | "rejected";

export interface OrderRow {
  id: string;
  season: number;
  realm: RealmId;
  actor: string;
  order: Order;
  rationale: string;
  status: OrderStatus;
  reason: string | null;
  submittedAt: string;
}

export interface Participant {
  /** "herald" | "chancellor" | … | "sovereign:r1" | "ambassador:r1" | "protector" */
  role: string;
  realm: RealmId;
  channelId: string;
  participantId: string;
  targetId: string;
  handle: string;
  name: string;
  /** "court": the seat that receives briefings. "chambers": the same person's private room. */
  kind?: "court" | "chambers";
}

export interface Briefing {
  id: string;
  season: number;
  role: string;
  targetId: string;
  channelId: string;
  content: string;
  status: "pending" | "delivered" | "failed";
  error: string | null;
}

export interface ProtectorLimits {
  maySealWar: boolean;
  maySealLaws: boolean;
  maySealTreaties: boolean;
  mayDecideCrises: boolean;
  mayCloseSeason: boolean;
}

export interface Protectorate {
  active: boolean;
  mandate: string;
  seasonsLeft: number;
  limits: ProtectorLimits;
  startedSeason: number;
}

export interface Bribe {
  id: string;
  season: number;
  fromRealm: RealmId;
  targetRole: string;
  gold: number;
  note: string;
  status: "pending" | "accepted" | "reported" | "expired";
  /** While accepted and before this season, the briber reads the Regent's order book. */
  untilSeason: number | null;
}

export interface CardRef {
  key: string;
  channelId: string;
  messageId: string;
  kind: string;
  updatedAt: string;
}

export interface GameView {
  state: GameState | null;
  participants: Participant[];
  mandates: Record<string, MandateLevel>;
  orders: OrderRow[];
  events: Array<GameEvent & { seq: number }>;
  briefings: Briefing[];
  waitingFor: RealmId[];
  /** Seasons with a stored snapshot, for the replay scrubber. */
  snapshots: number[];
  protectorate: Protectorate | null;
  /** Bribes the Regent is allowed to know about: reported ones, and all once the game ends. */
  bribes: Bribe[];
  cards: CardRef[];
  dossiers: Array<{ role: string; text: string }>;
  doctrines: Array<{ realm: RealmId; text: string; season: number }>;
}

export interface Forecast {
  season: string;
  treasury: { before: number; after: number };
  legitimacy: { before: number; after: number };
  estates: Record<string, number>;
  provinces: { before: number; after: number };
  wars: string[];
  events: string[];
  rejected: string[];
  /** Assumes rival courts play the steward policy; their real orders may differ. */
  assumption: string;
}

export interface SubmitOrderInput {
  realm: RealmId;
  /** Portfolio or seat issuing the order: a minister role, "regent", or "sovereign". */
  actor: string;
  order: Order;
  rationale?: string;
}

export type SubmitOrderResult =
  | { ok: true; orderId: string; status: OrderStatus; summary: string; needsSeal: boolean }
  | { ok: false; reason: string };

const EVENT_LIMIT = 80;

function nowIso(): string {
  return new Date().toISOString();
}

export function roleRealm(role: string, playerRealm: RealmId): RealmId {
  const [kind, realm] = role.split(":");
  if ((kind === "sovereign" || kind === "ambassador") && realm) return realm;
  return playerRealm;
}

/** The engine's portfolio name for a participant role. */
export function portfolioOf(role: string): string {
  return role.split(":")[0]!;
}

/** Rules text is in the engine; this adds the court's own conventions. */

export class RegencyGameDO extends DurableObjectBase {
  static override schemaVersion = 1;

  protected override requiredTables(): readonly string[] {
    return ["game", "orders", "events", "participants", "mandates", "briefings", "snapshots", "cards", "bribes", "dossiers", "doctrines", "protectorate"];
  }

  protected createTables(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, season INTEGER NOT NULL, realm TEXT NOT NULL, actor TEXT NOT NULL, order_json TEXT NOT NULL, rationale TEXT NOT NULL, status TEXT NOT NULL, reason TEXT, submitted_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, season INTEGER NOT NULL, kind TEXT NOT NULL, event_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS participants (role TEXT NOT NULL, channel_id TEXT NOT NULL, realm TEXT NOT NULL, participant_id TEXT NOT NULL, target_id TEXT NOT NULL, handle TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'court', PRIMARY KEY (role, channel_id))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mandates (role TEXT PRIMARY KEY, level TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS briefings (id TEXT PRIMARY KEY, season INTEGER NOT NULL, role TEXT NOT NULL, target_id TEXT NOT NULL, channel_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, error TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS snapshots (season INTEGER PRIMARY KEY, state_json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS cards (key TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL, kind TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bribes (id TEXT PRIMARY KEY, season INTEGER NOT NULL, from_realm TEXT NOT NULL, target_role TEXT NOT NULL, gold REAL NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, until_season INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS dossiers (role TEXT PRIMARY KEY, text TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS doctrines (realm TEXT PRIMARY KEY, text TEXT NOT NULL, season INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS protectorate (id INTEGER PRIMARY KEY CHECK (id = 1), active INTEGER NOT NULL, mandate TEXT NOT NULL, seasons_left INTEGER NOT NULL, limits_json TEXT NOT NULL, started_season INTEGER NOT NULL)`);
  }

  // ── Small readers ─────────────────────────────────────────────────────────

  private readProtectorate(): Protectorate | null {
    const row = this.sql.exec<Record<string, unknown>>(`SELECT * FROM protectorate WHERE id = 1`).toArray()[0];
    if (!row) return null;
    return { active: row["active"] === 1, mandate: row["mandate"] as string, seasonsLeft: row["seasons_left"] as number, limits: JSON.parse(row["limits_json"] as string) as ProtectorLimits, startedSeason: row["started_season"] as number };
  }

  private protectorActive(): Protectorate | null {
    const p = this.readProtectorate();
    return p && p.active ? p : null;
  }

  private readBribes(): Bribe[] {
    return this.sql.exec<Record<string, unknown>>(`SELECT * FROM bribes ORDER BY season, id`).toArray().map((r) => ({ id: r["id"] as string, season: r["season"] as number, fromRealm: r["from_realm"] as string, targetRole: r["target_role"] as string, gold: r["gold"] as number, note: r["note"] as string, status: r["status"] as Bribe["status"], untilSeason: (r["until_season"] as number | null) ?? null }));
  }

  private readCards(): CardRef[] {
    return this.sql.exec<Record<string, string>>(`SELECT * FROM cards`).toArray().map((r) => ({ key: r["key"]!, channelId: r["channel_id"]!, messageId: r["message_id"]!, kind: r["kind"]!, updatedAt: r["updated_at"]! }));
  }

  /** Who is calling: the Regent's own hand (not an agent), the Herald, the Lord Protector, or another agent. */
  private callerSeat(): "regent" | "herald" | "protector" | "other" {
    if (this.rpcCallerKind !== "do") return "regent";
    if (this.rpcCallerId && this.targetsFor("herald").includes(this.rpcCallerId)) return "herald";
    if (this.rpcCallerId && this.protectorActive() && this.targetsFor("protector").includes(this.rpcCallerId)) return "protector";
    return "other";
  }

  // ── State access ──────────────────────────────────────────────────────────

  private loadState(): GameState | null {
    const rows = this.sql.exec<{ state_json: string }>(`SELECT state_json FROM game WHERE id = 1`).toArray();
    return rows.length ? (JSON.parse(rows[0]!.state_json) as GameState) : null;
  }

  private requireState(): GameState {
    const state = this.loadState();
    if (!state) throw new Error("No game has been founded yet. Call newGame first.");
    return state;
  }

  private saveState(state: GameState): void {
    this.sql.exec(`INSERT INTO game (id, state_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`, JSON.stringify(state), nowIso());
  }

  private appendEvents(events: GameEvent[]): void {
    for (const e of events) this.sql.exec(`INSERT INTO events (season, kind, event_json) VALUES (?, ?, ?)`, e.season, e.kind, JSON.stringify(e));
  }

  private readEvents(limit = EVENT_LIMIT, sinceSeq = 0): Array<GameEvent & { seq: number }> {
    return this.sql
      .exec<{ seq: number; event_json: string }>(`SELECT seq, event_json FROM events WHERE seq > ? ORDER BY seq DESC LIMIT ?`, sinceSeq, limit)
      .toArray()
      .reverse()
      .map((r) => ({ seq: r.seq, ...(JSON.parse(r.event_json) as GameEvent) }));
  }

  private allEvents(): GameEvent[] {
    return this.sql
      .exec<{ event_json: string }>(`SELECT event_json FROM events ORDER BY seq`)
      .toArray()
      .map((r) => JSON.parse(r.event_json) as GameEvent);
  }

  private readOrders(season?: number): OrderRow[] {
    const rows = season === undefined
      ? this.sql.exec<Record<string, unknown>>(`SELECT * FROM orders ORDER BY submitted_at`).toArray()
      : this.sql.exec<Record<string, unknown>>(`SELECT * FROM orders WHERE season = ? ORDER BY submitted_at`, season).toArray();
    return rows.map((r) => ({
      id: r["id"] as string,
      season: r["season"] as number,
      realm: r["realm"] as string,
      actor: r["actor"] as string,
      order: JSON.parse(r["order_json"] as string) as Order,
      rationale: r["rationale"] as string,
      status: r["status"] as OrderStatus,
      reason: (r["reason"] as string | null) ?? null,
      submittedAt: r["submitted_at"] as string,
    }));
  }

  private readParticipants(kind?: "court" | "chambers"): Participant[] {
    return this.sql
      .exec<Record<string, string>>(`SELECT * FROM participants ORDER BY role, kind`)
      .toArray()
      .map((r) => ({ role: r["role"]!, realm: r["realm"]!, channelId: r["channel_id"]!, participantId: r["participant_id"]!, targetId: r["target_id"]!, handle: r["handle"]!, name: r["name"]!, kind: (r["kind"] as "court" | "chambers") ?? "court" }))
      .filter((p) => !kind || p.kind === kind);
  }

  /** Every object allowed to act in a role: the court seat and its chambers. */
  private targetsFor(role: string): string[] {
    return this.sql.exec<{ target_id: string }>(`SELECT target_id FROM participants WHERE role = ?`, role).toArray().map((r) => r.target_id);
  }

  private readMandates(): Record<string, MandateLevel> {
    const out: Record<string, MandateLevel> = {};
    for (const role of MINISTER_ROLES) out[role] = "act";
    for (const r of this.sql.exec<{ role: string; level: MandateLevel }>(`SELECT role, level FROM mandates`).toArray()) out[r.role] = r.level;
    return out;
  }

  private readBriefings(status?: Briefing["status"]): Briefing[] {
    const rows = status
      ? this.sql.exec<Record<string, unknown>>(`SELECT * FROM briefings WHERE status = ? ORDER BY season, role`, status).toArray()
      : this.sql.exec<Record<string, unknown>>(`SELECT * FROM briefings ORDER BY season DESC, role LIMIT 40`).toArray();
    return rows.map((r) => ({ id: r["id"] as string, season: r["season"] as number, role: r["role"] as string, targetId: r["target_id"] as string, channelId: r["channel_id"] as string, content: r["content"] as string, status: r["status"] as Briefing["status"], error: (r["error"] as string | null) ?? null }));
  }

  private waitingFor(state: GameState): RealmId[] {
    return Object.values(state.realms)
      .filter((r) => !r.eliminated && r.sovereign === "agent" && !r.turnEnded)
      .map((r) => r.id);
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  /**
   * Agents act through their own Durable Object, whose identity the server
   * stamps on every call. Once a role is registered with a target id, only
   * that object may act in that role. The Regent's own seat is never
   * available to an agent caller.
   */
  private assertActor(role: string): void {
    const kind = this.rpcCallerKind;
    if (role === "regent") {
      if (kind === "do") throw new Error("An agent cannot act as the Regent. Ask the Regent, or use your own seat.");
      return;
    }
    const registered = this.targetsFor(role);
    if (registered.length === 0) return; // unregistered roles are open (development, tests, the panel acting for an absent minister)
    if (kind === "do" && !registered.includes(this.rpcCallerId ?? "")) {
      throw new Error(`Caller ${this.rpcCallerId} is not the registered ${role} (${registered.join(", ")}).`);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  newGame(input: WorldOptions & { keepParticipants?: boolean }): { title: string; season: string; realms: Array<{ id: string; name: string; sovereign: string }> } {
    this.ensureReady();
    const seed = (input.seed ?? "").trim() || `regency-${Date.now().toString(36)}`;
    const state = generateWorld({ ...input, seed });
    for (const table of ["orders", "events", "briefings", "snapshots", "cards", "bribes", "dossiers", "doctrines", "protectorate", "mandates"]) this.sql.exec(`DELETE FROM ${table}`);
    if (!input.keepParticipants) this.sql.exec(`DELETE FROM participants`);
    this.saveState(state);
    this.sql.exec(`INSERT INTO snapshots (season, state_json) VALUES (?, ?)`, state.season, JSON.stringify(state));
    this.appendEvents([{ season: 0, kind: "season", text: `${state.title} begins in ${seasonLabel(state)}. The heir comes of age in ${state.majoritySeason} seasons.`, realms: Object.keys(state.realms) }]);
    return { title: state.title, season: seasonLabel(state), realms: Object.values(state.realms).map((r) => ({ id: r.id, name: r.name, sovereign: r.sovereign })) };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  getGame(): GameView {
    this.ensureReady();
    const state = this.loadState();
    return {
      state,
      participants: this.readParticipants(),
      mandates: this.readMandates(),
      orders: state ? this.readOrders(state.season) : [],
      events: this.readEvents(),
      briefings: this.readBriefings("pending").concat(this.readBriefings("failed")),
      waitingFor: state ? this.waitingFor(state) : [],
      snapshots: this.sql.exec<{ season: number }>(`SELECT season FROM snapshots ORDER BY season`).toArray().map((r) => r.season),
      protectorate: this.readProtectorate(),
      bribes: this.readBribes().filter((b) => b.status === "reported" || state?.phase === "finished"),
      cards: this.readCards(),
      dossiers: state?.phase === "finished" ? this.sql.exec<{ role: string; text: string }>(`SELECT role, text FROM dossiers`).toArray() : [],
      doctrines: this.sql.exec<{ realm: string; text: string; season: number }>(`SELECT realm, text, season FROM doctrines`).toArray(),
    };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  getSnapshot(input: { season: number }): GameState | null {
    this.ensureReady();
    const row = this.sql.exec<{ state_json: string }>(`SELECT state_json FROM snapshots WHERE season = ?`, input.season).toArray()[0];
    return row ? (JSON.parse(row.state_json) as GameState) : null;
  }

  /**
   * What-if: resolve a copy of the current season with the pending orders,
   * optionally some orders still awaiting the seal, and hypothetical extras.
   * Rival courts are assumed to play the steward policy.
   */
  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  forecast(input: { orders?: Order[]; includeOrderIds?: string[]; realm?: RealmId } = {}): Forecast {
    this.ensureReady();
    const state = this.requireState();
    const realm = input.realm ?? state.playerRealm;
    const rows = this.readOrders(state.season);
    const include = new Set(input.includeOrderIds ?? []);
    const submitted: SubmittedOrder[] = rows
      .filter((o) => o.status === "pending" || (o.status === "awaiting_seal" && include.has(o.id)))
      .map((o) => ({ id: o.id, realm: o.realm, actor: o.actor, season: o.season, order: o.order }));
    (input.orders ?? []).forEach((order, i) => submitted.push({ id: `what-if-${i}`, realm, actor: "forecast", season: state.season, order }));
    for (const r of Object.values(state.realms)) {
      if (r.eliminated || r.sovereign !== "agent" || r.turnEnded) continue;
      if (submitted.some((o) => o.realm === r.id)) continue;
      autoOrders(state, r.id).forEach((order, i) => submitted.push({ id: `steward-${r.id}-${i}`, realm: r.id, actor: "steward", season: state.season, order }));
    }
    const result = resolveSeason(state, submitted);
    const beforeRealm = state.realms[realm]!;
    const afterRealm = result.state.realms[realm]!;
    return {
      season: seasonLabel(state),
      treasury: { before: beforeRealm.treasury, after: afterRealm.treasury },
      legitimacy: { before: beforeRealm.legitimacy, after: afterRealm.legitimacy },
      estates: { ...afterRealm.estates },
      provinces: { before: realmProvinces(state, realm).length, after: realmProvinces(result.state, realm).length },
      wars: result.state.wars.filter(([a, b]) => a === realm || b === realm).map(([a, b]) => `${result.state.realms[a]?.name} vs ${result.state.realms[b]?.name}`),
      events: result.events.filter((e) => e.realms.includes(realm) || ["war", "treaty", "capture"].includes(e.kind)).slice(0, 30).map((e) => e.text),
      rejected: result.rejected.map((r) => `${r.order.actor}: ${r.reason}`),
      assumption: "Rival courts are assumed to follow the steward policy; battle rolls are the season's own. Treat this as a forecast, not a promise.",
    };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  getWorld(): GameState | null {
    this.ensureReady();
    return this.loadState();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  events(input?: { sinceSeq?: number; limit?: number }): Array<GameEvent & { seq: number }> {
    this.ensureReady();
    return this.readEvents(Math.min(500, input?.limit ?? EVENT_LIMIT), input?.sinceSeq ?? 0);
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  report(input: { kind: "realm" | "province" | "map" | "chronicle" | "rules"; realm?: RealmId; province?: string; limit?: number }): string {
    this.ensureReady();
    const state = this.requireState();
    switch (input.kind) {
      case "realm":
        return realmReport(state, input.realm ?? state.playerRealm);
      case "province":
        return provinceReport(state, input.province ?? state.realms[state.playerRealm]!.capital);
      case "map":
        return mapOverview(state);
      case "chronicle":
        return chronicle(this.allEvents(), state, input.realm, input.limit ?? 40);
      case "rules":
        return RULES_SUMMARY;
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  submitOrder(input: SubmitOrderInput): SubmitOrderResult {
    this.ensureReady();
    const state = this.requireState();
    if (state.phase === "finished") return { ok: false, reason: `The game is over: ${state.outcome?.title}.` };
    const role = input.actor;
    const portfolio = portfolioOf(role);
    const expectedRealm = roleRealm(role, state.playerRealm);
    if (input.realm !== expectedRealm) return { ok: false, reason: `${role} acts for ${state.realms[expectedRealm]?.name ?? expectedRealm}, not ${input.realm}.` };
    try {
      this.assertActor(role);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    const mandates = this.readMandates();
    const isMinister = (MINISTER_ROLES as readonly string[]).includes(portfolio);
    if (portfolio === "herald") return { ok: false, reason: "The Herald relays and interprets; it holds no portfolio. Address the responsible minister." };
    if (portfolio === "protector" && !this.protectorActive()) return { ok: false, reason: "There is no Lord Protector in office." };
    if (isMinister && mandates[portfolio] === "advise") return { ok: false, reason: `The ${portfolio} currently holds an advisory mandate only. Ask the Regent for authority to act.` };
    if (!allowedInPortfolio(portfolio, input.order?.kind)) return { ok: false, reason: `${portfolio} may not issue ${String(input.order?.kind)} orders.` };
    const problem = validateOrder(state, input.realm, input.order);
    if (problem) return { ok: false, reason: problem };
    const needsSeal = isMinister && mandates[portfolio] !== "plenary" && requiresSeal(input.order);
    const id = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const status: OrderStatus = needsSeal ? "awaiting_seal" : "pending";
    this.sql.exec(`INSERT INTO orders (id, season, realm, actor, order_json, rationale, status, reason, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`, id, state.season, input.realm, role, JSON.stringify(input.order), input.rationale ?? "", status, nowIso());
    const summary = describeOrder(state, input.order);
    this.appendEvents([{ season: state.season, kind: "council", text: `${state.realms[input.realm]!.name}'s ${role} ${needsSeal ? "asks the Regent's seal to" : "ordered:"} ${summary}${input.rationale ? ` — “${input.rationale}”` : ""}`, realms: [input.realm], data: { orderId: id, status } }]);
    return { ok: true, orderId: id, status, summary, needsSeal };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  withdrawOrder(input: { orderId: string; actor: string }): { ok: boolean; reason?: string } {
    this.ensureReady();
    const row = this.readOrders().find((o) => o.id === input.orderId);
    if (!row) return { ok: false, reason: `no order ${input.orderId}` };
    if (row.actor !== input.actor && input.actor !== "regent") return { ok: false, reason: "only the issuing seat or the Regent may withdraw an order" };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    if (row.status !== "pending" && row.status !== "awaiting_seal") return { ok: false, reason: `order is ${row.status}` };
    this.sql.exec(`UPDATE orders SET status = 'withdrawn' WHERE id = ?`, input.orderId);
    return { ok: true };
  }

  /**
   * The Regent's seal. The panel calls this as the user; the Herald may call
   * it only to carry out an explicit spoken decision of the Regent.
   */
  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  sealOrder(input: { orderId: string; decision: "seal" | "veto"; note?: string }): { ok: boolean; reason?: string } {
    this.ensureReady();
    const state = this.requireState();
    const seat = this.callerSeat();
    if (seat === "other") return { ok: false, reason: "Only the Regent (or the Herald carrying the Regent's explicit word, or the Lord Protector within their mandate) may seal or veto." };
    const row = this.readOrders().find((o) => o.id === input.orderId);
    if (!row) return { ok: false, reason: `no order ${input.orderId}` };
    if (row.status !== "awaiting_seal") return { ok: false, reason: `order is ${row.status}, not awaiting the seal` };
    if (seat === "protector") {
      const limits = this.protectorActive()!.limits;
      const kind = row.order.kind;
      if (kind === "declare_war" && !limits.maySealWar) return { ok: false, reason: "The Lord Protector's mandate does not extend to war. Refer it to the Regent." };
      if ((kind === "enact_edict" || kind === "repeal_edict" || kind === "set_tax") && !limits.maySealLaws) return { ok: false, reason: "The Lord Protector's mandate does not extend to laws and taxes." };
      if ((kind === "propose" || kind === "respond" || kind === "cede_province") && !limits.maySealTreaties) return { ok: false, reason: "The Lord Protector's mandate does not extend to treaties." };
    }
    const status: OrderStatus = input.decision === "seal" ? "pending" : "vetoed";
    this.sql.exec(`UPDATE orders SET status = ?, reason = ? WHERE id = ?`, status, input.note ?? null, input.orderId);
    const who = seat === "protector" ? "The Lord Protector" : "The Regent";
    this.appendEvents([{ season: state.season, kind: "council", text: `${who} ${input.decision === "seal" ? "sealed" : "vetoed"} the ${row.actor}'s order to ${describeOrder(state, row.order)}${input.note ? `: “${input.note}”` : "."}`, realms: [row.realm], data: { orderId: row.id, decision: input.decision, by: seat } }]);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  listOrders(input?: { season?: number; realm?: RealmId }): OrderRow[] {
    this.ensureReady();
    const state = this.loadState();
    const rows = this.readOrders(input?.season ?? state?.season);
    return input?.realm ? rows.filter((r) => r.realm === input.realm) : rows;
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  setMandate(input: { role: MinisterRole; level: MandateLevel }): Record<string, MandateLevel> {
    this.ensureReady();
    if (this.rpcCallerKind === "do") throw new Error("Only the Regent may change a minister's mandate.");
    if (!MINISTER_ROLES.includes(input.role)) throw new Error(`unknown minister ${input.role}`);
    if (!["advise", "act", "plenary"].includes(input.level)) throw new Error(`unknown mandate level ${input.level}`);
    this.sql.exec(`INSERT INTO mandates (role, level) VALUES (?, ?) ON CONFLICT(role) DO UPDATE SET level = excluded.level`, input.role, input.level);
    const state = this.loadState();
    if (state) this.appendEvents([{ season: state.season, kind: "council", text: `The Regent set the ${input.role}'s mandate to “${input.level}”.`, realms: [state.playerRealm] }]);
    return this.readMandates();
  }

  // ── Turn clock ────────────────────────────────────────────────────────────

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  endTurn(input: { realm: RealmId; actor: string }): { ok: boolean; reason?: string; waitingFor: RealmId[]; resolved: boolean } {
    this.ensureReady();
    const state = this.requireState();
    const realm = state.realms[input.realm];
    if (!realm) return { ok: false, reason: `unknown realm ${input.realm}`, waitingFor: this.waitingFor(state), resolved: false };
    if (roleRealm(input.actor, state.playerRealm) !== input.realm) return { ok: false, reason: `${input.actor} does not speak for ${realm.name}`, waitingFor: this.waitingFor(state), resolved: false };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), waitingFor: this.waitingFor(state), resolved: false };
    }
    realm.turnEnded = true;
    this.saveState(state);
    if (state.phase === "closing" && this.waitingFor(state).length === 0) {
      this.resolve(state);
      return { ok: true, waitingFor: [], resolved: true };
    }
    return { ok: true, waitingFor: this.waitingFor(state), resolved: false };
  }

  /** The Regent closes the season. It resolves once every sovereign has ended its turn. */
  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  closeSeason(): { resolved: boolean; waitingFor: RealmId[]; season: string } {
    this.ensureReady();
    const state = this.requireState();
    const seat = this.callerSeat();
    if (seat === "other") throw new Error("Only the Regent (or the Herald on the Regent's word, or a Lord Protector so empowered) closes the season.");
    if (seat === "protector" && !this.protectorActive()!.limits.mayCloseSeason) throw new Error("The Lord Protector's mandate does not allow closing the season.");
    if (state.phase === "finished") return { resolved: false, waitingFor: [], season: seasonLabel(state) };
    const undecided = state.crises.filter((c) => c.chosen === null && c.season <= state.season);
    if (undecided.length > 0 && seat === "regent") {
      // The Regent may close with matters undecided; they take their defaults. Say so in the chronicle.
      this.appendEvents([{ season: state.season, kind: "council", text: `The Regent closed the court with ${undecided.length} matter(s) undecided; they take their default course.`, realms: [state.playerRealm] }]);
    }
    const awaiting = this.readOrders(state.season).filter((o) => o.status === "awaiting_seal");
    if (awaiting.length > 0) {
      throw new Error(`${awaiting.length} order(s) still await the Regent's seal: ${awaiting.map((o) => `${o.id} (${describeOrder(state, o.order)})`).join("; ")}. Seal or veto them first.`);
    }
    state.realms[state.playerRealm]!.turnEnded = true;
    const waiting = this.waitingFor(state);
    if (waiting.length === 0) {
      const next = this.resolve(state);
      return { resolved: true, waitingFor: [], season: seasonLabel(next) };
    }
    state.phase = "closing";
    this.saveState(state);
    this.appendEvents([{ season: state.season, kind: "season", text: `The Regent has closed the court for ${seasonLabel(state)}; waiting on ${waiting.map((r) => state.realms[r]!.name).join(", ")}.`, realms: Object.keys(state.realms) }]);
    void this.nudgeSovereigns(state, waiting);
    return { resolved: false, waitingFor: waiting, season: seasonLabel(state) };
  }

  /** The Regent's explicit choice to proceed; absent sovereigns are played by the steward policy. */
  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  proceedWithoutPending(): { resolved: boolean; stewarded: RealmId[]; season: string } {
    this.ensureReady();
    if (this.rpcCallerKind === "do") throw new Error("Only the Regent may proceed without the other courts.");
    const state = this.requireState();
    if (state.phase === "finished") return { resolved: false, stewarded: [], season: seasonLabel(state) };
    const waiting = this.waitingFor(state);
    for (const realm of waiting) {
      const existing = this.readOrders(state.season).some((o) => o.realm === realm && o.status === "pending");
      if (!existing) {
        for (const order of autoOrders(state, realm)) {
          const id = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          this.sql.exec(`INSERT INTO orders (id, season, realm, actor, order_json, rationale, status, reason, submitted_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`, id, state.season, realm, "steward", JSON.stringify(order), "steward policy (sovereign absent)", nowIso());
        }
      }
      state.realms[realm]!.turnEnded = true;
    }
    state.realms[state.playerRealm]!.turnEnded = true;
    const next = this.resolve(state);
    return { resolved: true, stewarded: waiting, season: seasonLabel(next) };
  }

  private resolve(state: GameState): GameState {
    const all = this.readOrders(state.season);
    const rows = all.filter((o) => o.status === "pending");
    const submitted: SubmittedOrder[] = rows.map((o) => ({ id: o.id, realm: o.realm, actor: o.actor, season: o.season, order: o.order }));
    const vetoed = all.filter((o) => o.status === "vetoed").map((o) => o.order);
    const result = resolveSeason(state, submitted, { vetoed });
    // The protectorate runs down by seasons of the game, never by the clock.
    const protectorate = this.readProtectorate();
    if (protectorate && protectorate.active) {
      const left = protectorate.seasonsLeft - 1;
      this.sql.exec(`UPDATE protectorate SET seasons_left = ?, active = ? WHERE id = 1`, Math.max(0, left), left > 0 ? 1 : 0);
      if (left <= 0) result.events.push({ season: state.season, kind: "council", text: "The Lord Protector's mandate has run its course; the Regent resumes the seal.", realms: [state.playerRealm] });
    }
    for (const b of this.readBribes()) {
      if (b.status === "pending" && state.season - b.season >= 2) this.sql.exec(`UPDATE bribes SET status = 'expired' WHERE id = ?`, b.id);
      if (b.status === "accepted" && b.untilSeason !== null && result.state.season >= b.untilSeason) this.sql.exec(`UPDATE bribes SET status = 'expired' WHERE id = ?`, b.id);
    }
    const rejectedIds = new Map(result.rejected.map((r) => [r.order.id, r.reason]));
    for (const o of rows) {
      const reason = rejectedIds.get(o.id);
      this.sql.exec(`UPDATE orders SET status = ?, reason = ? WHERE id = ?`, reason ? "rejected" : "resolved", reason ?? null, o.id);
    }
    for (const o of this.readOrders(state.season)) if (o.status === "awaiting_seal") this.sql.exec(`UPDATE orders SET status = 'vetoed', reason = 'the season closed without the seal' WHERE id = ?`, o.id);
    this.saveState(result.state);
    this.sql.exec(`INSERT INTO snapshots (season, state_json) VALUES (?, ?) ON CONFLICT(season) DO UPDATE SET state_json = excluded.state_json`, result.state.season, JSON.stringify(result.state));
    this.appendEvents(result.events);
    for (const r of result.rejected) this.appendEvents([{ season: state.season, kind: "council", text: `Order by ${r.order.actor} could not be carried out: ${r.reason}`, realms: [r.order.realm], data: { orderId: r.order.id } }]);
    this.queueBriefings(result.state, result.events, result.rejected.map((r) => `${r.order.actor}: ${r.reason}`));
    void this.deliverBriefings();
    return result.state;
  }

  // ── Crises, intrigue, dossiers, doctrines, protectorate ──────────────────

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  decideCrisis(input: { crisisId: string; optionId: string; note?: string }): { ok: boolean; reason?: string; crisis?: Crisis } {
    this.ensureReady();
    const state = this.requireState();
    const seat = this.callerSeat();
    if (seat === "other") return { ok: false, reason: "Only the Regent (or the Herald on the Regent's explicit word, or a Lord Protector so empowered) decides matters of state." };
    if (seat === "protector" && !this.protectorActive()!.limits.mayDecideCrises) return { ok: false, reason: "The Lord Protector's mandate does not extend to matters of state. Refer it to the Regent." };
    const c = state.crises.find((x) => x.id === input.crisisId);
    if (!c) return { ok: false, reason: `no matter ${input.crisisId}` };
    if (c.chosen !== null) return { ok: false, reason: `already decided: ${c.chosen}` };
    const option = c.options.find((o) => o.id === input.optionId);
    if (!option) return { ok: false, reason: `no option ${input.optionId}; choose one of ${c.options.map((o) => o.id).join(", ")}` };
    c.chosen = option.id;
    c.decidedBy = seat;
    this.saveState(state);
    this.appendEvents([{ season: state.season, kind: "council", text: `${seat === "protector" ? "The Lord Protector" : "The Regent"} decided “${c.title}”: ${option.label}${input.note ? ` — “${input.note}”` : "."}`, realms: [c.realm], data: { crisisId: c.id, option: option.id, by: seat } }]);
    return { ok: true, crisis: c };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  offerBribe(input: { actor: string; targetRole: MinisterRole; gold: number; note: string }): { ok: boolean; reason?: string; bribeId?: string } {
    this.ensureReady();
    const state = this.requireState();
    if (!input.actor.startsWith("sovereign:")) return { ok: false, reason: "Only a sovereign may set gold before a minister." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    const realm = state.realms[roleRealm(input.actor, state.playerRealm)];
    if (!realm) return { ok: false, reason: "unknown realm" };
    if (!MINISTER_ROLES.includes(input.targetRole)) return { ok: false, reason: `no such minister: ${input.targetRole}` };
    if (!(typeof input.gold === "number" && input.gold >= 10 && input.gold <= 200)) return { ok: false, reason: "gold must be 10..200" };
    if (realm.treasury < input.gold) return { ok: false, reason: `your treasury holds ${Math.floor(realm.treasury)} gold` };
    if (this.readBribes().some((b) => b.status === "pending" && b.fromRealm === realm.id && b.targetRole === input.targetRole)) return { ok: false, reason: "you already have an offer before that minister" };
    const id = `br${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    this.sql.exec(`INSERT INTO bribes (id, season, from_realm, target_role, gold, note, status, until_season) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL)`, id, state.season, realm.id, input.targetRole, input.gold, (input.note ?? "").slice(0, 400));
    // A private word reaches the minister at once: in their chambers if they have them, else at court.
    const seat = this.readParticipants("chambers").find((p) => p.role === input.targetRole) ?? this.readParticipants("court").find((p) => p.role === input.targetRole);
    if (seat) {
      const content = `<private-word season="${state.season}">\nA discreet messenger from ${realm.name} has found you alone. Use \`my_temptations\` to read the offer, then \`respond_bribe\` to accept or to report it to the Regent. Nobody else has seen this.\n</private-word>`;
      this.sql.exec(`INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO NOTHING`, `t${id}`, state.season, seat.role, seat.targetId, seat.channelId, content);
      void this.deliverBriefings();
    }
    return { ok: true, bribeId: id };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  myTemptations(input: { actor: string }): Bribe[] {
    this.ensureReady();
    this.assertActor(input.actor);
    return this.readBribes().filter((b) => b.targetRole === input.actor && b.status === "pending");
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  respondBribe(input: { actor: string; bribeId: string; decision: "accept" | "report"; note?: string }): { ok: boolean; reason?: string } {
    this.ensureReady();
    const state = this.requireState();
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    const bribe = this.readBribes().find((b) => b.id === input.bribeId);
    if (!bribe || bribe.targetRole !== input.actor) return { ok: false, reason: "no such offer before you" };
    if (bribe.status !== "pending") return { ok: false, reason: `the offer is ${bribe.status}` };
    const briber = state.realms[bribe.fromRealm]!;
    if (input.decision === "accept") {
      if (briber.treasury < bribe.gold) {
        this.sql.exec(`UPDATE bribes SET status = 'expired' WHERE id = ?`, bribe.id);
        return { ok: false, reason: "the messenger's purse turned out to be empty; the offer lapses" };
      }
      briber.treasury -= bribe.gold;
      this.sql.exec(`UPDATE bribes SET status = 'accepted', until_season = ? WHERE id = ?`, state.season + 4, bribe.id);
      bumpStanding(state, input.actor, 6);
      this.saveState(state);
      // Nothing is written where the Regent can read it — until the reckoning.
      return { ok: true };
    }
    this.sql.exec(`UPDATE bribes SET status = 'reported' WHERE id = ?`, bribe.id);
    bumpStanding(state, input.actor, 5);
    state.regent.reputation = Math.min(100, state.regent.reputation + 2);
    const player = state.realms[state.playerRealm]!;
    player.relations[bribe.fromRealm] = Math.max(-100, (player.relations[bribe.fromRealm] ?? 0) - 15);
    briber.infamy = Math.min(100, briber.infamy + 8);
    this.saveState(state);
    this.appendEvents([{ season: state.season, kind: "court", text: `${state.court[input.actor]?.name ?? input.actor}, the ${input.actor}, laid ${bribe.gold} gold of ${briber.name}'s before the Regent and named the messenger.${input.note ? ` “${input.note}”` : ""}`, realms: [state.playerRealm, bribe.fromRealm], data: { bribeId: bribe.id } }]);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  writeDossier(input: { actor: string; text: string }): { ok: boolean; reason?: string } {
    this.ensureReady();
    if (!input.actor.startsWith("ambassador:")) return { ok: false, reason: "Only ambassadors keep a dossier." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    this.sql.exec(`INSERT INTO dossiers (role, text, updated_at) VALUES (?, ?, ?) ON CONFLICT(role) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`, input.actor, String(input.text ?? "").slice(0, 4000), nowIso());
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  readDossier(input: { actor: string }): string {
    this.ensureReady();
    this.assertActor(input.actor);
    return this.sql.exec<{ text: string }>(`SELECT text FROM dossiers WHERE role = ?`, input.actor).toArray()[0]?.text ?? "";
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  writeDoctrine(input: { actor: string; text: string }): { ok: boolean; reason?: string } {
    this.ensureReady();
    const state = this.requireState();
    if (!input.actor.startsWith("sovereign:")) return { ok: false, reason: "Only sovereigns write doctrine." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    const realm = roleRealm(input.actor, state.playerRealm);
    this.sql.exec(`INSERT INTO doctrines (realm, text, season) VALUES (?, ?, ?) ON CONFLICT(realm) DO UPDATE SET text = excluded.text, season = excluded.season`, realm, String(input.text ?? "").slice(0, 3000), state.season);
    this.appendEvents([{ season: state.season, kind: "court", text: `${state.realms[realm]!.name} has revised its doctrine.`, realms: [realm] }]);
    return { ok: true };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  readDoctrine(input: { actor: string }): string {
    this.ensureReady();
    const state = this.requireState();
    this.assertActor(input.actor);
    return this.sql.exec<{ text: string }>(`SELECT text FROM doctrines WHERE realm = ?`, roleRealm(input.actor, state.playerRealm)).toArray()[0]?.text ?? "";
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  appointProtector(input: { mandate: string; seasons: number; limits: Partial<ProtectorLimits> }): Protectorate {
    this.ensureReady();
    if (this.rpcCallerKind === "do") throw new Error("Only the Regent appoints a Lord Protector.");
    const state = this.requireState();
    const seasons = Math.max(1, Math.min(12, Math.floor(input.seasons)));
    const limits: ProtectorLimits = { maySealWar: false, maySealLaws: true, maySealTreaties: true, mayDecideCrises: true, mayCloseSeason: true, ...(input.limits ?? {}) };
    this.sql.exec(`INSERT INTO protectorate (id, active, mandate, seasons_left, limits_json, started_season) VALUES (1, 1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET active = 1, mandate = excluded.mandate, seasons_left = excluded.seasons_left, limits_json = excluded.limits_json, started_season = excluded.started_season`, String(input.mandate ?? "").slice(0, 2000), seasons, JSON.stringify(limits), state.season);
    this.appendEvents([{ season: state.season, kind: "council", text: `The Regent appointed a Lord Protector for ${seasons} season(s): “${String(input.mandate ?? "").slice(0, 160)}”`, realms: [state.playerRealm] }]);
    const seat = this.readParticipants("court").find((p) => p.role === "protector");
    if (seat) {
      const content = `<season-briefing season="${state.season}">\nThe Regent has appointed you Lord Protector for ${seasons} season(s) with this mandate:\n\n${input.mandate}\n\nYour powers: ${Object.entries(limits).filter(([, v]) => v).map(([k]) => k).join(", ")}. Read \`realm_report\` and \`list_orders\`, then govern this season within the mandate. Refer anything outside it to the Regent.\n</season-briefing>`;
      this.sql.exec(`INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'pending'`, `pr${state.season}`, state.season, seat.role, seat.targetId, seat.channelId, content);
      void this.deliverBriefings();
    }
    return this.readProtectorate()!;
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  dismissProtector(): Protectorate | null {
    this.ensureReady();
    if (this.rpcCallerKind === "do") throw new Error("Only the Regent dismisses a Lord Protector.");
    this.sql.exec(`UPDATE protectorate SET active = 0 WHERE id = 1`);
    const state = this.loadState();
    if (state) this.appendEvents([{ season: state.season, kind: "council", text: "The Regent resumed the seal; the Lord Protector stands down.", realms: [state.playerRealm] }]);
    return this.readProtectorate();
  }

  /** Card bookkeeping for the panel: which chat message renders which order or matter. */
  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  setCard(input: CardRef | { key: string; channelId: string; messageId: string; kind: string }): CardRef[] {
    this.ensureReady();
    this.sql.exec(`INSERT INTO cards (key, channel_id, message_id, kind, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id, kind = excluded.kind, updated_at = excluded.updated_at`, input.key, input.channelId, input.messageId, input.kind, nowIso());
    return this.readCards();
  }

  /** After the court is seated: the Herald introduces the council, the ambassadors present their credentials. */
  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async openCourt(): Promise<{ delivered: number; failed: number }> {
    this.ensureReady();
    const state = this.requireState();
    const player = state.realms[state.playerRealm]!;
    for (const p of this.readParticipants("court")) {
      const kind = p.role.split(":")[0]!;
      let content: string | null = null;
      if (kind === "herald") {
        const intro = ["chancellor", "treasurer", "marshal", "envoy"].map((r) => state.court[r]).filter(Boolean).map((c) => `- ${c!.name} of house ${c!.house}, ${c!.role}: ${c!.temperament}${c!.rival ? ` (and no friend of the ${c!.rival})` : ""}`).join("\n");
        const pending = state.crises.filter((c) => c.chosen === null);
        content = [
          `<opening-briefing>`,
          `The court of ${player.name} is seated for the first time under ${state.regent.name}. The heir ${state.heir.name} is ${state.heir.ageAtStart} years old; ${state.majoritySeason - state.season} seasons remain until the majority.`,
          `\nThe council:\n${intro}`,
          pending.length ? `\nMatters already on the table:\n${pending.map((c) => `- ${c.title} [${c.id}]`).join("\n")}` : "",
          `\nYou are the Herald. Welcome the Regent in a few warm lines, introduce each minister in one sentence each, and explain in plain words how this court works: the Regent speaks, ministers act within their portfolios, sensitive acts wait for the seal, and the season closes when the Regent says so. Then invite the first order of business: suggest the Regent ask the Treasurer how the realm is fed, and mention that the ambassadors are waiting in the antechamber. Keep the whole thing under twelve lines.`,
          `</opening-briefing>`,
        ].join("\n");
      } else if (kind === "ambassador") {
        content = [
          `<opening-briefing>`,
          `You present your credentials at the court of ${player.name}. Your sovereign rules ${state.realms[p.realm]!.name}, ${state.realms[p.realm]!.character}. Introduce yourself to the Regent in a few lines, state what your sovereign hopes for from this Regency, and start your dossier with \`write_dossier\` (first impressions).`,
          `</opening-briefing>`,
        ].join("\n");
      } else if (kind === "sovereign") {
        content = [
          `<opening-briefing>`,
          `Your reign in ${state.realms[p.realm]!.name} begins as the neighbouring Regency of ${player.name} opens its court. Read \`realm_report\` and \`map_overview\`, write your opening doctrine with \`write_doctrine\` (your goals for the first year in three or four sentences), send your ambassador at the Regent's court one line of instruction with \`notify\`, then play your first season and call \`end_turn\`.`,
          `</opening-briefing>`,
        ].join("\n");
      }
      if (!content) continue;
      this.sql.exec(`INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO NOTHING`, `open-${p.role}`, state.season, p.role, p.targetId, p.channelId, content);
    }
    return this.deliverBriefings();
  }

  // ── Participants & briefings ──────────────────────────────────────────────

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  registerParticipant(input: Participant): Participant[] {
    this.ensureReady();
    if (this.rpcCallerKind === "do") throw new Error("Seats at court are assigned by the Regent's panel, not by agents.");
    this.sql.exec(`INSERT INTO participants (role, channel_id, realm, participant_id, target_id, handle, name, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(role, channel_id) DO UPDATE SET realm = excluded.realm, participant_id = excluded.participant_id, target_id = excluded.target_id, handle = excluded.handle, name = excluded.name, kind = excluded.kind`, input.role, input.channelId, input.realm, input.participantId, input.targetId, input.handle, input.name, input.kind ?? "court");
    return this.readParticipants();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  unregisterParticipant(input: { role: string; channelId?: string }): Participant[] {
    this.ensureReady();
    if (this.rpcCallerKind === "do") throw new Error("Seats at court are removed by the Regent's panel, not by agents.");
    if (input.channelId) this.sql.exec(`DELETE FROM participants WHERE role = ? AND channel_id = ?`, input.role, input.channelId);
    else this.sql.exec(`DELETE FROM participants WHERE role = ?`, input.role);
    return this.readParticipants();
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  listParticipants(): Participant[] {
    this.ensureReady();
    return this.readParticipants();
  }

  private queueBriefings(state: GameState, events: GameEvent[], rejected: string[]): void {
    const participants = this.readParticipants("court");
    const season = state.season;
    const label = seasonLabel(state);
    const eventsFor = (realm: RealmId) => events.filter((e) => e.realms.includes(realm) || ["war", "treaty", "capture", "elimination", "victory", "defeat"].includes(e.kind)).map((e) => `- ${e.text}`).join("\n") || "- A quiet season.";
    const pendingCrises = state.crises.filter((c) => c.chosen === null);
    const digest = state.digest[state.digest.length - 1] ?? "";
    const orderBook = this.readOrders(state.season - 1).map((o) => `- ${o.actor}: ${describeOrder(state, o.order)} (${o.status})`).join("\n");
    const leaks = this.readBribes().filter((b) => b.status === "accepted" && (b.untilSeason === null || b.untilSeason > state.season));
    const yearEnd = state.season % 4 === 0 && state.season > 0;
    for (const p of participants) {
      const kind = p.role.split(":")[0]!;
      let content: string | null = null;
      if (kind === "herald" || kind === "protector") {
        const courtLines = ["chancellor", "treasurer", "marshal", "envoy"].map((r) => state.court[r]).filter(Boolean).map((c) => `- ${c!.name} (${c!.role}): ${moodOf(c!.standing)}`).join("\n");
        content = [
          `<season-briefing season="${season}">`,
          `# ${label} has begun`,
          `In brief: ${digest}`,
          `\nThe chronicle of the season just passed, as it concerns ${state.realms[p.realm]!.name}:`,
          eventsFor(p.realm),
          rejected.length ? `\nOrders that could not be carried out:\n${rejected.map((r) => `- ${r}`).join("\n")}` : "",
          pendingCrises.length ? `\n## Matters awaiting the Regent's decision\n${pendingCrises.map((c) => crisisSummary(state, c)).join("\n\n")}` : "",
          `\n## The court\n${courtLines}`,
          kind === "herald"
            ? `\nYou are the Herald. Announce the new season to the court in three or four lines, tell the Regent plainly what awaits their decision (matters above, and any orders awaiting the seal from \`list_orders\`), then use \`notify\` to address each minister whose portfolio the news touches (@marshal for battles and sieges, @treasurer for gold and famine, @chancellor for unrest, laws and the estates, @envoy for treaties and proposals). Ask them for counsel or orders. Do not issue orders yourself, and do not seal, veto or decide unless the Regent has explicitly said so.`
            : `\nYou are the Lord Protector. Rule this season within your written mandate: read \`list_orders\` and \`realm_report\`, decide the matters above with \`decide_crisis\` if your mandate allows, seal or veto what the mandate allows, refer everything else to the Regent with a short note, and close the season with \`close_season\` when the council's orders are in.`,
          state.outcome ? `\n**The game has ended: ${state.outcome.title}.** ${state.outcome.reason}\n\n${state.outcome.verdict ?? ""}` : "",
          `</season-briefing>`,
        ].join("\n");
      } else if (kind === "sovereign") {
        const doctrine = this.sql.exec<{ text: string; season: number }>(`SELECT text, season FROM doctrines WHERE realm = ?`, p.realm).toArray()[0];
        const leak = leaks.some((b) => b.fromRealm === p.realm) && orderBook ? `\n## From a friend at the Regent's court\nLast season's order book of ${state.realms[state.playerRealm]!.name}:\n${orderBook}` : "";
        content = [
          `<season-briefing season="${season}">`,
          `# ${label} has begun`,
          `News concerning ${state.realms[p.realm]!.name}:`,
          eventsFor(p.realm),
          doctrine ? `\n## Your doctrine (written ${seasonLabel({ season: doctrine.season, startYear: state.startYear })})\n${doctrine.text}` : "",
          leak,
          `\nIt is your turn. Confer with your ambassador at the Regent's court if there is anything to negotiate (use \`notify\` with their directory ref), review your realm with \`realm_report\`, respond to pending proposals, issue this season's orders with \`submit_order\`, then call \`end_turn\`.${yearEnd ? " A year has passed: before ending your turn, write or revise your doctrine with `write_doctrine` — what worked, what did not, what you will do differently." : ""} Speak briefly in character as you decide.`,
          state.outcome ? `\n**The game has ended: ${state.outcome.title}.** ${state.outcome.reason}` : "",
          `</season-briefing>`,
        ].join("\n");
      } else if (kind === "ambassador") {
        const diplomatic = events.filter((e) => e.realms.includes(p.realm) && ["war", "treaty", "proposal", "capture", "elimination", "crisis"].includes(e.kind)).map((e) => `- ${e.text}`).join("\n");
        if (!diplomatic && season % 4 !== 0) continue;
        const dossier = this.sql.exec<{ text: string }>(`SELECT text FROM dossiers WHERE role = ?`, p.role).toArray()[0]?.text;
        content = [
          `<season-briefing season="${season}">`,
          `# ${label}`,
          `Diplomatic news touching ${state.realms[p.realm]!.name} and the Regency:`,
          diplomatic || "- Nothing of note; a good moment to reaffirm ties or raise a grievance.",
          dossier ? `\n## Your dossier on the Regent\n${dossier}` : "\nYou keep no dossier on the Regent yet; start one with `write_dossier` after your first audience.",
          `\nConfer with your sovereign by \`notify\` before committing to anything beyond trade. Then say what your sovereign would want said at the Regent's court, briefly, and update your dossier if the Regent has kept or broken a word.`,
          `</season-briefing>`,
        ].join("\n");
      } else if (["chancellor", "treasurer", "marshal", "envoy"].includes(kind)) {
        // Ministers are addressed by the Herald; they only get a private word when tempted, in their chambers if they have them.
        const temptations = this.readBribes().filter((b) => b.status === "pending" && b.targetRole === kind);
        if (temptations.length === 0) continue;
        const chambers = this.readParticipants("chambers").find((c) => c.role === kind);
        if (chambers && chambers.channelId !== p.channelId) continue;
        content = [
          `<private-word season="${season}">`,
          `A discreet messenger from ${temptations.map((b) => state.realms[b.fromRealm]?.name).join(" and ")} has found you alone. Use \`my_temptations\` to read the offer, then \`respond_bribe\` to accept or to report it to the Regent. Nobody else has seen this.`,
          `</private-word>`,
        ].join("\n");
      }
      if (!content) continue;
      const id = `b${season}-${p.role}`;
      this.sql.exec(`INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'pending', error = NULL`, id, season, p.role, p.targetId, p.channelId, content);
    }
  }

  private async nudgeSovereigns(state: GameState, waiting: RealmId[]): Promise<void> {
    for (const p of this.readParticipants("court")) {
      if (!p.role.startsWith("sovereign:") || !waiting.includes(p.realm)) continue;
      const id = `n${state.season}-${p.role}`;
      const content = `<season-briefing season="${state.season}">\nThe Regent of ${state.realms[state.playerRealm]!.name} has closed the court for ${seasonLabel(state)} and waits on ${state.realms[p.realm]!.name}. Finish your orders and call \`end_turn\`.\n</season-briefing>`;
      this.sql.exec(`INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO NOTHING`, id, state.season, p.role, p.targetId, p.channelId, content);
    }
    await this.deliverBriefings();
  }

  /** Deliver every pending briefing as an agent-initiated turn. Failures stay queued for `redeliverBriefings`. */
  private async deliverBriefings(): Promise<{ delivered: number; failed: number }> {
    let delivered = 0;
    let failed = 0;
    for (const b of this.readBriefings("pending")) {
      try {
        await this.rpc.call(b.targetId, "receiveBriefing", [{ channelId: b.channelId, content: b.content, steeringId: `regency:${this.objectKey}:${b.id}` }]);
        this.sql.exec(`UPDATE briefings SET status = 'delivered', error = NULL WHERE id = ?`, b.id);
        delivered += 1;
      } catch (err) {
        this.sql.exec(`UPDATE briefings SET status = 'failed', error = ? WHERE id = ?`, err instanceof Error ? err.message : String(err), b.id);
        failed += 1;
      }
    }
    return { delivered, failed };
  }

  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async redeliverBriefings(): Promise<{ delivered: number; failed: number }> {
    this.ensureReady();
    this.sql.exec(`UPDATE briefings SET status = 'pending' WHERE status = 'failed'`);
    return this.deliverBriefings();
  }
}

export const RULES_SUMMARY = `# How Regency is played

Seasons are turns. During a season every court issues orders; the Regent closes the season; once every sovereign has ended its turn the world resolves in one deterministic pass: laws and treaties, then spending, then war declarations, then marches and battles, then sieges, then harvest, taxes and unrest.

## Orders (submit_order)
- build {province, building}: farm (food), market (gold, needs dev ≥ 2), fort (walls), road, mine (iron/gold/salt), granary, shrine (calm), barracks (regulars).
- muster {province, unit, companies}: levy (cheap), regular (barracks or capital), cavalry (needs horses), siege (needs timber and iron).
- move {army, to}: one adjacent province per season. You may only enter your own, neutral, enemy (at war) or allied provinces.
- merge {army, into}, disband {army}.
- set_tax {taxRate 0.1–0.6}, set_conscription {level 0–1}, set_granary_reserve {share 0–1}.
- enact_edict {edict}: a law as data — conditions over provinces (unrest, population, food_ratio, development, garrison, fort, granary, is_border, coastal, terrain, resource, famine_streak) and actions (tax_relief, grain_dole, garrison_levy, public_works, curfew). repeal_edict {edictId}.
- declare_war {target}; propose {proposal: {to, kind, terms, message}}; respond {proposalId, accept, message}; withdraw {proposalId}; cede_province {province, to}; colonize {province, from} (a neutral neighbour, for gold).

## Treaties
${TREATY_GUIDE}

## Money and bread
Taxes scale with population, development and the tax rate; high taxes raise unrest. Food is pooled across the realm; shortfalls draw on granaries, then the grain dole (if an edict allows), then people starve. Unrest above 80 becomes a revolt.

## Winning and losing (the Regency only)
Win: reach the heir's majority with legitimacy ≥ 40; or hold 55% of all provinces; or ally with every surviving realm. Lose: the capital falls, legitimacy reaches 0, or three seasons of deep debt.

## The court
Ministers hold portfolios: chancellor (laws, taxes), treasurer (building, colonies), marshal (armies, war), envoy (treaties). Sensitive acts (war, laws, alliances, taxes, ceding land) await the Regent's seal unless the minister holds a plenary mandate. The Herald interprets the Regent's words and carries them to the right minister.`;

export default {
  async fetch(_request: Request) {
    return new Response("Regency realm state service. Resolve examples.regency.v1 and call RegencyGameDO methods over unified RPC.", { headers: { "Content-Type": "text/plain" } });
  },
};
