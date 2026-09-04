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
  describeEffects,
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
  applyPromiseVerdict,
  settlePromises,
  validateOrder,
  validatePromiseCheck,
  describePromiseCheck,
  RULES_SUMMARY,
  DEBATE_CARD,
  DIRECTORY_CARD,
  BRIEFING_CARD,
  FORECAST_CARD,
  HANDOVER_CARD,
  MANDATE_CARD,
  MATTER_CARD,
  PROTECTOR_CARD,
  READINESS_CARD,
  SEAL_CARD,
  SEASON_CARD,
  deriveRegencyAttention,
  deriveSeasonReadiness,
  type CardOp,
  type Crisis,
  type GameEvent,
  type GameState,
  type IntentKind,
  type Order,
  type PromiseCheck,
  type RealmId,
  type RegentPromise,
  type StagedIntent,
  type SubmittedOrder,
  type RegencyAttentionItem,
  type SeasonReadiness,
  type WorldOptions,
} from "@workspace/regency-engine";

export type MinisterRole = "chancellor" | "treasurer" | "marshal" | "envoy";
const MINISTER_ROLES: readonly MinisterRole[] = [
  "chancellor",
  "treasurer",
  "marshal",
  "envoy",
];
export type MandateLevel = "advise" | "act" | "plenary";

export type OrderStatus =
  | "pending"
  | "awaiting_seal"
  | "vetoed"
  | "withdrawn"
  | "resolved"
  | "rejected";

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
  attempts: number;
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

export interface Debate {
  id: string;
  season: number;
  question: string;
  openedBy: string;
  status: "open" | "closed";
  lines: Array<{ role: string; name: string; text: string }>;
}

export interface ChronicleEntry {
  year: number;
  season: number;
  text: string;
}

export interface Handover {
  id: string;
  season: number;
  mandate: string;
  text: string;
}

/** Everything the Regent could not see while it mattered, opened at the end. */
export interface SecretHistory {
  bribes: Bribe[];
  dossiers: Array<{ role: string; text: string }>;
  doctrines: Array<{ realm: RealmId; text: string; season: number }>;
  promises: RegentPromise[];
  diaries: Array<{ realm: RealmId; text: string }>;
  /** The private chambers, so the Regent may finally read them. */
  chambers: Array<{ role: string; channelId: string }>;
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
  dossiers: Array<{ role: string; text: string }>;
  doctrines: Array<{ realm: RealmId; text: string; season: number }>;
  /** What the council means to do, drawn on the map before it is ordered. */
  intents: StagedIntent[];
  promises: RegentPromise[];
  debates: Debate[];
  chronicles: ChronicleEntry[];
  handovers: Handover[];
  /** Null until the game ends; then everything that was hidden. */
  secrets: SecretHistory | null;
  readiness: SeasonReadiness | null;
  attention: RegencyAttentionItem[];
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
  | {
      ok: true;
      orderId: string;
      status: OrderStatus;
      summary: string;
      needsSeal: boolean;
    }
  | { ok: false; reason: string };

const EVENT_LIMIT = 80;
const LEGEND_DIR = "projects/regency/legends";
/** A briefing that fails to reach its agent is retried this many times from the alarm, then waits for the Regent's "re-send". */
const BRIEFING_ATTEMPTS = 3;
const BRIEFING_RETRY_MS = 10_000;
/** One legend per game object, so two Regencies in one workspace do not overwrite each other's memory. */
const legendPath = (gameKey: string) =>
  `${LEGEND_DIR}/${gameKey.replace(/[^A-Za-z0-9_-]+/g, "_") || "main"}.md`;

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
  static override schemaVersion = 3;

  protected override requiredTables(): readonly string[] {
    return [
      "game",
      "meta",
      "orders",
      "events",
      "participants",
      "mandates",
      "briefings",
      "snapshots",
      "cards",
      "bribes",
      "dossiers",
      "doctrines",
      "protectorate",
      "intents",
      "promises",
      "debates",
      "counsel",
      "chronicles",
      "handovers",
      "diaries",
      "presentation",
      "commands",
    ];
  }

  protected createTables(): void {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, season INTEGER NOT NULL, realm TEXT NOT NULL, actor TEXT NOT NULL, order_json TEXT NOT NULL, rationale TEXT NOT NULL, status TEXT NOT NULL, reason TEXT, submitted_at TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, season INTEGER NOT NULL, kind TEXT NOT NULL, event_json TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS participants (role TEXT NOT NULL, channel_id TEXT NOT NULL, realm TEXT NOT NULL, participant_id TEXT NOT NULL, target_id TEXT NOT NULL, handle TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'court', PRIMARY KEY (role, channel_id))`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS mandates (role TEXT PRIMARY KEY, level TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS briefings (id TEXT PRIMARY KEY, season INTEGER NOT NULL, role TEXT NOT NULL, target_id TEXT NOT NULL, channel_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS snapshots (season INTEGER PRIMARY KEY, state_json TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS cards (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS bribes (id TEXT PRIMARY KEY, season INTEGER NOT NULL, from_realm TEXT NOT NULL, target_role TEXT NOT NULL, gold REAL NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, until_season INTEGER)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS dossiers (role TEXT PRIMARY KEY, text TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS doctrines (realm TEXT PRIMARY KEY, text TEXT NOT NULL, season INTEGER NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS protectorate (id INTEGER PRIMARY KEY CHECK (id = 1), active INTEGER NOT NULL, mandate TEXT NOT NULL, seasons_left INTEGER NOT NULL, limits_json TEXT NOT NULL, started_season INTEGER NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS intents (id TEXT PRIMARY KEY, role TEXT NOT NULL, realm TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, season INTEGER NOT NULL, payload_json TEXT NOT NULL, order_id TEXT)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS promises (id TEXT PRIMARY KEY, to_realm TEXT NOT NULL, text TEXT NOT NULL, check_json TEXT NOT NULL, season INTEGER NOT NULL, status TEXT NOT NULL, settled INTEGER, recorded_by TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS debates (id TEXT PRIMARY KEY, season INTEGER NOT NULL, question TEXT NOT NULL, opened_by TEXT NOT NULL, status TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS counsel (debate_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (debate_id, role))`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS chronicles (year INTEGER PRIMARY KEY, season INTEGER NOT NULL, text TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS handovers (id TEXT PRIMARY KEY, season INTEGER NOT NULL, mandate TEXT NOT NULL, text TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS diaries (realm TEXT PRIMARY KEY, text TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS presentation (player TEXT NOT NULL, item_key TEXT NOT NULL, first_surfaced_revision INTEGER NOT NULL, last_narrated_revision INTEGER, acknowledged_revision INTEGER, dismissed INTEGER NOT NULL DEFAULT 0, resolved_revision INTEGER, PRIMARY KEY (player, item_key))`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS commands (command_id TEXT PRIMARY KEY, operation TEXT NOT NULL, caller_id TEXT NOT NULL, input_json TEXT NOT NULL, result_json TEXT NOT NULL, completed_season INTEGER NOT NULL)`,
    );
  }

  private replayCommand<T>(
    commandId: string | undefined,
    operation: string,
    payload: unknown,
  ): T | undefined {
    if (commandId === undefined) return undefined;
    const id = commandId.trim();
    if (!id || id.length > 160)
      throw new Error("A stable commandId is required.");
    const inputJson = JSON.stringify(payload);
    const callerId = this.rpcCallerId ?? this.rpcCallerKind;
    const row = this.sql
      .exec<{
        operation: string;
        caller_id: string;
        input_json: string;
        result_json: string;
      }>(
        `SELECT operation, caller_id, input_json, result_json FROM commands WHERE command_id = ?`,
        id,
      )
      .toArray()[0];
    if (!row) return undefined;
    if (
      row.operation !== operation ||
      row.caller_id !== callerId ||
      row.input_json !== inputJson
    )
      throw new Error(
        "That commandId was already used for a different command.",
      );
    return JSON.parse(row.result_json) as T;
  }

  private completeCommand<T>(
    commandId: string | undefined,
    operation: string,
    payload: unknown,
    result: T,
  ): T {
    if (commandId === undefined) return result;
    const state = this.requireState();
    this.sql.exec(
      `INSERT INTO commands (command_id, operation, caller_id, input_json, result_json, completed_season) VALUES (?, ?, ?, ?, ?, ?)`,
      commandId.trim(),
      operation,
      this.rpcCallerId ?? this.rpcCallerKind,
      JSON.stringify(payload),
      JSON.stringify(result),
      state.season,
    );
    return result;
  }

  // ── Small readers ─────────────────────────────────────────────────────────

  private readProtectorate(): Protectorate | null {
    const row = this.sql
      .exec<Record<string, unknown>>(`SELECT * FROM protectorate WHERE id = 1`)
      .toArray()[0];
    if (!row) return null;
    return {
      active: row["active"] === 1,
      mandate: row["mandate"] as string,
      seasonsLeft: row["seasons_left"] as number,
      limits: JSON.parse(row["limits_json"] as string) as ProtectorLimits,
      startedSeason: row["started_season"] as number,
    };
  }

  private protectorActive(): Protectorate | null {
    const p = this.readProtectorate();
    return p && p.active ? p : null;
  }

  private readBribes(): Bribe[] {
    return this.sql
      .exec<Record<string, unknown>>(`SELECT * FROM bribes ORDER BY season, id`)
      .toArray()
      .map((r) => ({
        id: r["id"] as string,
        season: r["season"] as number,
        fromRealm: r["from_realm"] as string,
        targetRole: r["target_role"] as string,
        gold: r["gold"] as number,
        note: r["note"] as string,
        status: r["status"] as Bribe["status"],
        untilSeason: (r["until_season"] as number | null) ?? null,
      }));
  }

  private readIntents(realm?: RealmId): StagedIntent[] {
    return this.sql
      .exec<Record<string, unknown>>(`SELECT * FROM intents ORDER BY rowid`)
      .toArray()
      .map((r) => ({
        id: r["id"] as string,
        role: r["role"] as string,
        realm: r["realm"] as string,
        kind: r["kind"] as IntentKind,
        label: r["label"] as string,
        season: r["season"] as number,
        payload: JSON.parse(
          r["payload_json"] as string,
        ) as StagedIntent["payload"],
        orderId: (r["order_id"] as string | null) ?? null,
      }))
      .filter((i) => !realm || i.realm === realm);
  }

  private readPromises(): RegentPromise[] {
    return this.sql
      .exec<Record<string, unknown>>(
        `SELECT * FROM promises ORDER BY season, id`,
      )
      .toArray()
      .map((r) => ({
        id: r["id"] as string,
        to: r["to_realm"] as string,
        text: r["text"] as string,
        check: JSON.parse(r["check_json"] as string) as PromiseCheck,
        season: r["season"] as number,
        status: r["status"] as RegentPromise["status"],
        settled: (r["settled"] as number | null) ?? null,
        recordedBy: r["recorded_by"] as string,
      }));
  }

  private savePromise(p: RegentPromise): void {
    this.sql.exec(
      `INSERT INTO promises (id, to_realm, text, check_json, season, status, settled, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, settled = excluded.settled`,
      p.id,
      p.to,
      p.text,
      JSON.stringify(p.check),
      p.season,
      p.status,
      p.settled,
      p.recordedBy,
    );
  }

  private readDebates(state: GameState | null): Debate[] {
    const lines = this.sql
      .exec<{
        debate_id: string;
        role: string;
        text: string;
      }>(`SELECT debate_id, role, text FROM counsel ORDER BY at`)
      .toArray();
    return this.sql
      .exec<Record<string, unknown>>(
        `SELECT * FROM debates ORDER BY season DESC, id DESC LIMIT 20`,
      )
      .toArray()
      .map((r) => ({
        id: r["id"] as string,
        season: r["season"] as number,
        question: r["question"] as string,
        openedBy: r["opened_by"] as string,
        status: r["status"] as Debate["status"],
        lines: lines
          .filter((l) => l.debate_id === r["id"])
          .map((l) => ({
            role: l.role,
            name: state?.court[l.role]?.name ?? l.role,
            text: l.text,
          })),
      }));
  }

  private readChronicles(): ChronicleEntry[] {
    return this.sql
      .exec<{
        year: number;
        season: number;
        text: string;
      }>(`SELECT year, season, text FROM chronicles ORDER BY year`)
      .toArray();
  }

  private readHandovers(): Handover[] {
    return this.sql
      .exec<{
        id: string;
        season: number;
        mandate: string;
        text: string;
      }>(`SELECT id, season, mandate, text FROM handovers ORDER BY season`)
      .toArray();
  }

  /** What each card said the last time the Herald published it. */
  private publishedCards(): Map<string, string> {
    return new Map(
      this.sql
        .exec<{ key: string; fingerprint: string }>(
          `SELECT key, fingerprint FROM cards`,
        )
        .toArray()
        .map((r) => [r.key, r.fingerprint]),
    );
  }

  /** Who is calling: the Regent's own hand (not an agent), the Herald, the Lord Protector, or another agent. */
  private callerSeat(): "regent" | "herald" | "protector" | "other" {
    if (this.rpcCallerKind !== "do") return "regent";
    if (
      this.rpcCallerId &&
      this.targetsFor("herald").includes(this.rpcCallerId)
    )
      return "herald";
    if (
      this.rpcCallerId &&
      this.protectorActive() &&
      this.targetsFor("protector").includes(this.rpcCallerId)
    )
      return "protector";
    return "other";
  }

  // ── State access ──────────────────────────────────────────────────────────

  private loadState(): GameState | null {
    const rows = this.sql
      .exec<{ state_json: string }>(`SELECT state_json FROM game WHERE id = 1`)
      .toArray();
    return rows.length ? (JSON.parse(rows[0]!.state_json) as GameState) : null;
  }

  private requireState(): GameState {
    const state = this.loadState();
    if (!state)
      throw new Error("No game has been founded yet. Call newGame first.");
    return state;
  }

  private saveState(state: GameState): void {
    this.sql.exec(
      `INSERT INTO game (id, state_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
      JSON.stringify(state),
      nowIso(),
    );
  }

  private appendEvents(events: GameEvent[]): void {
    for (const e of events)
      this.sql.exec(
        `INSERT INTO events (season, kind, event_json) VALUES (?, ?, ?)`,
        e.season,
        e.kind,
        JSON.stringify(e),
      );
  }

  private readEvents(
    limit = EVENT_LIMIT,
    sinceSeq = 0,
  ): Array<GameEvent & { seq: number }> {
    return this.sql
      .exec<{ seq: number; event_json: string }>(
        `SELECT seq, event_json FROM events WHERE seq > ? ORDER BY seq DESC LIMIT ?`,
        sinceSeq,
        limit,
      )
      .toArray()
      .reverse()
      .map((r) => ({ seq: r.seq, ...(JSON.parse(r.event_json) as GameEvent) }));
  }

  private allEvents(): GameEvent[] {
    return this.sql
      .exec<{ event_json: string }>(
        `SELECT event_json FROM events ORDER BY seq`,
      )
      .toArray()
      .map((r) => JSON.parse(r.event_json) as GameEvent);
  }

  private readOrders(season?: number): OrderRow[] {
    const rows =
      season === undefined
        ? this.sql
            .exec<
              Record<string, unknown>
            >(`SELECT * FROM orders ORDER BY submitted_at`)
            .toArray()
        : this.sql
            .exec<
              Record<string, unknown>
            >(`SELECT * FROM orders WHERE season = ? ORDER BY submitted_at`, season)
            .toArray();
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
      .exec<Record<string, string>>(
        `SELECT * FROM participants ORDER BY role, kind`,
      )
      .toArray()
      .map((r) => ({
        role: r["role"]!,
        realm: r["realm"]!,
        channelId: r["channel_id"]!,
        participantId: r["participant_id"]!,
        targetId: r["target_id"]!,
        handle: r["handle"]!,
        name: r["name"]!,
        kind: (r["kind"] as "court" | "chambers") ?? "court",
      }))
      .filter((p) => !kind || p.kind === kind);
  }

  /** Every object allowed to act in a role: the court seat and its chambers. */
  private targetsFor(role: string): string[] {
    return this.sql
      .exec<{ target_id: string }>(
        `SELECT target_id FROM participants WHERE role = ?`,
        role,
      )
      .toArray()
      .map((r) => r.target_id);
  }

  private readMandates(): Record<string, MandateLevel> {
    const out: Record<string, MandateLevel> = {};
    for (const role of MINISTER_ROLES) out[role] = "act";
    for (const r of this.sql
      .exec<{
        role: string;
        level: MandateLevel;
      }>(`SELECT role, level FROM mandates`)
      .toArray())
      out[r.role] = r.level;
    return out;
  }

  private readBriefings(status?: Briefing["status"]): Briefing[] {
    const rows = status
      ? this.sql
          .exec<
            Record<string, unknown>
          >(`SELECT * FROM briefings WHERE status = ? ORDER BY season, role`, status)
          .toArray()
      : this.sql
          .exec<
            Record<string, unknown>
          >(`SELECT * FROM briefings ORDER BY season DESC, role LIMIT 40`)
          .toArray();
    return rows.map((r) => ({
      id: r["id"] as string,
      season: r["season"] as number,
      role: r["role"] as string,
      targetId: r["target_id"] as string,
      channelId: r["channel_id"] as string,
      content: r["content"] as string,
      status: r["status"] as Briefing["status"],
      error: (r["error"] as string | null) ?? null,
      attempts: (r["attempts"] as number | null) ?? 0,
    }));
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
      if (kind === "do")
        throw new Error(
          "An agent cannot act as the Regent. Ask the Regent, or use your own seat.",
        );
      return;
    }
    const registered = this.targetsFor(role);
    if (registered.length === 0) return; // unregistered roles are open (development, tests, the panel acting for an absent minister)
    if (kind === "do" && !registered.includes(this.rpcCallerId ?? "")) {
      throw new Error(
        `Caller ${this.rpcCallerId} is not the registered ${role} (${registered.join(", ")}).`,
      );
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async newGame(input: WorldOptions & { keepParticipants?: boolean }): Promise<{
    title: string;
    season: string;
    realms: Array<{ id: string; name: string; sovereign: string }>;
    legend: boolean;
  }> {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error(
        "A new Regency is founded from the Regent's panel, not by an agent.",
      );
    const seed =
      (input.seed ?? "").trim() || `regency-${crypto.randomUUID().slice(0, 8)}`;
    const state = generateWorld({ ...input, seed });
    const legend = await this.readLegend();
    if (legend) state.legend = legend;
    for (const table of [
      "orders",
      "events",
      "briefings",
      "snapshots",
      "cards",
      "bribes",
      "dossiers",
      "doctrines",
      "protectorate",
      "mandates",
      "intents",
      "promises",
      "debates",
      "counsel",
      "chronicles",
      "handovers",
      "diaries",
    ])
      this.sql.exec(`DELETE FROM ${table}`);
    if (!input.keepParticipants) this.sql.exec(`DELETE FROM participants`);
    this.saveState(state);
    this.sql.exec(
      `INSERT INTO snapshots (season, state_json) VALUES (?, ?)`,
      state.season,
      JSON.stringify(state),
    );
    this.appendEvents([
      {
        season: 0,
        kind: "season",
        text: `${state.title} begins in ${seasonLabel(state)}. The heir comes of age in ${state.majoritySeason} seasons.`,
        realms: Object.keys(state.realms),
      },
    ]);
    return {
      title: state.title,
      season: seasonLabel(state),
      realms: Object.values(state.realms).map((r) => ({
        id: r.id,
        name: r.name,
        sovereign: r.sovereign,
      })),
      legend: Boolean(legend),
    };
  }

  /** The legend of a previous Regency, if one was left in the workspace. */
  private async readLegend(): Promise<string | null> {
    try {
      const text = await this.fs.readFile(legendPath(this.objectKey), "utf8");
      const body = String(text).trim();
      return body ? body.slice(0, 2000) : null;
    } catch {
      return null;
    }
  }

  /** At the end, the Regency passes into legend: the next game will remember it. */
  private async writeLegend(state: GameState): Promise<void> {
    const player = state.realms[state.playerRealm]!;
    const events = this.allEvents();
    const betrayals = events
      .filter((e) => e.kind === "war" && e.realms.includes(state.playerRealm))
      .slice(-3)
      .map((e) => `- ${e.text}`);
    const broken = this.readPromises()
      .filter((p) => p.status === "broken")
      .slice(-4)
      .map(
        (p) =>
          `- broke a word given to ${state.realms[p.to]?.name ?? p.to}: “${p.text}”`,
      );
    const kept = this.readPromises().filter((p) => p.status === "kept").length;
    const body = [
      `# The Regency of ${player.name}`,
      "",
      `${state.outcome?.title ?? "An unfinished Regency"}. ${state.outcome?.reason ?? ""}`,
      "",
      `${state.regent.name} ruled for ${state.season} seasons in the name of the heir ${state.heir.name}. The Regency ended holding ${Object.values(state.provinces).filter((p) => p.owner === state.playerRealm).length} provinces, with legitimacy ${Math.round(player.legitimacy)}, prestige ${Math.round(player.prestige)}, infamy ${Math.round(player.infamy)}, and a personal reputation of ${Math.round(state.regent.reputation)}.`,
      kept ? `\n${kept} promise(s) were kept.` : "",
      broken.length ? `\n## Words broken\n${broken.join("\n")}` : "",
      betrayals.length ? `\n## Wars\n${betrayals.join("\n")}` : "",
      state.outcome?.verdict
        ? `\n## The heir's verdict\n${state.outcome.verdict}`
        : "",
      "",
      "_Written by the Regency game at the close of play. A new Regency reads this file as the memory of the courts that remember._",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await this.fs.mkdir(LEGEND_DIR, { recursive: true });
    } catch {
      // the folder may already exist, or the workspace may have no writable project root
    }
    try {
      await this.fs.writeFile(legendPath(this.objectKey), body);
      this.appendEvents([
        {
          season: state.season,
          kind: "council",
          text: `The Regency passes into legend: ${legendPath(this.objectKey)} will be read by the next court on this key.`,
          realms: [state.playerRealm],
        },
      ]);
    } catch (err) {
      // A workspace without a writable project folder keeps no legend; say so rather than pretend.
      this.appendEvents([
        {
          season: state.season,
          kind: "council",
          text: `No legend could be written (${err instanceof Error ? err.message : String(err)}); the next Regency will not remember this one.`,
          realms: [state.playerRealm],
        },
      ]);
    }
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  getGame(): GameView {
    this.ensureReady();
    const state = this.loadState();
    const waitingFor = state ? this.waitingFor(state) : [];
    const orders = state ? this.readOrders(state.season) : [];
    const awaiting = orders.filter(
      (order) => order.status === "awaiting_seal",
    ).length;
    const attention = state
      ? this.visibleAttention(state, awaiting, waitingFor)
      : [];
    return {
      state,
      participants: this.readParticipants(),
      mandates: this.readMandates(),
      orders,
      events: this.readEvents(),
      briefings: this.readBriefings("pending").concat(
        this.readBriefings("failed"),
      ),
      waitingFor,
      snapshots: this.sql
        .exec<{ season: number }>(
          `SELECT season FROM snapshots ORDER BY season`,
        )
        .toArray()
        .map((r) => r.season),
      protectorate: this.readProtectorate(),
      bribes: this.readBribes().filter(
        (b) => b.status === "reported" || state?.phase === "finished",
      ),
      dossiers:
        state?.phase === "finished"
          ? this.sql
              .exec<{
                role: string;
                text: string;
              }>(`SELECT role, text FROM dossiers`)
              .toArray()
          : [],
      doctrines: this.sql
        .exec<{
          realm: string;
          text: string;
          season: number;
        }>(`SELECT realm, text, season FROM doctrines`)
        .toArray(),
      intents: state ? this.readIntents() : [],
      promises: this.readPromises(),
      debates: this.readDebates(state),
      chronicles: this.readChronicles(),
      handovers: this.readHandovers(),
      secrets: state?.phase === "finished" ? this.secretHistory() : null,
      readiness: state
        ? deriveSeasonReadiness(state, awaiting, waitingFor)
        : null,
      attention,
    };
  }

  private visibleAttention(
    state: GameState,
    awaiting: number,
    waitingFor: RealmId[],
  ): RegencyAttentionItem[] {
    const items = deriveRegencyAttention(state, awaiting, waitingFor);
    const hidden = new Set(
      this.sql
        .exec<{ item_key: string }>(
          `SELECT item_key FROM presentation WHERE player = 'regent' AND (dismissed = 1 OR acknowledged_revision IS NOT NULL)`,
        )
        .toArray()
        .map((row) => row.item_key),
    );
    return items.filter((item) => !hidden.has(item.key));
  }

  private takeNarratableAttention(state: GameState): RegencyAttentionItem[] {
    const waitingFor = this.waitingFor(state);
    const awaiting = this.readOrders(state.season).filter(
      (order) => order.status === "awaiting_seal",
    ).length;
    const items = deriveRegencyAttention(state, awaiting, waitingFor);
    const narrated = new Set(
      this.sql
        .exec<{ item_key: string }>(
          `SELECT item_key FROM presentation WHERE player = 'regent' AND (dismissed = 1 OR last_narrated_revision IS NOT NULL)`,
        )
        .toArray()
        .map((row) => row.item_key),
    );
    const fresh = items.filter((item) => !narrated.has(item.key)).slice(0, 1);
    for (const item of fresh)
      this.sql.exec(
        `INSERT INTO presentation (player, item_key, first_surfaced_revision, last_narrated_revision, acknowledged_revision, dismissed, resolved_revision) VALUES ('regent', ?, ?, ?, NULL, 0, NULL) ON CONFLICT(player, item_key) DO UPDATE SET last_narrated_revision = excluded.last_narrated_revision, resolved_revision = NULL`,
        item.key,
        state.season,
        state.season,
      );
    return fresh;
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  attention(): RegencyAttentionItem[] {
    this.ensureReady();
    const state = this.requireState();
    const orders = this.readOrders(state.season);
    const waitingFor = this.waitingFor(state);
    const awaiting = orders.filter(
      (order) => order.status === "awaiting_seal",
    ).length;
    const revision = state.season;
    const items = deriveRegencyAttention(state, awaiting, waitingFor);
    const active = new Set(items.map((item) => item.key));
    for (const item of items)
      this.sql.exec(
        `INSERT INTO presentation (player, item_key, first_surfaced_revision, last_narrated_revision, acknowledged_revision, dismissed, resolved_revision) VALUES ('regent', ?, ?, NULL, NULL, 0, NULL) ON CONFLICT(player, item_key) DO UPDATE SET resolved_revision = NULL`,
        item.key,
        revision,
      );
    for (const row of this.sql
      .exec<{
        item_key: string;
      }>(
        `SELECT item_key FROM presentation WHERE player = 'regent' AND resolved_revision IS NULL`,
      )
      .toArray())
      if (!active.has(row.item_key))
        this.sql.exec(
          `UPDATE presentation SET resolved_revision = ? WHERE player = 'regent' AND item_key = ?`,
          revision,
          row.item_key,
        );
    return this.visibleAttention(state, awaiting, waitingFor);
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  dismissAttention(input: { key: string }): { ok: true } {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error("Only the Regent may dismiss their court guidance.");
    const state = this.requireState();
    this.sql.exec(
      `INSERT INTO presentation (player, item_key, first_surfaced_revision, acknowledged_revision, dismissed) VALUES ('regent', ?, ?, ?, 1) ON CONFLICT(player, item_key) DO UPDATE SET acknowledged_revision = excluded.acknowledged_revision, dismissed = 1`,
      input.key,
      state.season,
      state.season,
    );
    return { ok: true };
  }

  /** Everything that was hidden while it mattered. Only once the game is over. */
  private secretHistory(): SecretHistory {
    return {
      bribes: this.readBribes(),
      dossiers: this.sql
        .exec<{ role: string; text: string }>(`SELECT role, text FROM dossiers`)
        .toArray(),
      doctrines: this.sql
        .exec<{
          realm: string;
          text: string;
          season: number;
        }>(`SELECT realm, text, season FROM doctrines`)
        .toArray(),
      promises: this.readPromises(),
      diaries: this.sql
        .exec<{
          realm: string;
          text: string;
        }>(`SELECT realm, text FROM diaries`)
        .toArray(),
      chambers: this.readParticipants("chambers").map((p) => ({
        role: p.role,
        channelId: p.channelId,
      })),
    };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  getSnapshot(input: { season: number }): GameState | null {
    this.ensureReady();
    const row = this.sql
      .exec<{
        state_json: string;
      }>(`SELECT state_json FROM snapshots WHERE season = ?`, input.season)
      .toArray()[0];
    return row ? (JSON.parse(row.state_json) as GameState) : null;
  }

  /**
   * What-if: resolve a copy of the current season with the pending orders,
   * optionally some orders still awaiting the seal, and hypothetical extras.
   * Rival courts are assumed to play the steward policy.
   */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  forecast(
    input: {
      orders?: Order[];
      includeOrderIds?: string[];
      realm?: RealmId;
    } = {},
  ): Forecast {
    this.ensureReady();
    const state = this.requireState();
    const realm = input.realm ?? state.playerRealm;
    const rows = this.readOrders(state.season);
    const include = new Set(input.includeOrderIds ?? []);
    const submitted: SubmittedOrder[] = rows
      .filter(
        (o) =>
          o.status === "pending" ||
          (o.status === "awaiting_seal" && include.has(o.id)),
      )
      .map((o) => ({
        id: o.id,
        realm: o.realm,
        actor: o.actor,
        season: o.season,
        order: o.order,
      }));
    (input.orders ?? []).forEach((order, i) =>
      submitted.push({
        id: `what-if-${i}`,
        realm,
        actor: "forecast",
        season: state.season,
        order,
      }),
    );
    for (const r of Object.values(state.realms)) {
      if (r.eliminated || r.sovereign !== "agent" || r.turnEnded) continue;
      if (submitted.some((o) => o.realm === r.id)) continue;
      autoOrders(state, r.id).forEach((order, i) =>
        submitted.push({
          id: `steward-${r.id}-${i}`,
          realm: r.id,
          actor: "steward",
          season: state.season,
          order,
        }),
      );
    }
    const result = resolveSeason(state, submitted);
    const beforeRealm = state.realms[realm]!;
    const afterRealm = result.state.realms[realm]!;
    return {
      season: seasonLabel(state),
      treasury: { before: beforeRealm.treasury, after: afterRealm.treasury },
      legitimacy: {
        before: beforeRealm.legitimacy,
        after: afterRealm.legitimacy,
      },
      estates: { ...afterRealm.estates },
      provinces: {
        before: realmProvinces(state, realm).length,
        after: realmProvinces(result.state, realm).length,
      },
      wars: result.state.wars
        .filter(([a, b]) => a === realm || b === realm)
        .map(
          ([a, b]) =>
            `${result.state.realms[a]?.name} vs ${result.state.realms[b]?.name}`,
        ),
      events: result.events
        .filter(
          (e) =>
            e.realms.includes(realm) ||
            ["war", "treaty", "capture"].includes(e.kind),
        )
        .slice(0, 30)
        .map((e) => e.text),
      rejected: result.rejected.map((r) => `${r.order.actor}: ${r.reason}`),
      assumption:
        "Rival courts are assumed to follow the steward policy; battle rolls are the season's own. Treat this as a forecast, not a promise.",
    };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  getWorld(): GameState | null {
    this.ensureReady();
    return this.loadState();
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  events(input?: {
    sinceSeq?: number;
    limit?: number;
  }): Array<GameEvent & { seq: number }> {
    this.ensureReady();
    return this.readEvents(
      Math.min(500, input?.limit ?? EVENT_LIMIT),
      input?.sinceSeq ?? 0,
    );
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  report(input: {
    kind: "realm" | "province" | "map" | "chronicle" | "rules";
    realm?: RealmId;
    province?: string;
    limit?: number;
  }): string {
    this.ensureReady();
    const state = this.requireState();
    switch (input.kind) {
      case "realm":
        return realmReport(state, input.realm ?? state.playerRealm);
      case "province":
        return provinceReport(
          state,
          input.province ?? state.realms[state.playerRealm]!.capital,
        );
      case "map":
        return mapOverview(state);
      case "chronicle":
        return chronicle(
          this.allEvents(),
          state,
          input.realm,
          input.limit ?? 40,
        );
      case "rules":
        return RULES_SUMMARY;
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  submitOrder(input: SubmitOrderInput): SubmitOrderResult {
    this.ensureReady();
    const state = this.requireState();
    if (state.phase === "finished")
      return {
        ok: false,
        reason: `The game is over: ${state.outcome?.title}.`,
      };
    const role = input.actor;
    const portfolio = portfolioOf(role);
    const expectedRealm = roleRealm(role, state.playerRealm);
    if (input.realm !== expectedRealm)
      return {
        ok: false,
        reason: `${role} acts for ${state.realms[expectedRealm]?.name ?? expectedRealm}, not ${input.realm}.`,
      };
    try {
      this.assertActor(role);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const mandates = this.readMandates();
    const isMinister = (MINISTER_ROLES as readonly string[]).includes(
      portfolio,
    );
    if (portfolio === "herald")
      return {
        ok: false,
        reason:
          "The Herald relays and interprets; it holds no portfolio. Address the responsible minister.",
      };
    if (portfolio === "protector" && !this.protectorActive())
      return { ok: false, reason: "There is no Lord Protector in office." };
    if (isMinister && mandates[portfolio] === "advise")
      return {
        ok: false,
        reason: `The ${portfolio} currently holds an advisory mandate only. Ask the Regent for authority to act.`,
      };
    if (!allowedInPortfolio(portfolio, input.order?.kind))
      return {
        ok: false,
        reason: `${portfolio} may not issue ${String(input.order?.kind)} orders.`,
      };
    const problem = validateOrder(state, input.realm, input.order);
    if (problem) return { ok: false, reason: problem };
    const needsSeal =
      isMinister &&
      mandates[portfolio] !== "plenary" &&
      requiresSeal(input.order);
    const id = `o${crypto.randomUUID().slice(0, 8)}`;
    const status: OrderStatus = needsSeal ? "awaiting_seal" : "pending";
    this.sql.exec(
      `INSERT INTO orders (id, season, realm, actor, order_json, rationale, status, reason, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      id,
      state.season,
      input.realm,
      role,
      JSON.stringify(input.order),
      input.rationale ?? "",
      status,
      nowIso(),
    );
    this.linkIntent(role, id, input.order);
    this.requestDrain();
    const summary = describeOrder(state, input.order);
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `${state.realms[input.realm]!.name}'s ${role} ${needsSeal ? "asks the Regent's seal to" : "ordered:"} ${summary}${input.rationale ? ` — “${input.rationale}”` : ""}`,
        realms: [input.realm],
        data: { orderId: id, status },
      },
    ]);
    return { ok: true, orderId: id, status, summary, needsSeal };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  withdrawOrder(input: { orderId: string; actor: string }): {
    ok: boolean;
    reason?: string;
  } {
    this.ensureReady();
    const row = this.readOrders().find((o) => o.id === input.orderId);
    if (!row) return { ok: false, reason: `no order ${input.orderId}` };
    if (row.actor !== input.actor && input.actor !== "regent")
      return {
        ok: false,
        reason: "only the issuing seat or the Regent may withdraw an order",
      };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    if (row.status !== "pending" && row.status !== "awaiting_seal")
      return { ok: false, reason: `order is ${row.status}` };
    this.requestDrain();
    this.sql.exec(
      `UPDATE orders SET status = 'withdrawn' WHERE id = ?`,
      input.orderId,
    );
    this.sql.exec(`DELETE FROM intents WHERE order_id = ?`, input.orderId);
    return { ok: true };
  }

  /**
   * The Regent's seal. The panel calls this as the user; the Herald may call
   * it only to carry out an explicit spoken decision of the Regent.
   */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  sealOrder(input: {
    commandId?: string;
    orderId: string;
    decision: "seal" | "veto";
    note?: string;
  }): { ok: boolean; reason?: string } {
    this.ensureReady();
    const payload = {
      orderId: input.orderId,
      decision: input.decision,
      note: input.note,
    };
    const replay = this.replayCommand<{ ok: boolean; reason?: string }>(
      input.commandId,
      "sealOrder",
      payload,
    );
    if (replay !== undefined) return replay;
    const state = this.requireState();
    const seat = this.callerSeat();
    if (seat === "other")
      return {
        ok: false,
        reason:
          "Only the Regent (or the Herald carrying the Regent's explicit word, or the Lord Protector within their mandate) may seal or veto.",
      };
    const row = this.readOrders().find((o) => o.id === input.orderId);
    if (!row) return { ok: false, reason: `no order ${input.orderId}` };
    if (row.status !== "awaiting_seal")
      return {
        ok: false,
        reason: `order is ${row.status}, not awaiting the seal`,
      };
    if (seat === "protector") {
      const limits = this.protectorActive()!.limits;
      const kind = row.order.kind;
      if (kind === "declare_war" && !limits.maySealWar)
        return {
          ok: false,
          reason:
            "The Lord Protector's mandate does not extend to war. Refer it to the Regent.",
        };
      if (
        (kind === "enact_edict" ||
          kind === "repeal_edict" ||
          kind === "set_tax") &&
        !limits.maySealLaws
      )
        return {
          ok: false,
          reason:
            "The Lord Protector's mandate does not extend to laws and taxes.",
        };
      if (
        (kind === "propose" ||
          kind === "respond" ||
          kind === "cede_province") &&
        !limits.maySealTreaties
      )
        return {
          ok: false,
          reason: "The Lord Protector's mandate does not extend to treaties.",
        };
    }
    const status: OrderStatus =
      input.decision === "seal" ? "pending" : "vetoed";
    this.sql.exec(
      `UPDATE orders SET status = ?, reason = ? WHERE id = ?`,
      status,
      input.note ?? null,
      input.orderId,
    );
    this.sql.exec(`DELETE FROM intents WHERE order_id = ?`, input.orderId);
    const who = seat === "protector" ? "The Lord Protector" : "The Regent";
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `${who} ${input.decision === "seal" ? "sealed" : "vetoed"} the ${row.actor}'s order to ${describeOrder(state, row.order)}${input.note ? `: “${input.note}”` : "."}`,
        realms: [row.realm],
        data: { orderId: row.id, decision: input.decision, by: seat },
      },
    ]);
    return this.completeCommand(input.commandId, "sealOrder", payload, {
      ok: true,
    });
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listOrders(input?: { season?: number; realm?: RealmId }): OrderRow[] {
    this.ensureReady();
    const state = this.loadState();
    const rows = this.readOrders(input?.season ?? state?.season);
    return input?.realm ? rows.filter((r) => r.realm === input.realm) : rows;
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  setMandate(input: {
    role: MinisterRole;
    level: MandateLevel;
  }): Record<string, MandateLevel> {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error("Only the Regent may change a minister's mandate.");
    if (!MINISTER_ROLES.includes(input.role))
      throw new Error(`unknown minister ${input.role}`);
    if (!["advise", "act", "plenary"].includes(input.level))
      throw new Error(`unknown mandate level ${input.level}`);
    this.sql.exec(
      `INSERT INTO mandates (role, level) VALUES (?, ?) ON CONFLICT(role) DO UPDATE SET level = excluded.level`,
      input.role,
      input.level,
    );
    const state = this.loadState();
    if (state)
      this.appendEvents([
        {
          season: state.season,
          kind: "council",
          text: `The Regent set the ${input.role}'s mandate to “${input.level}”.`,
          realms: [state.playerRealm],
        },
      ]);
    return this.readMandates();
  }

  // ── Turn clock ────────────────────────────────────────────────────────────

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  endTurn(input: { realm: RealmId; actor: string }): {
    ok: boolean;
    reason?: string;
    waitingFor: RealmId[];
    resolved: boolean;
  } {
    this.ensureReady();
    const state = this.requireState();
    const realm = state.realms[input.realm];
    if (!realm)
      return {
        ok: false,
        reason: `unknown realm ${input.realm}`,
        waitingFor: this.waitingFor(state),
        resolved: false,
      };
    if (roleRealm(input.actor, state.playerRealm) !== input.realm)
      return {
        ok: false,
        reason: `${input.actor} does not speak for ${realm.name}`,
        waitingFor: this.waitingFor(state),
        resolved: false,
      };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
        waitingFor: this.waitingFor(state),
        resolved: false,
      };
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
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  closeSeason(input: { commandId?: string } | null = null): {
    resolved: boolean;
    waitingFor: RealmId[];
    season: string;
  } {
    this.ensureReady();
    const payload = {};
    const replay = this.replayCommand<{
      resolved: boolean;
      waitingFor: RealmId[];
      season: string;
    }>(input?.commandId, "closeSeason", payload);
    if (replay !== undefined) return replay;
    const state = this.requireState();
    const seat = this.callerSeat();
    if (seat === "other")
      throw new Error(
        "Only the Regent (or the Herald on the Regent's word, or a Lord Protector so empowered) closes the season.",
      );
    if (seat === "protector" && !this.protectorActive()!.limits.mayCloseSeason)
      throw new Error(
        "The Lord Protector's mandate does not allow closing the season.",
      );
    if (state.phase === "finished")
      return this.completeCommand(input?.commandId, "closeSeason", payload, {
        resolved: false,
        waitingFor: [],
        season: seasonLabel(state),
      });
    const undecided = state.crises.filter(
      (c) => c.chosen === null && c.season <= state.season,
    );
    if (undecided.length > 0 && seat === "regent") {
      // The Regent may close with matters undecided; they take their defaults. Say so in the chronicle.
      this.appendEvents([
        {
          season: state.season,
          kind: "council",
          text: `The Regent closed the court with ${undecided.length} matter(s) undecided; they take their default course.`,
          realms: [state.playerRealm],
        },
      ]);
    }
    const awaiting = this.readOrders(state.season).filter(
      (o) => o.status === "awaiting_seal",
    );
    if (awaiting.length > 0) {
      throw new Error(
        `${awaiting.length} order(s) still await the Regent's seal: ${awaiting.map((o) => `${o.id} (${describeOrder(state, o.order)})`).join("; ")}. Seal or veto them first.`,
      );
    }
    state.realms[state.playerRealm]!.turnEnded = true;
    const waiting = this.waitingFor(state);
    if (waiting.length === 0) {
      const next = this.resolve(state);
      return this.completeCommand(input?.commandId, "closeSeason", payload, {
        resolved: true,
        waitingFor: [],
        season: seasonLabel(next),
      });
    }
    state.phase = "closing";
    this.saveState(state);
    this.appendEvents([
      {
        season: state.season,
        kind: "season",
        text: `The Regent has closed the court for ${seasonLabel(state)}; waiting on ${waiting.map((r) => state.realms[r]!.name).join(", ")}.`,
        realms: Object.keys(state.realms),
      },
    ]);
    void this.nudgeSovereigns(state, waiting);
    return this.completeCommand(input?.commandId, "closeSeason", payload, {
      resolved: false,
      waitingFor: waiting,
      season: seasonLabel(state),
    });
  }

  /** The Regent's explicit choice to proceed; absent sovereigns are played by the steward policy. */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  proceedWithoutPending(): {
    resolved: boolean;
    stewarded: RealmId[];
    season: string;
  } {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error("Only the Regent may proceed without the other courts.");
    const state = this.requireState();
    if (state.phase === "finished")
      return { resolved: false, stewarded: [], season: seasonLabel(state) };
    if (state.phase !== "closing")
      throw new Error(
        "The Regent may proceed without other courts only after closing this court.",
      );
    const waiting = this.waitingFor(state);
    for (const realm of waiting) {
      const existing = this.readOrders(state.season).some(
        (o) => o.realm === realm && o.status === "pending",
      );
      if (!existing) {
        for (const order of autoOrders(state, realm)) {
          const id = `o${crypto.randomUUID().slice(0, 8)}`;
          this.sql.exec(
            `INSERT INTO orders (id, season, realm, actor, order_json, rationale, status, reason, submitted_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`,
            id,
            state.season,
            realm,
            "steward",
            JSON.stringify(order),
            "steward policy (sovereign absent)",
            nowIso(),
          );
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
    const submitted: SubmittedOrder[] = rows.map((o) => ({
      id: o.id,
      realm: o.realm,
      actor: o.actor,
      season: o.season,
      order: o.order,
    }));
    const vetoed = all.filter((o) => o.status === "vetoed").map((o) => o.order);
    const result = resolveSeason(state, submitted, { vetoed });
    // The protectorate runs down by seasons of the game, never by the clock.
    const protectorate = this.readProtectorate();
    if (protectorate && protectorate.active) {
      const left = protectorate.seasonsLeft - 1;
      this.sql.exec(
        `UPDATE protectorate SET seasons_left = ?, active = ? WHERE id = 1`,
        Math.max(0, left),
        left > 0 ? 1 : 0,
      );
      if (left <= 0) {
        result.events.push({
          season: state.season,
          kind: "council",
          text: "The Lord Protector's mandate has run its course; the Regent resumes the seal.",
          realms: [state.playerRealm],
        });
        this.queueHandover(result.state, protectorate);
      }
    }
    // The Regent's word, judged against the world the season just made.
    const promises = this.readPromises();
    const settled = settlePromises(result.state, promises);
    for (const promise of settled) {
      this.savePromise(promise);
      result.events.push({
        season: result.state.season,
        kind: "council",
        text:
          promise.status === "kept"
            ? `The Regent kept a word given to ${result.state.realms[promise.to]?.name ?? promise.to}: “${promise.text}”`
            : `The Regent broke a word given to ${result.state.realms[promise.to]?.name ?? promise.to}: “${promise.text}” — infamy rises and their regard falls.`,
        realms: [result.state.playerRealm, promise.to],
        data: { promiseId: promise.id, status: promise.status },
      });
    }
    // Every intent the council staged belonged to the season that has passed.
    this.sql.exec(`DELETE FROM intents`);
    for (const b of this.readBribes()) {
      if (b.status === "pending" && state.season - b.season >= 2)
        this.sql.exec(
          `UPDATE bribes SET status = 'expired' WHERE id = ?`,
          b.id,
        );
      if (
        b.status === "accepted" &&
        b.untilSeason !== null &&
        result.state.season >= b.untilSeason
      )
        this.sql.exec(
          `UPDATE bribes SET status = 'expired' WHERE id = ?`,
          b.id,
        );
    }
    const rejectedIds = new Map(
      result.rejected.map((r) => [r.order.id, r.reason]),
    );
    for (const o of rows) {
      const reason = rejectedIds.get(o.id);
      this.sql.exec(
        `UPDATE orders SET status = ?, reason = ? WHERE id = ?`,
        reason ? "rejected" : "resolved",
        reason ?? null,
        o.id,
      );
    }
    for (const o of this.readOrders(state.season))
      if (o.status === "awaiting_seal")
        this.sql.exec(
          `UPDATE orders SET status = 'vetoed', reason = 'the season closed without the seal' WHERE id = ?`,
          o.id,
        );
    this.saveState(result.state);
    this.sql.exec(
      `INSERT INTO snapshots (season, state_json) VALUES (?, ?) ON CONFLICT(season) DO UPDATE SET state_json = excluded.state_json`,
      result.state.season,
      JSON.stringify(result.state),
    );
    this.appendEvents(result.events);
    for (const r of result.rejected)
      this.appendEvents([
        {
          season: state.season,
          kind: "council",
          text: `Order by ${r.order.actor} could not be carried out: ${r.reason}`,
          realms: [r.order.realm],
          data: { orderId: r.order.id },
        },
      ]);
    this.queueBriefings(
      result.state,
      result.events,
      result.rejected.map((r) => `${r.order.actor}: ${r.reason}`),
    );
    this.requestDrain();
    if (result.state.outcome && !state.outcome)
      void this.writeLegend(result.state);
    return result.state;
  }

  // ── Staged intents: speech drawn on the map before it is an order ────────

  /** The intent kind an order of this kind would fulfil. */
  private static intentKindFor(kind: Order["kind"]): IntentKind {
    switch (kind) {
      case "move":
        return "march";
      case "enact_edict":
      case "repeal_edict":
      case "set_tax":
      case "set_conscription":
      case "set_granary_reserve":
        return "edict";
      case "propose":
      case "respond":
      case "withdraw":
      case "cede_province":
      case "declare_war":
        return "offer";
      case "build":
        return "build";
      case "muster":
        return "muster";
      default:
        return "other";
    }
  }

  /** Bind the newest matching unlinked intent of a seat to the order it became. */
  private linkIntent(role: string, orderId: string, order: Order): void {
    const want = RegencyGameDO.intentKindFor(order.kind);
    const candidates = this.readIntents().filter(
      (i) => i.role === role && i.orderId === null && i.kind === want,
    );
    const province = (order as { province?: string }).province;
    const army = (order as { army?: string }).army;
    const best =
      candidates.find(
        (i) =>
          (army && i.payload.army === army) ||
          (province &&
            (i.payload.province === province || i.payload.to === province)),
      ) ?? candidates[candidates.length - 1];
    if (best)
      this.sql.exec(
        `UPDATE intents SET order_id = ? WHERE id = ?`,
        orderId,
        best.id,
      );
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  stageIntent(input: {
    actor: string;
    kind: IntentKind;
    label: string;
    payload?: StagedIntent["payload"];
  }): { ok: boolean; reason?: string; intent?: StagedIntent } {
    this.ensureReady();
    const state = this.requireState();
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const kinds: IntentKind[] = [
      "march",
      "edict",
      "offer",
      "build",
      "muster",
      "other",
    ];
    if (!kinds.includes(input.kind))
      return { ok: false, reason: `kind must be one of ${kinds.join(", ")}` };
    const label = String(input.label ?? "")
      .trim()
      .slice(0, 120);
    if (!label)
      return {
        ok: false,
        reason: "an intent needs a label the Regent can read on the map",
      };
    const realm = roleRealm(input.actor, state.playerRealm);
    const payload = { ...(input.payload ?? {}) } as StagedIntent["payload"];
    for (const key of ["province", "from", "to"] as const) {
      const id = payload[key];
      if (id !== undefined && !(id in state.provinces))
        return { ok: false, reason: `unknown province ${id} in ${key}` };
    }
    if (payload.army !== undefined) {
      const army = state.armies[payload.army];
      if (!army) return { ok: false, reason: `unknown army ${payload.army}` };
      if (army.realm !== realm)
        return { ok: false, reason: `${army.name} is not yours to move` };
      payload.from ??= army.province;
    }
    if (payload.target !== undefined && !(payload.target in state.realms))
      return { ok: false, reason: `unknown realm ${payload.target}` };
    const mine = this.readIntents().filter((i) => i.role === input.actor);
    if (mine.length >= 8)
      this.sql.exec(`DELETE FROM intents WHERE id = ?`, mine[0]!.id);
    const id = `i${crypto.randomUUID().slice(0, 8)}`;
    this.sql.exec(
      `INSERT INTO intents (id, role, realm, kind, label, season, payload_json, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      id,
      input.actor,
      realm,
      input.kind,
      label,
      state.season,
      JSON.stringify(payload),
    );
    return { ok: true, intent: this.readIntents().find((i) => i.id === id)! };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  clearIntent(input: { actor: string; intentId?: string }): {
    ok: boolean;
    cleared: number;
    reason?: string;
  } {
    this.ensureReady();
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        cleared: 0,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const mine = this.readIntents().filter(
      (i) =>
        i.role === input.actor && (!input.intentId || i.id === input.intentId),
    );
    for (const i of mine)
      this.sql.exec(`DELETE FROM intents WHERE id = ?`, i.id);
    return { ok: true, cleared: mine.length };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listIntents(input?: { realm?: RealmId }): StagedIntent[] {
    this.ensureReady();
    return this.readIntents(input?.realm);
  }

  // ── Named armies ─────────────────────────────────────────────────────────

  /** The Marshal names the companies he raises; a banner the Regent can follow. */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  renameArmy(input: { actor: string; army: string; name: string }): {
    ok: boolean;
    reason?: string;
    name?: string;
  } {
    this.ensureReady();
    const state = this.requireState();
    if (state.phase === "finished")
      return { ok: false, reason: "The game is over." };
    const portfolio = portfolioOf(input.actor);
    if (!["marshal", "sovereign", "regent", "protector"].includes(portfolio))
      return {
        ok: false,
        reason: "Only the Marshal, a sovereign or the Regent names an army.",
      };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const army = state.armies[input.army];
    if (!army) return { ok: false, reason: `no army ${input.army}` };
    const realm = roleRealm(input.actor, state.playerRealm);
    if (army.realm !== realm)
      return { ok: false, reason: `${army.name} does not answer to you` };
    const name = String(input.name ?? "")
      .replace(/[\u0000-\u001f]/g, " ")
      .trim()
      .slice(0, 40);
    if (name.length < 2)
      return { ok: false, reason: "a name must be 2–40 characters" };
    const was = army.name;
    army.name = name;
    this.saveState(state);
    this.appendEvents([
      {
        season: state.season,
        kind: "muster",
        text: `${was} takes a new banner: the ${name}.`,
        realms: [realm],
        province: army.province,
        data: { army: army.id },
      },
    ]);
    return { ok: true, name };
  }

  // ── The Regent's word ────────────────────────────────────────────────────

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  recordPromise(input: {
    actor: string;
    to: RealmId;
    text: string;
    check?: PromiseCheck;
  }): { ok: boolean; reason?: string; promise?: RegentPromise } {
    this.ensureReady();
    const state = this.requireState();
    const portfolio = portfolioOf(input.actor);
    if (!["envoy", "herald", "regent"].includes(portfolio))
      return {
        ok: false,
        reason:
          "Only the Envoy or the Herald writes the Regent's word into the ledger.",
      };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    if (!(input.to in state.realms) || input.to === state.playerRealm)
      return {
        ok: false,
        reason: `a promise is made to another realm, not ${input.to}`,
      };
    const text = String(input.text ?? "")
      .trim()
      .slice(0, 400);
    if (text.length < 4)
      return { ok: false, reason: "write down what was actually promised" };
    const check: PromiseCheck = input.check ?? { kind: "free_text" };
    const problem = validatePromiseCheck(state, check);
    if (problem) return { ok: false, reason: problem };
    const promise: RegentPromise = {
      id: `pr${crypto.randomUUID().slice(0, 8)}`,
      to: input.to,
      text,
      check,
      season: state.season,
      status: "pending",
      settled: null,
      recordedBy: input.actor,
    };
    this.savePromise(promise);
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `The Regent's word to ${state.realms[input.to]!.name} was written down: “${text}” (${describePromiseCheck(state, check)}).`,
        realms: [state.playerRealm, input.to],
        data: { promiseId: promise.id },
      },
    ]);
    return { ok: true, promise };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listPromises(): RegentPromise[] {
    this.ensureReady();
    return this.readPromises();
  }

  /** The Regent (or the Herald on their word) settles a promise the engine cannot judge. */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  settlePromise(input: { promiseId: string; status: "kept" | "broken" }): {
    ok: boolean;
    reason?: string;
  } {
    this.ensureReady();
    const state = this.requireState();
    if (this.callerSeat() === "other")
      return {
        ok: false,
        reason:
          "Only the Regent, or the Herald on the Regent's word, judges a promise kept or broken.",
      };
    const promise = this.readPromises().find((p) => p.id === input.promiseId);
    if (!promise) return { ok: false, reason: `no promise ${input.promiseId}` };
    if (promise.status !== "pending")
      return { ok: false, reason: `already ${promise.status}` };
    applyPromiseVerdict(state, promise, input.status);
    this.savePromise(promise);
    this.saveState(state);
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `The word given to ${state.realms[promise.to]?.name ?? promise.to} — “${promise.text}” — is judged ${input.status}.`,
        realms: [state.playerRealm, promise.to],
        data: { promiseId: promise.id },
      },
    ]);
    return { ok: true };
  }

  // ── Council debates ──────────────────────────────────────────────────────

  /** The Herald puts one question to the whole council and records what each says. */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  convene(input: { actor: string; question: string }): {
    ok: boolean;
    reason?: string;
    debateId?: string;
    asked?: string[];
  } {
    this.ensureReady();
    const state = this.requireState();
    const portfolio = portfolioOf(input.actor);
    if (!["herald", "protector", "regent"].includes(portfolio))
      return { ok: false, reason: "The Herald convenes the council." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const question = String(input.question ?? "")
      .trim()
      .slice(0, 400);
    if (question.length < 8)
      return {
        ok: false,
        reason: "a debate needs a question the council can answer",
      };
    const open = this.sql
      .exec<{ id: string }>(`SELECT id FROM debates WHERE status = 'open'`)
      .toArray();
    if (open.length >= 2)
      return {
        ok: false,
        reason: "two debates are already before the council; close one first",
      };
    const id = `d${crypto.randomUUID().slice(0, 8)}`;
    this.sql.exec(
      `INSERT INTO debates (id, season, question, opened_by, status) VALUES (?, ?, ?, ?, 'open')`,
      id,
      state.season,
      question,
      input.actor,
    );
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `The council is convened: “${question}”`,
        realms: [state.playerRealm],
        data: { debateId: id },
      },
    ]);
    const asked: string[] = [];
    const opener =
      portfolio === "regent"
        ? "The Regent"
        : portfolio === "protector"
          ? "The Lord Protector"
          : "The Herald";
    for (const p of this.readParticipants("court")) {
      if (!MINISTER_ROLES.includes(p.role as MinisterRole)) continue;
      asked.push(p.role);
      const content = [
        `<council-debate id="${id}" season="${state.season}">`,
        `${opener} puts a question to the whole council. Answer it once, in one or two sentences, from your own portfolio and your own interest — this is a debate, not a report.`,
        ``,
        `**${question}**`,
        ``,
        `Read what you need (\`realm_report\`, \`forecast_orders\`), then call \`give_counsel\` with debateId "${id}" and your line. Say it aloud to the court as well, briefly.`,
        `</council-debate>`,
      ].join("\n");
      this.sql.exec(
        `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'pending', error = NULL`,
        `${id}-${p.role}`,
        state.season,
        p.role,
        p.targetId,
        p.channelId,
        content,
      );
    }
    this.requestDrain();
    return { ok: true, debateId: id, asked };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  giveCounsel(input: { actor: string; debateId: string; text: string }): {
    ok: boolean;
    reason?: string;
    closed?: boolean;
  } {
    this.ensureReady();
    const state = this.requireState();
    if (!MINISTER_ROLES.includes(portfolioOf(input.actor) as MinisterRole))
      return {
        ok: false,
        reason: "Only a minister gives counsel in a debate.",
      };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const debate = this.sql
      .exec<
        Record<string, unknown>
      >(`SELECT * FROM debates WHERE id = ?`, input.debateId)
      .toArray()[0];
    if (!debate) return { ok: false, reason: `no debate ${input.debateId}` };
    if (debate["status"] !== "open")
      return { ok: false, reason: "that debate is closed" };
    const text = String(input.text ?? "")
      .trim()
      .slice(0, 600);
    if (text.length < 4) return { ok: false, reason: "say something" };
    this.sql.exec(
      `INSERT INTO counsel (debate_id, role, text, at) VALUES (?, ?, ?, ?) ON CONFLICT(debate_id, role) DO UPDATE SET text = excluded.text, at = excluded.at`,
      input.debateId,
      input.actor,
      text,
      nowIso(),
    );
    this.requestDrain();
    const answered =
      this.sql
        .exec<{
          n: number;
        }>(
          `SELECT COUNT(*) AS n FROM counsel WHERE debate_id = ?`,
          input.debateId,
        )
        .toArray()[0]?.n ?? 0;
    // Every minister who holds a seat has spoken (an unseated portfolio cannot answer).
    const seated = this.readParticipants("court").filter((p) =>
      MINISTER_ROLES.includes(p.role as MinisterRole),
    ).length;
    const closed =
      answered >=
      Math.max(
        1,
        Math.min(MINISTER_ROLES.length, seated || MINISTER_ROLES.length),
      );
    if (closed) {
      this.sql.exec(
        `UPDATE debates SET status = 'closed' WHERE id = ?`,
        input.debateId,
      );
      this.appendEvents([
        {
          season: state.season,
          kind: "council",
          text: `The council has answered “${String(debate["question"]).slice(0, 80)}”; ${answered} voice${answered === 1 ? " is" : "s are"} on the record.`,
          realms: [state.playerRealm],
          data: { debateId: input.debateId },
        },
      ]);
      this.queueVerdict(state, input.debateId, String(debate["question"]));
      this.requestDrain();
    }
    return { ok: true, closed };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  closeDebate(input: { debateId: string }): { ok: boolean; reason?: string } {
    this.ensureReady();
    if (this.callerSeat() === "other")
      return {
        ok: false,
        reason:
          "Only the Regent, or the Herald on the Regent's word, closes a debate.",
      };
    this.sql.exec(
      `UPDATE debates SET status = 'closed' WHERE id = ?`,
      input.debateId,
    );
    this.requestDrain();
    return { ok: true };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listDebates(): Debate[] {
    this.ensureReady();
    return this.readDebates(this.loadState());
  }

  // ── The chronicler and the hand-over ─────────────────────────────────────

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  writeChronicle(input: { actor: string; text: string; year?: number }): {
    ok: boolean;
    reason?: string;
    year?: number;
  } {
    this.ensureReady();
    const state = this.requireState();
    if (portfolioOf(input.actor) !== "chronicler")
      return { ok: false, reason: "Only the chronicler writes the chronicle." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const text = String(input.text ?? "")
      .trim()
      .slice(0, 3000);
    if (text.length < 20)
      return { ok: false, reason: "a year deserves more than a line" };
    const year = Number.isInteger(input.year)
      ? Number(input.year)
      : state.startYear + Math.floor(Math.max(0, state.season - 1) / 4);
    this.sql.exec(
      `INSERT INTO chronicles (year, season, text) VALUES (?, ?, ?) ON CONFLICT(year) DO UPDATE SET text = excluded.text, season = excluded.season`,
      year,
      state.season,
      text,
    );
    return { ok: true, year };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listChronicles(): ChronicleEntry[] {
    this.ensureReady();
    return this.readChronicles();
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  writeHandover(input: { actor: string; text: string }): {
    ok: boolean;
    reason?: string;
    id?: string;
  } {
    this.ensureReady();
    const state = this.requireState();
    if (portfolioOf(input.actor) !== "protector")
      return {
        ok: false,
        reason: "Only the Lord Protector writes a hand-over.",
      };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const text = String(input.text ?? "")
      .trim()
      .slice(0, 3000);
    if (text.length < 20)
      return { ok: false, reason: "the Regent deserves a proper account" };
    const id = `h${state.season}`;
    const mandate = this.readProtectorate()?.mandate ?? "";
    this.sql.exec(
      `INSERT INTO handovers (id, season, mandate, text) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET text = excluded.text`,
      id,
      state.season,
      mandate,
      text,
    );
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `The Lord Protector laid an account of the protectorate before the Regent.`,
        realms: [state.playerRealm],
        data: { handoverId: id },
      },
    ]);
    this.requestDrain();
    return { ok: true, id };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listHandovers(): Handover[] {
    this.ensureReady();
    return this.readHandovers();
  }

  // ── Courts that remember ─────────────────────────────────────────────────

  /** A rival court's private book on the Regent, kept by its sovereign. */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  writeRelationsDiary(input: { actor: string; text: string }): {
    ok: boolean;
    reason?: string;
  } {
    this.ensureReady();
    const state = this.requireState();
    if (!input.actor.startsWith("sovereign:"))
      return { ok: false, reason: "Only a sovereign keeps the court's diary." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const realm = roleRealm(input.actor, state.playerRealm);
    this.sql.exec(
      `INSERT INTO diaries (realm, text, updated_at) VALUES (?, ?, ?) ON CONFLICT(realm) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
      realm,
      String(input.text ?? "").slice(0, 3000),
      nowIso(),
    );
    return { ok: true };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  readRelationsDiary(input: { actor: string }): string {
    this.ensureReady();
    const state = this.requireState();
    this.assertActor(input.actor);
    return (
      this.sql
        .exec<{
          text: string;
        }>(
          `SELECT text FROM diaries WHERE realm = ?`,
          roleRealm(input.actor, state.playerRealm),
        )
        .toArray()[0]?.text ?? ""
    );
  }

  // ── Crises, intrigue, dossiers, doctrines, protectorate ──────────────────

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  decideCrisis(input: {
    commandId?: string;
    crisisId: string;
    optionId: string;
    note?: string;
  }): {
    ok: boolean;
    reason?: string;
    crisis?: Crisis;
  } {
    this.ensureReady();
    const payload = {
      crisisId: input.crisisId,
      optionId: input.optionId,
      note: input.note,
    };
    const replay = this.replayCommand<{
      ok: boolean;
      reason?: string;
      crisis?: Crisis;
    }>(input.commandId, "decideCrisis", payload);
    if (replay !== undefined) return replay;
    const state = this.requireState();
    const seat = this.callerSeat();
    if (seat === "other")
      return {
        ok: false,
        reason:
          "Only the Regent (or the Herald on the Regent's explicit word, or a Lord Protector so empowered) decides matters of state.",
      };
    if (seat === "protector" && !this.protectorActive()!.limits.mayDecideCrises)
      return {
        ok: false,
        reason:
          "The Lord Protector's mandate does not extend to matters of state. Refer it to the Regent.",
      };
    const c = state.crises.find((x) => x.id === input.crisisId);
    if (!c) return { ok: false, reason: `no matter ${input.crisisId}` };
    if (c.chosen !== null)
      return { ok: false, reason: `already decided: ${c.chosen}` };
    const option = c.options.find((o) => o.id === input.optionId);
    if (!option)
      return {
        ok: false,
        reason: `no option ${input.optionId}; choose one of ${c.options.map((o) => o.id).join(", ")}`,
      };
    c.chosen = option.id;
    c.decidedBy = seat;
    this.saveState(state);
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `${seat === "protector" ? "The Lord Protector" : "The Regent"} decided “${c.title}”: ${option.label}${input.note ? ` — “${input.note}”` : "."}`,
        realms: [c.realm],
        data: { crisisId: c.id, option: option.id, by: seat },
      },
    ]);
    this.requestDrain();
    return this.completeCommand(input.commandId, "decideCrisis", payload, {
      ok: true,
      crisis: c,
    });
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  offerBribe(input: {
    actor: string;
    targetRole: MinisterRole;
    gold: number;
    note: string;
  }): { ok: boolean; reason?: string; bribeId?: string } {
    this.ensureReady();
    const state = this.requireState();
    if (!input.actor.startsWith("sovereign:"))
      return {
        ok: false,
        reason: "Only a sovereign may set gold before a minister.",
      };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const realm = state.realms[roleRealm(input.actor, state.playerRealm)];
    if (!realm) return { ok: false, reason: "unknown realm" };
    if (!MINISTER_ROLES.includes(input.targetRole))
      return { ok: false, reason: `no such minister: ${input.targetRole}` };
    if (
      !(typeof input.gold === "number" && input.gold >= 10 && input.gold <= 200)
    )
      return { ok: false, reason: "gold must be 10..200" };
    if (realm.treasury < input.gold)
      return {
        ok: false,
        reason: `your treasury holds ${Math.floor(realm.treasury)} gold`,
      };
    if (
      this.readBribes().some(
        (b) =>
          b.status === "pending" &&
          b.fromRealm === realm.id &&
          b.targetRole === input.targetRole,
      )
    )
      return {
        ok: false,
        reason: "you already have an offer before that minister",
      };
    const id = `br${crypto.randomUUID().slice(0, 8)}`;
    this.sql.exec(
      `INSERT INTO bribes (id, season, from_realm, target_role, gold, note, status, until_season) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL)`,
      id,
      state.season,
      realm.id,
      input.targetRole,
      input.gold,
      (input.note ?? "").slice(0, 400),
    );
    // A private word reaches the minister at once: in their chambers if they have them, else at court.
    const seat =
      this.readParticipants("chambers").find(
        (p) => p.role === input.targetRole,
      ) ??
      this.readParticipants("court").find((p) => p.role === input.targetRole);
    if (seat) {
      const content = `<private-word season="${state.season}">\nA discreet messenger from ${realm.name} has found you alone. Use \`my_temptations\` to read the offer, then \`respond_bribe\` to accept or to report it to the Regent. Nobody else has seen this.\n</private-word>`;
      this.sql.exec(
        `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO NOTHING`,
        `t${id}`,
        state.season,
        seat.role,
        seat.targetId,
        seat.channelId,
        content,
      );
      this.requestDrain();
    }
    return { ok: true, bribeId: id };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  myTemptations(input: { actor: string }): Bribe[] {
    this.ensureReady();
    this.assertActor(input.actor);
    return this.readBribes().filter(
      (b) => b.targetRole === input.actor && b.status === "pending",
    );
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  respondBribe(input: {
    actor: string;
    bribeId: string;
    decision: "accept" | "report";
    note?: string;
  }): { ok: boolean; reason?: string } {
    this.ensureReady();
    const state = this.requireState();
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const bribe = this.readBribes().find((b) => b.id === input.bribeId);
    if (!bribe || bribe.targetRole !== input.actor)
      return { ok: false, reason: "no such offer before you" };
    if (bribe.status !== "pending")
      return { ok: false, reason: `the offer is ${bribe.status}` };
    const briber = state.realms[bribe.fromRealm]!;
    if (input.decision === "accept") {
      if (briber.treasury < bribe.gold) {
        this.sql.exec(
          `UPDATE bribes SET status = 'expired' WHERE id = ?`,
          bribe.id,
        );
        return {
          ok: false,
          reason:
            "the messenger's purse turned out to be empty; the offer lapses",
        };
      }
      briber.treasury -= bribe.gold;
      this.sql.exec(
        `UPDATE bribes SET status = 'accepted', until_season = ? WHERE id = ?`,
        state.season + 4,
        bribe.id,
      );
      bumpStanding(state, input.actor, 6);
      this.saveState(state);
      // Nothing is written where the Regent can read it — until the reckoning.
      return { ok: true };
    }
    this.sql.exec(
      `UPDATE bribes SET status = 'reported' WHERE id = ?`,
      bribe.id,
    );
    bumpStanding(state, input.actor, 5);
    state.regent.reputation = Math.min(100, state.regent.reputation + 2);
    const player = state.realms[state.playerRealm]!;
    player.relations[bribe.fromRealm] = Math.max(
      -100,
      (player.relations[bribe.fromRealm] ?? 0) - 15,
    );
    briber.infamy = Math.min(100, briber.infamy + 8);
    this.saveState(state);
    this.appendEvents([
      {
        season: state.season,
        kind: "court",
        text: `${state.court[input.actor]?.name ?? input.actor}, the ${input.actor}, laid ${bribe.gold} gold of ${briber.name}'s before the Regent and named the messenger.${input.note ? ` “${input.note}”` : ""}`,
        realms: [state.playerRealm, bribe.fromRealm],
        data: { bribeId: bribe.id },
      },
    ]);
    return { ok: true };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  writeDossier(input: { actor: string; text: string }): {
    ok: boolean;
    reason?: string;
  } {
    this.ensureReady();
    if (!input.actor.startsWith("ambassador:"))
      return { ok: false, reason: "Only ambassadors keep a dossier." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    this.sql.exec(
      `INSERT INTO dossiers (role, text, updated_at) VALUES (?, ?, ?) ON CONFLICT(role) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
      input.actor,
      String(input.text ?? "").slice(0, 4000),
      nowIso(),
    );
    return { ok: true };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  readDossier(input: { actor: string }): string {
    this.ensureReady();
    this.assertActor(input.actor);
    return (
      this.sql
        .exec<{
          text: string;
        }>(`SELECT text FROM dossiers WHERE role = ?`, input.actor)
        .toArray()[0]?.text ?? ""
    );
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  writeDoctrine(input: { actor: string; text: string }): {
    ok: boolean;
    reason?: string;
  } {
    this.ensureReady();
    const state = this.requireState();
    if (!input.actor.startsWith("sovereign:"))
      return { ok: false, reason: "Only sovereigns write doctrine." };
    try {
      this.assertActor(input.actor);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const realm = roleRealm(input.actor, state.playerRealm);
    this.sql.exec(
      `INSERT INTO doctrines (realm, text, season) VALUES (?, ?, ?) ON CONFLICT(realm) DO UPDATE SET text = excluded.text, season = excluded.season`,
      realm,
      String(input.text ?? "").slice(0, 3000),
      state.season,
    );
    this.appendEvents([
      {
        season: state.season,
        kind: "court",
        text: `${state.realms[realm]!.name} has revised its doctrine.`,
        realms: [realm],
      },
    ]);
    return { ok: true };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  readDoctrine(input: { actor: string }): string {
    this.ensureReady();
    const state = this.requireState();
    this.assertActor(input.actor);
    return (
      this.sql
        .exec<{
          text: string;
        }>(
          `SELECT text FROM doctrines WHERE realm = ?`,
          roleRealm(input.actor, state.playerRealm),
        )
        .toArray()[0]?.text ?? ""
    );
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  appointProtector(input: {
    mandate: string;
    seasons: number;
    limits: Partial<ProtectorLimits>;
  }): Protectorate {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error("Only the Regent appoints a Lord Protector.");
    const state = this.requireState();
    const seasons = Math.max(1, Math.min(12, Math.floor(input.seasons)));
    const limits: ProtectorLimits = {
      maySealWar: false,
      maySealLaws: true,
      maySealTreaties: true,
      mayDecideCrises: true,
      mayCloseSeason: true,
      ...(input.limits ?? {}),
    };
    this.sql.exec(
      `INSERT INTO protectorate (id, active, mandate, seasons_left, limits_json, started_season) VALUES (1, 1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET active = 1, mandate = excluded.mandate, seasons_left = excluded.seasons_left, limits_json = excluded.limits_json, started_season = excluded.started_season`,
      String(input.mandate ?? "").slice(0, 2000),
      seasons,
      JSON.stringify(limits),
      state.season,
    );
    this.appendEvents([
      {
        season: state.season,
        kind: "council",
        text: `The Regent appointed a Lord Protector for ${seasons} season(s): “${String(input.mandate ?? "").slice(0, 160)}”`,
        realms: [state.playerRealm],
      },
    ]);
    const seat = this.readParticipants("court").find(
      (p) => p.role === "protector",
    );
    if (seat) {
      const content = `<season-briefing season="${state.season}">\nThe Regent has appointed you Lord Protector for ${seasons} season(s) with this mandate:\n\n${input.mandate}\n\nYour powers: ${Object.entries(
        limits,
      )
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(
          ", ",
        )}. Read \`realm_report\` and \`list_orders\`, then govern this season within the mandate. Refer anything outside it to the Regent.\n</season-briefing>`;
      this.sql.exec(
        `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'pending'`,
        `pr${state.season}`,
        state.season,
        seat.role,
        seat.targetId,
        seat.channelId,
        content,
      );
      this.requestDrain();
    }
    return this.readProtectorate()!;
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  dismissProtector(): Protectorate | null {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error("Only the Regent dismisses a Lord Protector.");
    this.sql.exec(`UPDATE protectorate SET active = 0 WHERE id = 1`);
    const state = this.loadState();
    if (state)
      this.appendEvents([
        {
          season: state.season,
          kind: "council",
          text: "The Regent resumed the seal; the Lord Protector stands down.",
          realms: [state.playerRealm],
        },
      ]);
    return this.readProtectorate();
  }

  /** Card bookkeeping for the panel: which chat message renders which order or matter. */
  // ── Chat cards: decided here, published by the Herald ────────────────────

  /**
   * Every card the council conversation should show, in the state it should
   * show now. The Herald's own Durable Object publishes them (so they carry
   * the Herald's name and exist whether or not the Regent's panel is open);
   * this object only remembers what it last handed over, to send changes and
   * nothing else.
   */
  private cardOps(state: GameState): CardOp[] {
    const ops: CardOp[] = [];
    const published = this.publishedCards();
    const season = seasonLabel(state);
    const player = state.realms[state.playerRealm]!;
    const waitingFor = this.waitingFor(state);
    const awaitingSeals = this.readOrders(state.season).filter(
      (order) => order.status === "awaiting_seal",
    ).length;
    const readiness = deriveSeasonReadiness(state, awaitingSeals, waitingFor);
    const attention = deriveRegencyAttention(state, awaitingSeals, waitingFor);
    ops.push({
      key: "realm:briefing",
      typeId: BRIEFING_CARD,
      displayMode: "row",
      state: {
        gameKey: this.objectKey,
        season,
        realm: player.name,
        summary:
          attention[0]?.explanation ??
          "The court is assembled. Ask for counsel or point to a province on the map.",
        nextAction:
          attention[0]?.nextAction ??
          "Ask the Herald what changed and what deserves your decision first.",
        alternatives: attention[0]?.alternatives ?? [],
        treasury: Math.round(player.treasury),
        legitimacy: Math.round(player.legitimacy),
      },
    });
    ops.push({
      key: "season:readiness",
      typeId: READINESS_CARD,
      displayMode: "inline",
      state: { gameKey: this.objectKey, season, readiness },
    });
    try {
      const preview = this.forecast({});
      ops.push({
        key: "season:forecast",
        typeId: FORECAST_CARD,
        displayMode: "row",
        state: {
          gameKey: this.objectKey,
          season,
          treasury: preview.treasury,
          legitimacy: preview.legitimacy,
          events: preview.events.slice(0, 3),
        },
      });
    } catch {
      // A finished realm has no next season to forecast.
    }
    ops.push({
      key: "court:mandates",
      typeId: MANDATE_CARD,
      displayMode: "row",
      state: { gameKey: this.objectKey, mandates: this.readMandates() },
    });
    const protector = this.readProtectorate();
    ops.push({
      key: "court:protector",
      typeId: PROTECTOR_CARD,
      displayMode: "row",
      state: {
        gameKey: this.objectKey,
        active: protector?.active ?? false,
        mandate: protector?.active ? protector.mandate : null,
        seasonsLeft: protector?.active ? protector.seasonsLeft : null,
      },
    });
    ops.push({
      key: "court:directory",
      typeId: DIRECTORY_CARD,
      displayMode: "row",
      state: {
        gameKey: this.objectKey,
        people: Object.entries(state.court).map(([role, person]) => ({
          role,
          name: person.name,
          realm: roleRealm(role, state.playerRealm),
        })),
      },
    });
    for (const o of this.readOrders()) {
      const key = `seal:${o.id}`;
      // A card exists for every act that ever awaited the seal; later states update it.
      if (o.status !== "awaiting_seal" && !published.has(key)) continue;
      ops.push({
        key,
        typeId: SEAL_CARD,
        displayMode: "inline",
        state: {
          gameKey: this.objectKey,
          orderId: o.id,
          actor: o.actor,
          actorName: state.court[o.actor]?.name ?? o.actor,
          summary: describeOrder(state, o.order),
          rationale: o.rationale,
          status: o.status,
          reason: o.reason,
          season: seasonLabel({ season: o.season, startYear: state.startYear }),
          forecast:
            o.status === "awaiting_seal" ? this.forecastLine(o.id) : null,
        },
      });
    }
    for (const c of state.crises) {
      const key = `matter:${c.id}`;
      if (c.chosen !== null && !published.has(key)) continue;
      ops.push({
        key,
        typeId: MATTER_CARD,
        displayMode: "inline",
        state: {
          gameKey: this.objectKey,
          crisisId: c.id,
          title: c.title,
          text: c.text,
          options: c.options.map((o) => ({
            id: o.id,
            label: o.label,
            text: o.text,
            effects: describeEffects(state, o.effects),
            adviser: o.adviser ?? null,
          })),
          defaultOption: c.defaultOption,
          chosen: c.chosen,
          decidedBy: c.decidedBy,
          season: seasonLabel({ season: c.season, startYear: state.startYear }),
        },
      });
    }
    if (state.season > 0 && state.digest.length > 0) {
      const player = state.realms[state.playerRealm]!;
      const highlights = this.readEvents()
        .filter(
          (e) =>
            e.season === state.season - 1 &&
            [
              "battle",
              "capture",
              "treaty",
              "war",
              "famine",
              "revolt",
              "crisis",
            ].includes(e.kind),
        )
        .slice(-8)
        .map((e) => ({ kind: e.kind, text: e.text }));
      ops.push({
        key: `season:${state.season}`,
        typeId: SEASON_CARD,
        displayMode: "row",
        state: {
          season,
          digest: state.digest[state.digest.length - 1]!,
          highlights,
          treasury: player.treasury,
          legitimacy: player.legitimacy,
          estates: player.estates,
          outcome: state.outcome
            ? {
                kind: state.outcome.kind,
                title: state.outcome.title,
                reason: state.outcome.reason,
                verdict: state.outcome.verdict ?? null,
              }
            : null,
        },
      });
    }
    for (const d of this.readDebates(state)) {
      ops.push({
        key: `debate:${d.id}`,
        typeId: DEBATE_CARD,
        displayMode: "inline",
        state: {
          debateId: d.id,
          question: d.question,
          status: d.status,
          season: seasonLabel({ season: d.season, startYear: state.startYear }),
          lines: d.lines,
          waiting: MINISTER_ROLES.filter(
            (r) => !d.lines.some((l) => l.role === r),
          ),
        },
      });
    }
    for (const h of this.readHandovers()) {
      ops.push({
        key: `handover:${h.id}`,
        typeId: HANDOVER_CARD,
        displayMode: "inline",
        state: {
          season: seasonLabel({ season: h.season, startYear: state.startYear }),
          mandate: h.mandate,
          text: h.text,
        },
      });
    }
    return ops.filter(
      (op) => published.get(op.key) !== JSON.stringify(op.state),
    );
  }

  /** One line on what sealing an act would do, from a resolved copy of the season. */
  private forecastLine(orderId: string): string | null {
    try {
      const fc = this.forecast({ includeOrderIds: [orderId] });
      const arrow = (a: number, b: number) =>
        Math.round(a) === Math.round(b)
          ? `${Math.round(a)} (unchanged)`
          : `${Math.round(a)} → ${Math.round(b)}`;
      const parts = [
        `treasury ${arrow(fc.treasury.before, fc.treasury.after)}`,
        `legitimacy ${arrow(fc.legitimacy.before, fc.legitimacy.after)}`,
      ];
      if (fc.provinces.before !== fc.provinces.after)
        parts.push(
          `provinces ${arrow(fc.provinces.before, fc.provinces.after)}`,
        );
      if (fc.wars.length) parts.push(`at war with ${fc.wars.join(", ")}`);
      const notable = fc.events.slice(0, 2);
      return `If sealed, the season would close with ${parts.join(", ")}.${notable.length ? ` ${notable.join(" ")}` : ""}`;
    } catch {
      return null;
    }
  }

  /** Cards that differ from what the Herald last published. Read-only; the drain publishes them. */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  pendingCards(): CardOp[] {
    this.ensureReady();
    const state = this.loadState();
    return state ? this.cardOps(state) : [];
  }

  /** Hand changed cards to the Herald's object; remember what was handed over only once it succeeds. */
  private async syncCards(): Promise<{
    published: number;
    error: string | null;
  }> {
    const state = this.loadState();
    const herald = this.readParticipants("court").find(
      (p) => p.role === "herald",
    );
    if (!state || !herald) return { published: 0, error: null };
    const ops = this.cardOps(state);
    if (ops.length === 0) return { published: 0, error: null };
    try {
      await this.rpc.call(herald.targetId, "publishCards", [
        { channelId: herald.channelId, cards: ops },
      ]);
    } catch (err) {
      return {
        published: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    const at = nowIso();
    for (const op of ops)
      this.sql.exec(
        `INSERT INTO cards (key, fingerprint, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = excluded.updated_at`,
        op.key,
        JSON.stringify(op.state),
        at,
      );
    return { published: ops.length, error: null };
  }

  // ── The drain: persisted work, admitted as its own execution ─────────────

  /**
   * Briefings and cards are written to tables inside the request that caused
   * them and delivered from the alarm, never from a floating promise: the
   * request returns, the wake is durable, and a Durable Object that hibernates
   * in between still delivers. Failed briefings are retried a bounded number
   * of times, then wait for the Regent's "re-send" — no endless clock.
   */
  private requestDrain(): void {
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('drain', '1') ON CONFLICT(key) DO UPDATE SET value = '1'`,
    );
  }

  private drainRequested(): boolean {
    return (
      (this.sql
        .exec<{ value: string }>(`SELECT value FROM meta WHERE key = 'drain'`)
        .toArray()[0]?.value ?? "0") === "1"
    );
  }

  /** The schedule is a projection of durable facts, re-derived after every request: a drain is owed, or a retry is. */
  protected override nextAlarmAfterRequest(): { wakeAt: number } | null {
    if (this.drainRequested()) return { wakeAt: Date.now() };
    const pending =
      this.sql
        .exec<{
          n: number;
        }>(
          `SELECT COUNT(*) AS n FROM briefings WHERE status = 'pending' OR (status = 'failed' AND attempts < ?)`,
          BRIEFING_ATTEMPTS,
        )
        .toArray()[0]?.n ?? 0;
    return pending > 0 ? { wakeAt: Date.now() + BRIEFING_RETRY_MS } : null;
  }

  override async alarm(): Promise<{ wakeAt: number } | null> {
    await super.alarm();
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('drain', '0') ON CONFLICT(key) DO UPDATE SET value = '0'`,
    );
    this.sql.exec(
      `UPDATE briefings SET status = 'pending' WHERE status = 'failed' AND attempts < ?`,
      BRIEFING_ATTEMPTS,
    );
    await this.deliverBriefings();
    await this.syncCards();
    const retry =
      this.sql
        .exec<{
          n: number;
        }>(
          `SELECT COUNT(*) AS n FROM briefings WHERE status = 'failed' AND attempts < ?`,
          BRIEFING_ATTEMPTS,
        )
        .toArray()[0]?.n ?? 0;
    return retry > 0 ? { wakeAt: Date.now() + BRIEFING_RETRY_MS } : null;
  }

  /** After the court is seated: the Herald introduces the council, the ambassadors present their credentials. */
  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async openCourt(): Promise<{ delivered: number; failed: number }> {
    this.ensureReady();
    const state = this.requireState();
    const player = state.realms[state.playerRealm]!;
    const court = this.readParticipants("court");
    const attention = court.some((participant) => participant.role === "herald")
      ? this.takeNarratableAttention(state)
      : [];
    for (const p of court) {
      const kind = p.role.split(":")[0]!;
      let content: string | null = null;
      if (kind === "herald") {
        const intro = ["chancellor", "treasurer", "marshal", "envoy"]
          .map((r) => state.court[r])
          .filter(Boolean)
          .map(
            (c) =>
              `- ${c!.name} of house ${c!.house}, ${c!.role}: ${c!.temperament}${c!.rival ? ` (and no friend of the ${c!.rival})` : ""}`,
          )
          .join("\n");
        const pending = state.crises.filter((c) => c.chosen === null);
        content = [
          `<opening-briefing>`,
          `The court of ${player.name} is seated for the first time under ${state.regent.name}. The heir ${state.heir.name} is ${state.heir.ageAtStart} years old; ${state.majoritySeason - state.season} seasons remain until the majority.`,
          `\nThe council:\n${intro}`,
          pending.length
            ? `\nMatters already on the table:\n${pending.map((c) => `- ${c.title} [${c.id}]`).join("\n")}`
            : "",
          attention.length
            ? `\nWhat deserves the Regent's attention:\n${attention.map((item) => `- ${item.title}: ${item.explanation} GUIDE NEXT: ${item.nextAction}${item.alternatives?.length ? ` Alternatives: ${item.alternatives.join(" / ")}` : ""}`).join("\n")}`
            : "",
          `\nYou are the Herald. Welcome the Regent in a few warm lines, introduce each minister in one sentence each, and explain in plain words how this court works: the Regent speaks, ministers act within their portfolios, sensitive acts wait for the seal, and the season closes when the Regent says so. End with the single best GUIDE NEXT action above, phrased as a direct invitation; only if none is present, suggest asking the Treasurer how the realm is fed. Mention the ambassadors as an alternative, not another chore. Keep the whole thing under twelve lines.`,
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
      this.sql.exec(
        `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO NOTHING`,
        `open-${p.role}`,
        state.season,
        p.role,
        p.targetId,
        p.channelId,
        content,
      );
    }
    const result = await this.deliverBriefings();
    await this.syncCards();
    return result;
  }

  // ── Participants & briefings ──────────────────────────────────────────────

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  registerParticipant(input: Participant): Participant[] {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error(
        "Seats at court are assigned by the Regent's panel, not by agents.",
      );
    this.sql.exec(
      `INSERT INTO participants (role, channel_id, realm, participant_id, target_id, handle, name, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(role, channel_id) DO UPDATE SET realm = excluded.realm, participant_id = excluded.participant_id, target_id = excluded.target_id, handle = excluded.handle, name = excluded.name, kind = excluded.kind`,
      input.role,
      input.channelId,
      input.realm,
      input.participantId,
      input.targetId,
      input.handle,
      input.name,
      input.kind ?? "court",
    );
    this.requestDrain();
    return this.readParticipants();
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  unregisterParticipant(input: {
    role: string;
    channelId?: string;
  }): Participant[] {
    this.ensureReady();
    if (this.rpcCallerKind === "do")
      throw new Error(
        "Seats at court are removed by the Regent's panel, not by agents.",
      );
    if (input.channelId)
      this.sql.exec(
        `DELETE FROM participants WHERE role = ? AND channel_id = ?`,
        input.role,
        input.channelId,
      );
    else this.sql.exec(`DELETE FROM participants WHERE role = ?`, input.role);
    return this.readParticipants();
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  listParticipants(): Participant[] {
    this.ensureReady();
    return this.readParticipants();
  }

  /**
   * Whether a minister has cause to interrupt the court, and what about.
   * Character, not noise: a minister speaks when the season touched their
   * cause and either their ambition or their standing gives them the nerve.
   */
  private notableFor(
    role: string,
    state: GameState,
    events: GameEvent[],
  ): string | null {
    const player = state.playerRealm;
    const mine = events.filter((e) => e.realms.includes(player));
    const courtier = state.court[role];
    let reason: string | null = null;
    if (role === "marshal") {
      const fights = mine.filter((e) =>
        ["battle", "siege", "capture"].includes(e.kind),
      );
      if (fights.length)
        reason = `Steel was drawn where you are answerable:\n${fights
          .slice(0, 4)
          .map((e) => `- ${e.text}`)
          .join("\n")}`;
    } else if (role === "treasurer") {
      const realm = state.realms[player]!;
      const net = realm.ledger.net;
      if (net < 0 && realm.treasury + net * 2 < 0)
        reason = `The ledger closed at ${Math.round(net)} a season with ${Math.round(realm.treasury)} gold in the vault. At this rate the treasury is empty within two seasons.`;
      else {
        const hungry = mine.filter((e) => e.kind === "famine");
        if (hungry.length)
          reason = `Provinces went hungry on your watch:\n${hungry
            .slice(0, 3)
            .map((e) => `- ${e.text}`)
            .join("\n")}`;
      }
    } else if (role === "chancellor") {
      const revolts = mine.filter((e) => e.kind === "revolt");
      const realm = state.realms[player]!;
      const low = (
        Object.entries(realm.estates) as Array<[string, number]>
      ).filter(([, v]) => v < 30);
      if (revolts.length)
        reason = `The peace of the realm broke:\n${revolts
          .slice(0, 3)
          .map((e) => `- ${e.text}`)
          .join("\n")}`;
      else if (low.length)
        reason = `An estate has turned against the Regency: ${low.map(([e, v]) => `${e} at ${Math.round(v)}`).join(", ")}. Legitimacy stands at ${Math.round(realm.legitimacy)}.`;
    } else if (role === "envoy") {
      const letters = mine.filter((e) =>
        ["treaty", "proposal", "war"].includes(e.kind),
      );
      const words = this.readPromises().filter(
        (w) => w.settled === state.season - 1 || w.settled === state.season,
      );
      if (letters.length)
        reason = `The foreign account moved:\n${letters
          .slice(0, 4)
          .map((e) => `- ${e.text}`)
          .join("\n")}`;
      else if (words.length)
        reason = `The Regent's word was judged:\n${words.map((w) => `- “${w.text}” — ${w.status}`).join("\n")}`;
    }
    if (!reason) return null;
    const ambitious = courtier
      ? {
          marshal: "glory",
          treasurer: "gold",
          chancellor: "order",
          envoy: "peace",
        }[role] === courtier.ambition
      : false;
    const standing = courtier?.standing ?? 50;
    if (!ambitious && standing > 40 && standing < 60) return null; // a middling minister waits to be asked
    return reason;
  }

  /**
   * When the last minister has spoken, the Herald (or the Lord Protector in
   * the Regent's stead) is handed the whole debate and asked to put the
   * disagreement before the Regent as one decision. Without this the four
   * answers would sit on a card with nobody drawing the conclusion.
   */
  private queueVerdict(
    state: GameState,
    debateId: string,
    question: string,
  ): void {
    const seat =
      this.readParticipants("court").find((p) => p.role === "herald") ??
      this.readParticipants("court").find((p) => p.role === "protector");
    if (!seat) return;
    const lines =
      this.readDebates(state).find((d) => d.id === debateId)?.lines ?? [];
    const content = [
      `<council-verdict debate="${debateId}" season="${state.season}">`,
      `The council has answered “${question}”:`,
      ...lines.map((l) => `- ${l.name} (${l.role}): ${l.text}`),
      ``,
      seat.role === "herald"
        ? `Put it before the Regent in one short block: where the ministers agree, where they split and why, and the two or three courses that are actually open — each as one line the Regent could say back to you. Do not recommend; ask the Regent to choose. Do not issue orders or seal anything.`
        : `You rule in the Regent's stead. Weigh the counsel, decide within your mandate, say in two lines what you chose and why, and refer to the Regent anything the mandate does not cover.`,
      `</council-verdict>`,
    ].join("\n");
    this.sql.exec(
      `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'pending', error = NULL`,
      `v${debateId}`,
      state.season,
      seat.role,
      seat.targetId,
      seat.channelId,
      content,
    );
  }

  /** When the protectorate ends, the Protector is asked for an account of it. */
  private queueHandover(state: GameState, protectorate: Protectorate): void {
    const seat = this.readParticipants("court").find(
      (p) => p.role === "protector",
    );
    if (!seat) return;
    const content = [
      `<season-briefing season="${state.season}">`,
      `Your mandate as Lord Protector has run its course and the Regent resumes the seal. Write the hand-over now with \`write_handover\`: what you were asked to do (“${protectorate.mandate}”), what you decided and why, what you refused and referred back, what you would warn the Regent about, and what you left unfinished. Eight to fifteen lines, plain and honest. Then say the shortest possible version of it aloud to the court.`,
      `</season-briefing>`,
    ].join("\n");
    this.sql.exec(
      `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO NOTHING`,
      `ho${state.season}`,
      state.season,
      seat.role,
      seat.targetId,
      seat.channelId,
      content,
    );
  }

  private queueBriefings(
    state: GameState,
    events: GameEvent[],
    rejected: string[],
  ): void {
    // Ministers may also be woken in their private chambers; everyone else is
    // only ever addressed in the room they hold their seat in.
    const participants = this.readParticipants().filter(
      (p) =>
        p.kind !== "chambers" ||
        MINISTER_ROLES.includes(portfolioOf(p.role) as MinisterRole),
    );
    const season = state.season;
    const label = seasonLabel(state);
    const eventsFor = (realm: RealmId) =>
      events
        .filter(
          (e) =>
            e.realms.includes(realm) ||
            [
              "war",
              "treaty",
              "capture",
              "elimination",
              "victory",
              "defeat",
            ].includes(e.kind),
        )
        .map((e) => `- ${e.text}`)
        .join("\n") || "- A quiet season.";
    const pendingCrises = state.crises.filter((c) => c.chosen === null);
    const digest = state.digest[state.digest.length - 1] ?? "";
    const orderBook = this.readOrders(state.season - 1)
      .map(
        (o) => `- ${o.actor}: ${describeOrder(state, o.order)} (${o.status})`,
      )
      .join("\n");
    const leaks = this.readBribes().filter(
      (b) =>
        b.status === "accepted" &&
        (b.untilSeason === null || b.untilSeason > state.season),
    );
    const yearEnd = state.season % 4 === 0 && state.season > 0;
    const attention = participants.some(
      (participant) => participant.role === "herald",
    )
      ? this.takeNarratableAttention(state)
      : [];
    // Ministers who have cause to interrupt this season, at most two of them:
    // the court should hear a voice, not a chorus, and every interruption is
    // a model turn the Regent did not ask for.
    const interrupters = new Map<string, string>();
    for (const role of MINISTER_ROLES) {
      const cause = this.notableFor(role, state, events);
      if (cause) interrupters.set(role, cause);
    }
    if (interrupters.size > 2) {
      const nerve = (role: string) =>
        Math.abs((state.court[role]?.standing ?? 50) - 50);
      for (const role of [...interrupters.keys()]
        .sort((a, b) => nerve(a) - nerve(b))
        .slice(0, interrupters.size - 2))
        interrupters.delete(role);
    }
    for (const p of participants) {
      const kind = p.role.split(":")[0]!;
      let content: string | null = null;
      if (kind === "herald" || kind === "protector") {
        const courtLines = ["chancellor", "treasurer", "marshal", "envoy"]
          .map((r) => state.court[r])
          .filter(Boolean)
          .map((c) => `- ${c!.name} (${c!.role}): ${moodOf(c!.standing)}`)
          .join("\n");
        content = [
          `<season-briefing season="${season}">`,
          `# ${label} has begun`,
          `In brief: ${digest}`,
          `\nThe chronicle of the season just passed, as it concerns ${state.realms[p.realm]!.name}:`,
          eventsFor(p.realm),
          rejected.length
            ? `\nOrders that could not be carried out:\n${rejected.map((r) => `- ${r}`).join("\n")}`
            : "",
          pendingCrises.length
            ? `\n## Matters awaiting the Regent's decision\n${pendingCrises.map((c) => crisisSummary(state, c)).join("\n\n")}`
            : "",
          kind === "herald" && attention.length
            ? `\n## What now deserves attention\n${attention.map((item) => `- ${item.title}: ${item.explanation} GUIDE NEXT: ${item.nextAction}${item.alternatives?.length ? ` Alternatives: ${item.alternatives.join(" / ")}` : ""}`).join("\n")}`
            : "",
          `\n## The court\n${courtLines}`,
          kind === "herald"
            ? `\nYou are the Herald. Announce what changed and why it matters, tell the Regent plainly what awaits their decision (matters above, and any orders awaiting the seal from \`list_orders\`), and end with the single best GUIDE NEXT action in natural language. Then use \`notify\` to address only the ministers whose portfolio the news touches (@marshal for battles and sieges, @treasurer for gold and famine, @chancellor for unrest, laws and the estates, @envoy for treaties and proposals). Ask them for counsel or orders. Do not issue orders yourself, and do not seal, veto or decide unless the Regent has explicitly said so.`
            : `\nYou are the Lord Protector. Rule this season within your written mandate: read \`list_orders\` and \`realm_report\`, decide the matters above with \`decide_crisis\` if your mandate allows, seal or veto what the mandate allows, refer everything else to the Regent with a short note, and close the season with \`close_season\` when the council's orders are in.`,
          state.outcome
            ? `\n**The game has ended: ${state.outcome.title}.** ${state.outcome.reason}\n\n${state.outcome.verdict ?? ""}`
            : "",
          `</season-briefing>`,
        ].join("\n");
      } else if (kind === "sovereign") {
        const doctrine = this.sql
          .exec<{
            text: string;
            season: number;
          }>(`SELECT text, season FROM doctrines WHERE realm = ?`, p.realm)
          .toArray()[0];
        const diary = this.sql
          .exec<{
            text: string;
          }>(`SELECT text FROM diaries WHERE realm = ?`, p.realm)
          .toArray()[0]?.text;
        const leak =
          leaks.some((b) => b.fromRealm === p.realm) && orderBook
            ? `\n## From a friend at the Regent's court\nLast season's order book of ${state.realms[state.playerRealm]!.name}:\n${orderBook}`
            : "";
        content = [
          `<season-briefing season="${season}">`,
          `# ${label} has begun`,
          `News concerning ${state.realms[p.realm]!.name}:`,
          eventsFor(p.realm),
          doctrine
            ? `\n## Your doctrine (written ${seasonLabel({ season: doctrine.season, startYear: state.startYear })})\n${doctrine.text}`
            : "",
          diary ? `\n## Your court's diary on the Regent\n${diary}` : "",
          leak,
          `\nIt is your turn. Confer with your ambassador at the Regent's court if there is anything to negotiate (use \`notify\` with their directory ref), review your realm with \`realm_report\`, respond to pending proposals, issue this season's orders with \`submit_order\`, then call \`end_turn\`.${yearEnd ? " A year has passed: before ending your turn, write or revise your doctrine with `write_doctrine` — what worked, what did not, what you will do differently." : ""} Speak briefly in character as you decide. Once a year, set down what you have learned of the Regent with \`write_relations_diary\` — what they promised, what they did, whether their word is worth anything; your ambassador reads it too.${yearEnd ? "" : ""}`,
          state.outcome
            ? `\n**The game has ended: ${state.outcome.title}.** ${state.outcome.reason}`
            : "",
          `</season-briefing>`,
        ].join("\n");
      } else if (kind === "ambassador") {
        const diplomatic = events
          .filter(
            (e) =>
              e.realms.includes(p.realm) &&
              [
                "war",
                "treaty",
                "proposal",
                "capture",
                "elimination",
                "crisis",
              ].includes(e.kind),
          )
          .map((e) => `- ${e.text}`)
          .join("\n");
        if (!diplomatic && season % 4 !== 0) continue;
        const dossier = this.sql
          .exec<{
            text: string;
          }>(`SELECT text FROM dossiers WHERE role = ?`, p.role)
          .toArray()[0]?.text;
        const diary = this.sql
          .exec<{
            text: string;
          }>(`SELECT text FROM diaries WHERE realm = ?`, p.realm)
          .toArray()[0]?.text;
        const words = this.readPromises().filter((w) => w.to === p.realm);
        const broken = words.filter((w) => w.status === "broken");
        const kept = words.filter((w) => w.status === "kept");
        const pendingWords = words.filter((w) => w.status === "pending");
        content = [
          `<season-briefing season="${season}">`,
          `# ${label}`,
          `Diplomatic news touching ${state.realms[p.realm]!.name} and the Regency:`,
          diplomatic ||
            "- Nothing of note; a good moment to reaffirm ties or raise a grievance.",
          dossier
            ? `\n## Your dossier on the Regent\n${dossier}`
            : "\nYou keep no dossier on the Regent yet; start one with `write_dossier` after your first audience.",
          diary ? `\n## Your sovereign's own book on the Regent\n${diary}` : "",
          words.length
            ? `\n## The Regent's word to us\n${broken.length ? `**Broken (${broken.length}):** ${broken.map((w) => `“${w.text}”`).join("; ")}. Raise this; it is the strongest card you hold.\n` : ""}${kept.length ? `Kept (${kept.length}): ${kept.map((w) => `“${w.text}”`).join("; ")}.\n` : ""}${pendingWords.length ? `Still owed: ${pendingWords.map((w) => `“${w.text}”`).join("; ")}.` : ""}`
            : "",
          `\nConfer with your sovereign by \`notify\` before committing to anything beyond trade. Then say what your sovereign would want said at the Regent's court, briefly, and update your dossier if the Regent has kept or broken a word.`,
          `</season-briefing>`,
        ].join("\n");
      } else if (kind === "chronicler") {
        // The chronicler writes once a year, when the fourth season has turned.
        if (!yearEnd) continue;
        const year = state.startYear + Math.floor((state.season - 1) / 4);
        // `events` is only the resolution that just ran; the year is the four seasons behind it, from the ledger.
        const yearEvents = this.allEvents()
          .filter(
            (e) =>
              e.season >= state.season - 4 &&
              e.season < state.season &&
              (e.realms.length === 0 ||
                e.realms.includes(state.playerRealm) ||
                ["war", "treaty", "capture", "elimination"].includes(e.kind)),
          )
          .slice(-80)
          .map(
            (e) =>
              `- [${seasonLabel({ season: e.season, startYear: state.startYear })}] ${e.text}`,
          )
          .join("\n");
        content = [
          `<year-briefing season="${season}" year="${year}">`,
          `# The year ${year} is over`,
          `Everything the court recorded in it:`,
          yearEvents || "- A year in which nothing was written down.",
          `\nYou are the chronicler of ${state.realms[state.playerRealm]!.name}. Write the year as a page of a chronicle: six to twelve sentences of plain narrative prose, in the past tense, naming provinces and people, saying what was decided and what it cost. No bullet points, no advice, no flattery — the Regent's failures belong in it as much as their victories. Then call \`write_chronicle\` with the text and the year ${year}. Say nothing else to the court unless you are addressed.`,
          `</year-briefing>`,
        ].join("\n");
      } else if (
        ["chancellor", "treasurer", "marshal", "envoy"].includes(kind)
      ) {
        // Ministers are addressed by the Herald; they speak unprompted only
        // when the season touched their cause and their standing gives them
        // the nerve, and they get a private word when tempted.
        const temptations = this.readBribes().filter(
          (b) => b.status === "pending" && b.targetRole === kind,
        );
        const chambers = this.readParticipants("chambers").find(
          (c) => c.role === kind,
        );
        const isChambers = p.kind === "chambers";
        if (temptations.length > 0 && (isChambers || !chambers)) {
          content = [
            `<private-word season="${season}">`,
            `A discreet messenger from ${temptations.map((b) => state.realms[b.fromRealm]?.name).join(" and ")} has found you alone. Use \`my_temptations\` to read the offer, then \`respond_bribe\` to accept or to report it to the Regent. Nobody else has seen this.`,
            `</private-word>`,
          ].join("\n");
        } else if (!isChambers) {
          const outcome = interrupters.get(kind);
          if (!outcome) continue;
          content = [
            `<notable-outcome season="${season}" role="${kind}">`,
            `${outcome}`,
            `\nThis touches your portfolio and you are not the sort to hold your tongue about it. Speak to the court now, unprompted: one or two lines, in character, from where you stand — a warning, a demand, an I-told-you-so, a request for authority. Do not summarise the season; the Herald has done that. Do not issue an order unless it plainly follows from what you say.`,
            `</notable-outcome>`,
          ].join("\n");
        }
        if (!content) continue;
      }
      if (!content) continue;
      const id = `b${season}-${p.role}${p.kind === "chambers" ? "-chambers" : ""}`;
      this.sql.exec(
        `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'pending', error = NULL`,
        id,
        season,
        p.role,
        p.targetId,
        p.channelId,
        content,
      );
    }
  }

  private async nudgeSovereigns(
    state: GameState,
    waiting: RealmId[],
  ): Promise<void> {
    for (const p of this.readParticipants("court")) {
      if (!p.role.startsWith("sovereign:") || !waiting.includes(p.realm))
        continue;
      const id = `n${state.season}-${p.role}`;
      const content = `<season-briefing season="${state.season}">\nThe Regent of ${state.realms[state.playerRealm]!.name} has closed the court for ${seasonLabel(state)} and waits on ${state.realms[p.realm]!.name}. Finish your orders and call \`end_turn\`.\n</season-briefing>`;
      this.sql.exec(
        `INSERT INTO briefings (id, season, role, target_id, channel_id, content, status, error) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL) ON CONFLICT(id) DO NOTHING`,
        id,
        state.season,
        p.role,
        p.targetId,
        p.channelId,
        content,
      );
    }
    await this.deliverBriefings();
  }

  /** Deliver every pending briefing as an agent-initiated turn. Failures stay queued for `redeliverBriefings`. */
  private async deliverBriefings(): Promise<{
    delivered: number;
    failed: number;
  }> {
    let delivered = 0;
    let failed = 0;
    for (const b of this.readBriefings("pending")) {
      try {
        await this.rpc.call(b.targetId, "receiveBriefing", [
          {
            channelId: b.channelId,
            content: b.content,
            steeringId: `regency:${this.objectKey}:${b.id}`,
          },
        ]);
        this.sql.exec(
          `UPDATE briefings SET status = 'delivered', error = NULL, attempts = attempts + 1 WHERE id = ?`,
          b.id,
        );
        delivered += 1;
      } catch (err) {
        this.sql.exec(
          `UPDATE briefings SET status = 'failed', error = ?, attempts = attempts + 1 WHERE id = ?`,
          err instanceof Error ? err.message : String(err),
          b.id,
        );
        failed += 1;
      }
    }
    return { delivered, failed };
  }

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async redeliverBriefings(): Promise<{ delivered: number; failed: number }> {
    this.ensureReady();
    this.sql.exec(
      `UPDATE briefings SET status = 'pending', attempts = 0 WHERE status = 'failed'`,
    );
    const result = await this.deliverBriefings();
    await this.syncCards();
    return result;
  }
}

export default {
  async fetch(_request: Request) {
    return new Response(
      "Regency realm state service. Resolve examples.regency.v1 and call RegencyGameDO methods over unified RPC.",
      { headers: { "Content-Type": "text/plain" } },
    );
  },
};
