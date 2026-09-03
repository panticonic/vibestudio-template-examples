/**
 * Regency world model. Everything here is plain JSON so the Durable Object can
 * persist it, agents can read it, and the panel can render it.
 */
import type { Axial } from "./hex.js";

export type RealmId = string;
export type ProvinceId = string;
export type ArmyId = string;

export const NEUTRAL: RealmId = "neutral";
export const REBELS: RealmId = "rebels";

export type Terrain = "plains" | "hills" | "forest" | "mountains" | "marsh";
export const TERRAINS: readonly Terrain[] = ["plains", "hills", "forest", "mountains", "marsh"];

export type Resource = "grain" | "timber" | "iron" | "gold" | "salt" | "horses" | "wine";
export const RESOURCES: readonly Resource[] = ["grain", "timber", "iron", "gold", "salt", "horses", "wine"];

export type BuildingKind =
  | "farm"
  | "market"
  | "fort"
  | "road"
  | "mine"
  | "granary"
  | "shrine"
  | "barracks";
export const BUILDINGS: readonly BuildingKind[] = [
  "farm",
  "market",
  "fort",
  "road",
  "mine",
  "granary",
  "shrine",
  "barracks",
];

export type UnitKind = "levy" | "regular" | "cavalry" | "siege";
export const UNITS: readonly UnitKind[] = ["levy", "regular", "cavalry", "siege"];
export type UnitCounts = Record<UnitKind, number>;

export interface Province {
  id: ProvinceId;
  name: string;
  terrain: Terrain;
  coastal: boolean;
  /** Hex cells belonging to this province (axial coords). */
  cells: Axial[];
  /** Cell used to place labels and army tokens. */
  centre: Axial;
  neighbors: ProvinceId[];
  owner: RealmId;
  /** Thousands of people. */
  population: number;
  /** 1..5, base agricultural yield. */
  fertility: number;
  /** 0..10 */
  development: number;
  resources: Resource[];
  buildings: Record<BuildingKind, number>;
  /** 0..100 */
  unrest: number;
  /** Stored food, thousands of rations. */
  granary: number;
  /** Fort hit points while under siege; equals fort level * 10 when intact. */
  fortHp: number;
  /** Home province of a realm. */
  capitalOf: RealmId | null;
  /** Seasons of famine in a row. */
  famineStreak: number;
  /** Realm ids holding a historical claim on this province. */
  claims: RealmId[];
}

export interface Army {
  id: ArmyId;
  name: string;
  realm: RealmId;
  province: ProvinceId;
  units: UnitCounts;
  /** 0..100 */
  morale: number;
  /** Pending destination applied at resolution. */
  moveTo: ProvinceId | null;
  /** Set while besieging the province it stands in. */
  besieging: boolean;
}

export type TreatyKind = "non_aggression" | "alliance" | "trade" | "tribute" | "peace";

export interface Treaty {
  id: string;
  kind: TreatyKind;
  parties: [RealmId, RealmId];
  /** Season the treaty was signed. */
  signed: number;
  /** For tribute: gold per season paid from parties[0] to parties[1]. */
  tribute?: number;
  /** For tribute/peace with terms: seasons remaining, null = indefinite. */
  seasonsLeft: number | null;
  /** Provinces that changed hands on signing, for the chronicle. */
  cededProvinces?: ProvinceId[];
}

export type ProposalStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "expired";

/** A diplomatic proposal between realms; accepted proposals become treaties. */
export interface DiplomaticProposal {
  id: string;
  from: RealmId;
  to: RealmId;
  kind: TreatyKind;
  /**
   * `tribute` is gold per season paid by `from` to `to` (negative = paid by
   * `to` to `from`). `cededProvinces` pass from `from` to `to`;
   * `demandedProvinces` pass from `to` to `from`.
   */
  terms: {
    tribute?: number;
    seasons?: number | null;
    cededProvinces?: ProvinceId[];
    demandedProvinces?: ProvinceId[];
  };
  message: string;
  season: number;
  status: ProposalStatus;
}

/** Council proposals that need the Regent's seal before they take effect. */
export type SealedActKind =
  | "declare_war"
  | "treaty"
  | "edict"
  | "repeal_edict"
  | "set_tax"
  | "cede_province";

export interface CouncilProposal {
  id: string;
  kind: SealedActKind;
  proposer: string; // role id, e.g. "marshal"
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
  season: number;
  status: "pending" | "sealed" | "vetoed" | "withdrawn";
  decisionNote?: string;
}

// ── Laws ────────────────────────────────────────────────────────────────────

export type ConditionField =
  | "unrest"
  | "population"
  | "food_ratio"
  | "development"
  | "garrison"
  | "fort"
  | "granary"
  | "is_border"
  | "coastal"
  | "terrain"
  | "resource"
  | "famine_streak";

export type ConditionOp = ">" | "<" | ">=" | "<=" | "==" | "!=" | "has";

export interface EdictCondition {
  field: ConditionField;
  op: ConditionOp;
  value: number | string | boolean;
}

export type EdictAction =
  | { kind: "tax_relief"; factor: number } // multiply tax in matched provinces by factor (0..1)
  | { kind: "grain_dole" } // spend treasury to cover food deficit in matched provinces
  | { kind: "garrison_levy"; companies: number } // keep at least N levy companies stationed
  | { kind: "public_works"; building: BuildingKind } // auto-build when affordable
  | { kind: "curfew" }; // -8 unrest, -1 development growth

/** A law the Chancellor writes as data; the engine evaluates it each season. */
export interface Edict {
  id: string;
  title: string;
  /** All conditions must hold for a province to match. */
  when: EdictCondition[];
  then: EdictAction[];
  enacted: number;
  author: string;
}

export interface Laws {
  /** 0.1 .. 0.6 share of provincial output collected as tax. */
  taxRate: number;
  /** 0 = volunteers only, 1 = general levy. Affects muster cost and unrest. */
  conscription: number;
  /** Share of food surplus kept in granaries rather than sold. */
  granaryReserve: number;
  edicts: Edict[];
}

// ── Realms ──────────────────────────────────────────────────────────────────

export type SovereignKind = "regent" | "agent";

export interface Realm {
  id: RealmId;
  name: string;
  adjective: string;
  color: string;
  sovereign: SovereignKind;
  /** Flavour used in agent personas. */
  character: string;
  treasury: number;
  /** Regent realm only: 0..100. */
  legitimacy: number;
  prestige: number;
  /** 0..100, decays; raised by treachery and unprovoked wars. */
  infamy: number;
  capital: ProvinceId;
  laws: Laws;
  /** relation[other] in -100..100 */
  relations: Record<RealmId, number>;
  eliminated: boolean;
  /** Whether this realm has ended its turn this season. */
  turnEnded: boolean;
  /** Per-season economic summary, refreshed on resolution. */
  ledger: Ledger;
  /** Satisfaction of the four estates, 0..100. Legitimacy is their weighted consent. */
  estates: Estates;
}

export interface Ledger {
  season: number;
  taxIncome: number;
  tradeIncome: number;
  resourceIncome: number;
  tributeNet: number;
  /** Gold from trade routes and sea lanes, part of tradeIncome. */
  routeIncome: number;
  /** Foreign markets reachable this season. */
  routes: number;
  upkeep: number;
  buildSpend: number;
  musterSpend: number;
  doleSpend: number;
  foodProduced: number;
  foodConsumed: number;
  net: number;
}

// ── Orders ──────────────────────────────────────────────────────────────────

export type Order =
  | { kind: "build"; province: ProvinceId; building: BuildingKind }
  | { kind: "muster"; province: ProvinceId; unit: UnitKind; companies: number }
  | { kind: "move"; army: ArmyId; to: ProvinceId }
  | { kind: "merge"; army: ArmyId; into: ArmyId }
  | { kind: "disband"; army: ArmyId }
  | { kind: "set_tax"; taxRate: number }
  | { kind: "set_conscription"; level: number }
  | { kind: "set_granary_reserve"; share: number }
  | { kind: "enact_edict"; edict: Edict }
  | { kind: "repeal_edict"; edictId: string }
  | { kind: "declare_war"; target: RealmId }
  | { kind: "propose"; proposal: Omit<DiplomaticProposal, "id" | "season" | "status" | "from"> }
  | { kind: "respond"; proposalId: string; accept: boolean; message?: string }
  | { kind: "withdraw"; proposalId: string }
  | { kind: "cede_province"; province: ProvinceId; to: RealmId }
  | { kind: "colonize"; province: ProvinceId; from: ProvinceId };

export interface SubmittedOrder {
  id: string;
  realm: RealmId;
  /** Free-form actor label: "marshal", "sovereign", "regent"… */
  actor: string;
  season: number;
  order: Order;
}

// ── Events / chronicle ──────────────────────────────────────────────────────

// ── Court, estates, heir, crises ────────────────────────────────────────────

export type Ambition = "glory" | "gold" | "order" | "peace" | "faith" | "power";

/** A named person holding a seat: minister, sovereign or ambassador. */
export interface Courtier {
  role: string;
  name: string;
  house: string;
  ambition: Ambition;
  /** 0..100; how the season's outcomes have treated this person's cause. */
  standing: number;
  /** Role id of the courtier this one resents, or null. */
  rival: string | null;
  /** Seed for the procedural portrait and crest. */
  portrait: number;
  /** One-line self-description used in prompts and cards. */
  temperament: string;
}

export type Estate = "peasants" | "burghers" | "clergy" | "nobles";
export const ESTATES: readonly Estate[] = ["peasants", "burghers", "clergy", "nobles"];
export type Estates = Record<Estate, number>;

export type HeirTrait = "bold" | "cautious" | "just" | "greedy" | "pious";
export const HEIR_TRAITS: readonly HeirTrait[] = ["bold", "cautious", "just", "greedy", "pious"];

export interface Heir {
  name: string;
  /** Age in years at the start. */
  ageAtStart: number;
  traits: Record<HeirTrait, number>;
  tutor: string | null;
  /** Filled in at the end of the game. */
  verdict: string | null;
}

export interface Regent {
  name: string;
  /** 0..100 personal reputation, inherited by the heir's verdict. */
  reputation: number;
}

export type CrisisEffect =
  | { kind: "treasury"; amount: number }
  | { kind: "estate"; estate: Estate; amount: number }
  | { kind: "estates"; amount: number }
  | { kind: "unrest"; province: ProvinceId | "all"; amount: number }
  | { kind: "population"; province: ProvinceId; factor: number }
  | { kind: "heir"; trait: HeirTrait; amount: number }
  | { kind: "reputation"; amount: number }
  | { kind: "relation"; realm: RealmId; amount: number }
  | { kind: "army"; province: ProvinceId; unit: UnitKind; companies: number }
  | { kind: "province_to"; province: ProvinceId; realm: RealmId }
  | { kind: "war"; realm: RealmId }
  | { kind: "prestige"; amount: number }
  | { kind: "infamy"; amount: number }
  | { kind: "granary"; province: ProvinceId | "all"; amount: number }
  | { kind: "standing"; role: string; amount: number }
  | { kind: "tutor"; role: string }
  | { kind: "fertility"; province: ProvinceId; amount: number }
  | { kind: "disband_rebels"; province: ProvinceId }
  | { kind: "legitimacy_floor"; amount: number };

export interface CrisisOption {
  id: string;
  label: string;
  text: string;
  effects: CrisisEffect[];
  /** Minister whose portfolio the option belongs to, for the chat card. */
  adviser?: string;
}

/** A choice put to the Regent; unresolved crises take their default at the season's end. */
export interface Crisis {
  id: string;
  kind: string;
  title: string;
  text: string;
  season: number;
  realm: RealmId;
  province?: ProvinceId;
  options: CrisisOption[];
  defaultOption: string;
  chosen: string | null;
  /** Who decided: "regent", "protector", "default". */
  decidedBy: string | null;
}

export type Scenario = "long" | "winter";

export type EventKind =
  | "season"
  | "economy"
  | "famine"
  | "growth"
  | "unrest"
  | "revolt"
  | "build"
  | "muster"
  | "march"
  | "battle"
  | "siege"
  | "capture"
  | "war"
  | "treaty"
  | "proposal"
  | "law"
  | "council"
  | "legitimacy"
  | "victory"
  | "defeat"
  | "elimination"
  | "colonize"
  | "crisis"
  | "court"
  | "trade";

export interface GameEvent {
  season: number;
  kind: EventKind;
  /** Human-readable, present tense past. */
  text: string;
  /** Realms concerned; drives who gets briefed. */
  realms: RealmId[];
  province?: ProvinceId;
  data?: Record<string, unknown>;
}

// ── Game ────────────────────────────────────────────────────────────────────

// ── Staged intents, promises, debates ───────────────────────────────────────

export type IntentKind = "march" | "edict" | "offer" | "build" | "muster" | "other";

/**
 * A preview of what a seat means to do, drawn on the map before the order
 * exists. Intents never touch the world; they are cleared when the related
 * order is sealed, withdrawn or resolved, and all of them at resolution.
 */
export interface StagedIntent {
  id: string;
  /** Seat that staged it: "marshal", "sovereign:r1"… */
  role: string;
  realm: RealmId;
  kind: IntentKind;
  /** One line the Regent reads on the map. */
  label: string;
  season: number;
  payload: {
    province?: ProvinceId;
    from?: ProvinceId;
    to?: ProvinceId;
    army?: ArmyId;
    target?: RealmId;
    /** For edicts: the conditions whose matching provinces light up. */
    when?: EdictCondition[];
    building?: BuildingKind;
    unit?: UnitKind;
    companies?: number;
  };
  /** Order this intent anticipates, once submitted. */
  orderId: string | null;
}

/** What would count as the Regent's word being kept. */
export type PromiseCheck =
  | { kind: "treaty"; with: RealmId; treatyKind: TreatyKind }
  | { kind: "no_war"; with: RealmId; seasons: number }
  | { kind: "cede"; province: ProvinceId; to: RealmId }
  | { kind: "free_text" };

export type PromiseStatus = "pending" | "kept" | "broken";

/** A promise the Regent made, recorded by the Envoy or the Herald. */
export interface RegentPromise {
  id: string;
  /** Realm the promise was made to. */
  to: RealmId;
  text: string;
  check: PromiseCheck;
  season: number;
  status: PromiseStatus;
  /** Season the promise was settled, if it was. */
  settled: number | null;
  /** Who wrote it down. */
  recordedBy: string;
}

export type Phase = "orders" | "closing" | "finished";

export interface Outcome {
  kind: "victory" | "defeat";
  title: string;
  reason: string;
  season: number;
  /** The heir's judgement of the Regency, written at the end. */
  verdict?: string;
}

export interface MapMeta {
  cols: number;
  rows: number;
  /** Sea cells as hex keys, for rendering. */
  seaCells: string[];
  /** Rivers as chains of cell centres running down to the sea. */
  rivers: Axial[][];
}

export interface GameState {
  version: 1;
  seed: string;
  title: string;
  season: number; // 0-based, 4 per year
  startYear: number;
  /** Season index at which the heir comes of age. */
  majoritySeason: number;
  phase: Phase;
  playerRealm: RealmId;
  realms: Record<RealmId, Realm>;
  provinces: Record<ProvinceId, Province>;
  armies: Record<ArmyId, Army>;
  wars: Array<[RealmId, RealmId]>;
  treaties: Treaty[];
  proposals: DiplomaticProposal[];
  council: CouncilProposal[];
  map: MapMeta;
  outcome: Outcome | null;
  /** Deficit streak for the player's bankruptcy check. */
  deficitStreak: number;
  nextId: number;
  scenario: Scenario;
  /** People at court, keyed by role ("marshal", "sovereign:r1", …). */
  court: Record<string, Courtier>;
  heir: Heir;
  regent: Regent;
  /** Choices put to the Regent; pending ones have `chosen === null`. */
  crises: Crisis[];
  /** Per-season narrative digest written at resolution. */
  digest: string[];
  /**
   * The legend of a previous Regency, read from `projects/regency/legend.md`
   * when the game was founded. Rival sovereigns quote it as memory.
   */
  legend?: string;
}

export const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"] as const;

export function seasonLabel(state: Pick<GameState, "season" | "startYear">): string {
  const name = SEASON_NAMES[state.season % 4]!;
  const year = state.startYear + Math.floor(state.season / 4);
  return `${name} ${year}`;
}

export function emptyUnits(): UnitCounts {
  return { levy: 0, regular: 0, cavalry: 0, siege: 0 };
}

export function emptyBuildings(): Record<BuildingKind, number> {
  return { farm: 0, market: 0, fort: 0, road: 0, mine: 0, granary: 0, shrine: 0, barracks: 0 };
}

export function totalCompanies(units: UnitCounts): number {
  return units.levy + units.regular + units.cavalry + units.siege;
}
