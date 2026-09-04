/**
 * Grimoire — shared types.
 *
 * This file is the contract between the engine (pure rules), the world
 * Durable Object (`workers/grimoire-world`), the agents
 * (`workers/grimoire-agents`: the familiar, the spirits, the Moor, chartered
 * golems) and the panel (`panels/grimoire`). Everything here is plain JSON so
 * it can cross RPC, be stored in SQLite, and be shipped into an eval sandbox.
 *
 * Vocabulary (see docs/grimoire-design.md):
 *  - verse: what the player speaks. Any language, verse-shaped.
 *  - concepts: what the lexicon hears in the verse (resonance).
 *  - spell record: the minted, enforceable identity of one cast.
 *  - writing: the code the familiar wrote under the words.
 *  - effects: batched, validated, committed per tick by the world.
 *  - scrying: provenance over all of the above.
 */

// ───────────────────────────────────────────────────────────────────────────
// Elements, cells, regions
// ───────────────────────────────────────────────────────────────────────────

/** The eight elements plus the derived quantities, one integer per cell. */
export const LAYERS = [
  "heat", "water", "stone", "growth", "air", "light", "rot", "ether",
  "steam", "silt", "ash", "frost", "spore", "silver", "glass",
] as const;
export type Layer = (typeof LAYERS)[number];
export const ELEMENTS = ["heat", "water", "stone", "growth", "air", "light", "rot", "ether"] as const;
export type Element = (typeof ELEMENTS)[number];

export type SpeciesId = "grass" | "apple" | "reed" | "moonbloom" | "firethorn" | "lichen" | "blight-cap";

export type RegionId =
  | "manor" | "garden" | "scriptorium" | "library" | "chapel" | "orchard"
  | "cold-house" | "hot-house" | "night-house" | "upper-reach" | "mill"
  | "lower-reach" | "grate" | "mine-upper" | "mine-deep" | "silver-seam"
  | "foundry" | "glassworks" | "bell-tower" | "boneyard" | "ridge"
  | "observatory" | "green" | "near-moor" | "barrows" | "far-fen" | "road-out";

export interface Mark { sigil: string; glow?: string; by: string; spellId: string }

export type CharmKind = "lantern" | "mist" | "moths" | "glow" | "chime" | "petals" | "sigil" | "colour";
export interface Charm { kind: CharmKind; colour?: string; intensity?: number; by: string; spellId: string; label?: string }

export type SluiceState = "open" | "closed" | "half";
export interface Sluice { name: string; region: RegionId; x: number; y: number; state: SluiceState; feeds: RegionId | null; wardedBy: string | null }

/** Struct-of-arrays region. Index = y * w + x. */
export interface Region {
  id: RegionId;
  name: string;
  w: number;
  h: number;
  /** Which "floor"/level for multi-floor regions; 0 for most. */
  floors: number;
  elevation: number[];
  /** 1 where a ley line passes. */
  ley: number[];
  layers: Record<Layer, number[]>;
  /** Species id per cell or "" for none. */
  species: string[];
  /** Cells that are indoors / roofed (no sky). 1 = roofed. */
  roof: number[];
  marks: Record<string, Mark>;
  adorns: Record<string, Charm>;
  /** Named sluices in this region. */
  sluices: Sluice[];
  /** Named cells: true names of places (the hearth, the weir, a cairn). */
  places: Record<string, { x: number; y: number; name: string; trueName?: string }>;
  /** How the map should be drawn wrong. Recomputed each tick from state. */
  ailments: Ailment[];
  /** Neighbouring regions for flows: water leaves this region into `downstream`. */
  downstream: RegionId | null;
  /** Wind enters from these regions (for spore carriage). */
  windward: RegionId[];
}

export type AilmentKind = "flooded" | "rot" | "stale-ward" | "dark" | "cold" | "still" | "broken" | "vermin" | "leaking" | "locked" | "quarrel" | "silted";
export interface Ailment { kind: AilmentKind; severity: number; cells?: number[]; note: string }

export interface CellRef { region: RegionId; x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** One cell as the binding reads it (materialised from the struct-of-arrays). */
export interface Cell extends CellRef, Record<Layer, number> {
  elevation: number;
  ley: boolean;
  roofed: boolean;
  species: SpeciesId | null;
  mark: Mark | null;
  adorn: Charm | null;
}

// ───────────────────────────────────────────────────────────────────────────
// Entities: creatures, golems, spirits' anchors
// ───────────────────────────────────────────────────────────────────────────

export type CreatureKind = "sparrow" | "vermin" | "carp" | "silt-worm" | "moth" | "warm-thing";
export type GolemBody = "stone" | "wood" | "bone";
export type GolemAction =
  | { kind: "move"; dir: Dir }
  | { kind: "carry"; reagent?: Reagent }
  | { kind: "place" }
  | { kind: "strike"; dir: Dir }
  | { kind: "tend" }
  | { kind: "speak"; line: string };

export type Dir = "n" | "s" | "e" | "w";

export interface Entity {
  /** True name for golems and named creatures; generated id otherwise. */
  name: string;
  kind: "creature" | "golem";
  sub: CreatureKind | GolemBody;
  region: RegionId;
  x: number;
  y: number;
  /** Small mutable state the behaviour uses (hunger, sleep, target…). */
  state: Record<string, number | string | boolean>;
  carrying: Partial<Record<Reagent, number>>;
  /** Behaviour source for creatures (pure code, small, legible: the first thing a player scries). */
  behaviour: string | null;
  /** Binding for golems. */
  bound: { mode: "automaton"; spellId: string; source: string } | { mode: "charter"; spellId: string; charter: string } | { mode: "stale"; spellId: string; source: string; author: string } | null;
  /** Last thing it said or did, for the map. */
  last: string;
  tired: number;
}

export type Reagent = "ash" | "salt" | "sap" | "silver" | "glass" | "moon-ether" | "bone" | "seed" | "fibre";
export const REAGENTS: readonly Reagent[] = ["ash", "salt", "sap", "silver", "glass", "moon-ether", "bone", "seed", "fibre"];

// ───────────────────────────────────────────────────────────────────────────
// Sky, calendar, festivals
// ───────────────────────────────────────────────────────────────────────────

export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather = "clear" | "overcast" | "rain" | "storm" | "snow" | "fog" | "wind";
export type FestivalId = "first-sap" | "midsummer" | "first-frost" | "long-dark";

export interface Sky {
  tick: number;
  /** 0..23 */
  hour: number;
  /** day within season, 0..29 */
  day: number;
  season: Season;
  /** 1-based */
  year: number;
  /** 0..7, 4 = full */
  moon: number;
  weather: Weather;
  windDir: Dir;
  windForce: number;
  /** Named storms announced three days ahead. */
  forecast: Array<{ inDays: number; weather: Weather; name?: string }>;
  /** True while a festival is on. */
  festival: FestivalId | null;
  /** Whether the bell is true (repaired). Hours drift when it is not. */
  bellTrue: boolean;
  /** Bell-hour count since the estate began (the "bell hour" for scry budgets). */
  bell: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Lexicon and resonance
// ───────────────────────────────────────────────────────────────────────────

export type ConceptFamily = "element" | "quality" | "binding" | "verb" | "reagent" | "voice" | "direction" | "quantity" | "name";

export interface Concept {
  id: string;
  family: ConceptFamily;
  /** The estate's root, if any (`hama`). Optional power word. */
  root: string | null;
  gloss: string;
  /** Plain-language cues in several languages; matched fuzzily. */
  cues: string[];
  /** What the concept unlocks in the binding (see capability table). */
  unlocks: Capability[];
}

export type Capability =
  | "adorn" | "transmute" | "push" | "spawn" | "move" | "transfer" | "mark" | "sluice"
  | "craft" | "ward" | "time" | "voice" | "bind" | "against" | "scry-deep" | "estate";

export interface ResonanceEntry { concept: string; confidence: number; fromWord: string; viaRoot: boolean }
export interface Resonance {
  entries: ResonanceEntry[];
  /** Words the index could not place at all (candidates for wild words). */
  unknown: string[];
  /** True names spoken in the verse. */
  names: string[];
  /** Concept ids with confidence ≥ threshold. */
  earned: string[];
  /** 0..1, summarised for cost. */
  strength: number;
}

export interface Inscription { word: string; definition: string; concept: string; by: string; verse: string; firstEffect: string; tick: number; challenged?: { by: string; newDefinition: string; tick: number } }

export interface TrueName { name: string; meaning: string; kind: "spirit" | "golem" | "place" | "spell" | "estate" | "person"; ref: string }

// ───────────────────────────────────────────────────────────────────────────
// The form gate
// ───────────────────────────────────────────────────────────────────────────

export type GateRejectReason = "prose" | "too-long" | "line-too-long" | "addressed-to-machinery" | "empty";
export interface GateScore { meter: number; rhyme: number; form: number; sincerity: number; lines: number; verseness: number }
export type GateResult =
  | { ok: true; score: GateScore; lines: string[]; normalized: string }
  | { ok: false; reason: GateRejectReason; line?: string; score?: GateScore };

// ───────────────────────────────────────────────────────────────────────────
// Spells
// ───────────────────────────────────────────────────────────────────────────

export type Tier = "charm" | "cantrip" | "ward" | "automaton" | "charter" | "working" | "ritual" | "counter" | "scry";

export type SpellStatus =
  | "heard"        // form gate passed, record minted, familiar not yet spoken
  | "deliberating" // the familiar has it
  | "rehearsed"
  | "cast"         // effects committed (for persistent tiers: installed)
  | "misfired"
  | "rejected"
  | "released"
  | "sealed"       // waiting on the council
  | "checkpointed"; // a working between phases

export type SubjectKind = "cells" | "entity" | "spirit" | "spell" | "sky" | "self";

export interface Intent {
  subject: { kind: SubjectKind; ref: string; region?: RegionId; rect?: Rect };
  effect: string;
  quantity?: { concept: string; value: number };
  binding?: { kind: "once" | "while" | "until" | "whenever" | "at"; condition: string };
  concepts: Array<{ concept: string; confidence: number; fromWord: string }>;
  unsure: string[];
  tier: Tier;
}

export type MisfireKind = "over-reach" | "mis-hearing" | "wrong-subject" | "echo" | "moors-ear" | "moths" | "silence" | "unrehearsed" | "ceiling";

export type RejectReason = "not-a-spell" | "out-of-world" | "addressed-to-machinery" | "forbidden-working" | "council-required";

export interface Receipt {
  id: string;
  effect: Effect;
  /** Accepted, or why not. */
  status: "applied" | "rejected";
  reason?: string;
  etherCost: number;
  tick: number;
  /** For scrying's before/after. */
  before?: Partial<Record<Layer, number>>;
  after?: Partial<Record<Layer, number>>;
}

export interface Rehearsal {
  ok: boolean;
  /** Effects the run would have produced. */
  effects: Effect[];
  log: string[];
  error?: string;
  /** Cells touched, for the ceiling check. */
  touched: number;
  /** Estimated ether. */
  ether: number;
  /** A tiny summary the familiar can read: what changed per layer. */
  summary: string;
  returnValue?: unknown;
}

export interface Firing { tick: number; receipts: Receipt[]; log: string[]; error?: string; misfire?: MisfireKind }

export interface SpellRecord {
  id: string;
  /** Given by the familiar on cast; shown in the spellbook. */
  name: string | null;
  caster: string;
  coCasters: string[];
  verse: string;
  verseNormalized: string;
  fingerprint: string;
  lines: string[];
  score: GateScore;
  resonance: Resonance;
  tier: Tier;
  status: SpellStatus;
  intent: Intent | null;
  writing: string | null;
  /** The familiar's per-block gloss, keyed by line number in the writing. */
  gloss: Record<string, string>;
  /** Margin notes: the familiar's, and sometimes Ysolde's echo. */
  margin: Array<{ hand: "familiar" | "ysolde" | "spirit" | "world"; text: string; tick: number }>;
  rehearsal: Rehearsal | null;
  receipts: Receipt[];
  firings: Firing[];
  misfire: { kind: MisfireKind; note: string } | null;
  reject: { reason: RejectReason; line: string } | null;
  /** Which idiom(s) and prior spell(s) the writing drew on. */
  ancestry: string[];
  /** The variation family: the spell this is a variation of. */
  variantOf: string | null;
  /** For persistent tiers. */
  persistent: PersistentSpell | null;
  etherBudget: number;
  etherSpent: number;
  focus: string | null;
  createdTick: number;
  castTick: number | null;
  /** Concept ids the record earns; world methods check these. */
  earned: string[];
  /** Region(s) the spell may touch beyond reads. */
  scope: RegionId[];
  /** Whether it was cached (fast path) — for the spellbook's "instant". */
  fromCache: boolean;
  /** Who the trigger came from when a ward/working fires (spellId). */
  triggeredBy: string | null;
  /** Spells this one triggered. */
  triggered: string[];
  /** The stages of the familiar's craft, in order, as the circle shows them. */
  trail: TrailEntry[];
  /** Set once the world promoted this spell into the idiom library. */
  promotedIdiom: string | null;
}

export type TrailStage = "spoken" | "heard" | "looked" | "written" | "rehearsed" | "cast" | "misfired" | "rejected" | "sealed" | "fired" | "promoted" | "released";
export interface TrailEntry { stage: TrailStage; text: string; tick: number; seq: number }

export type Trigger =
  | { kind: "cell"; region: RegionId; rect?: Rect; predicate: string }     // predicate: JS expression over `cell`
  | { kind: "entity"; name: string; event: "moves" | "speaks" | "carries" | "tired" | "arrives" }
  | { kind: "speech"; name: string }
  | { kind: "sky"; event: "dawn" | "dusk" | "noon" | "midnight" | "full-moon" | "new-moon" | "storm" | "frost" | "season" | "festival" | "tick" }
  | { kind: "spell"; spellId: string; event: "fires" | "misfires" | "released" }
  | { kind: "at"; tick: number };

export interface PersistentSpell {
  kind: "ward" | "automaton" | "charter" | "working" | "ritual";
  trigger: Trigger | null;
  /** Stored source; re-evaluated on trigger. */
  source: string;
  /** For workings: checkpoint state and phase. */
  checkpoint: unknown;
  phase: number;
  /** For automata/charters: the golem. */
  golem: string | null;
  upkeep: number;
  /** Set when a ward is fed by another (the lattice). */
  watches: string[];
  active: boolean;
  /** The one lexicon change that would invalidate it, if any. */
  dependsOn: string[];
}

// ───────────────────────────────────────────────────────────────────────────
// Effects: what the binding batches; what the world validates and applies
// ───────────────────────────────────────────────────────────────────────────

export type Effect =
  | { kind: "transmute"; cell: CellRef; delta: Partial<Record<Layer, number>> }
  | { kind: "push"; cell: CellRef; dir: Dir; force: number }
  | { kind: "move"; entity: string; to: CellRef }
  | { kind: "spawn"; what: CreatureKind | SpeciesId; at: CellRef }
  | { kind: "transfer"; from: string; to: string; reagent: Reagent; n: number }
  | { kind: "mark"; cell: CellRef; sigil: string; glow?: string }
  | { kind: "adorn"; cell: CellRef; charm: Omit<Charm, "by" | "spellId"> }
  | { kind: "sluice"; name: string; state: SluiceState }
  | { kind: "craft"; recipe: Reagent; at: string; n: number }
  | { kind: "at"; tick: number; source: string; state?: unknown }
  | { kind: "checkpoint"; state: unknown; phase: number }
  | { kind: "ward"; trigger: Trigger; source: string; name?: string }
  | { kind: "release-ward"; wardId: string }
  | { kind: "speak"; name: string; verse: string }
  | { kind: "bargain"; name: string; offer: Offer }
  | { kind: "bind-automaton"; golem: string; source: string }
  | { kind: "bind-charter"; golem: string; charter: string }
  | { kind: "release-golem"; golem: string }
  | { kind: "act"; golem: string; action: GolemAction }
  | { kind: "against"; spellId: string; how: "release" | "starve" | "redirect"; trigger?: Trigger }
  | { kind: "remember"; key: string; value: unknown };

export interface Offer { give: Partial<Record<Reagent, number>> & { word?: string; deed?: string }; want: string }

export interface EffectEnvelope {
  /** Max cells a batch may touch. */
  cells: number;
  /** Max ether. */
  ether: number;
  /** Regions the batch may touch. */
  regions: RegionId[];
  /** Capabilities the record earns. */
  capabilities: Capability[];
}

/** Rehearsal rules per tier (design §19.4), enforced at commit. */
export const REHEARSAL_RULES: Record<Tier, { mustRehearse: boolean; cellCeiling: number; scope: "cell" | "few" | "room" | "body" | "region" | "estate" }> = {
  charm: { mustRehearse: false, cellCeiling: 4096, scope: "room" },
  cantrip: { mustRehearse: false, cellCeiling: 48, scope: "few" },
  ward: { mustRehearse: true, cellCeiling: 256, scope: "room" },
  automaton: { mustRehearse: true, cellCeiling: 8, scope: "body" },
  charter: { mustRehearse: false, cellCeiling: 8, scope: "body" },
  working: { mustRehearse: true, cellCeiling: 4096, scope: "region" },
  ritual: { mustRehearse: true, cellCeiling: 65536, scope: "estate" },
  counter: { mustRehearse: true, cellCeiling: 256, scope: "room" },
  scry: { mustRehearse: false, cellCeiling: 0, scope: "cell" },
};

// ───────────────────────────────────────────────────────────────────────────
// Snapshot: what the binding is given (a region fork, the sky, the caster)
// ───────────────────────────────────────────────────────────────────────────

export interface Caster {
  id: string;
  name: string;
  reserve: number;
  reserveMax: number;
  reagents: Partial<Record<Reagent, number>>;
  /** Concept ids known. */
  words: string[];
  names: string[];
  foci: Focus[];
  region: RegionId;
  x: number;
  y: number;
  /** Ids of active persistent spells. */
  active: string[];
}

export interface Focus { id: string; name: string; concepts: string[]; tiers: Tier[]; regions: RegionId[] | "estate"; broken: boolean; madeBy: string }

export interface Snapshot {
  spellId: string;
  record: Pick<SpellRecord, "id" | "caster" | "tier" | "earned" | "scope" | "etherBudget" | "coCasters">;
  regions: Region[];
  entities: Entity[];
  sky: Sky;
  caster: Caster;
  /** Named spells the caster may invoke (their spellbook, runes, and known workings). */
  workings: Record<string, { name: string; source: string; tier: Tier }>;
  /** Spirit utterances the caster may listen to. */
  utterances: Utterance[];
  /** Per-caster memory scope. */
  memory: Record<string, unknown>;
  /** Trigger payload when the run is a firing. */
  trigger?: { spellId: string; trigger: Trigger; payload: unknown; tick: number };
  /** For golem bodies: senses. */
  senses?: Senses;
  /** The envelope for this run. */
  envelope: EffectEnvelope;
  /** True on a rehearsal fork. */
  fork: boolean;
}

export interface Senses { self: Entity; cell: Cell; around: Cell[]; heard: Utterance[]; carrying: Partial<Record<Reagent, number>>; nearby: Entity[] }

export interface Utterance { id: string; by: string; to: string | null; verse: string; tick: number; kind: "speech" | "bargain" | "answer" | "judgement" | "news" }

/** What the sandbox returns after running source against a snapshot. */
export interface RunResult {
  ok: boolean;
  effects: Effect[];
  log: string[];
  error?: string;
  returnValue?: unknown;
  /** Number of distinct cells touched by effects. */
  touched: number;
  /** Ether the binding estimated. */
  ether: number;
  /** Memory writes. */
  memory: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────────────────────
// Spirits, golems, bargains, council, festivals
// ───────────────────────────────────────────────────────────────────────────

export type SpiritId = "hearth" | "river" | "library" | "foundry" | "mill" | "bell" | "glass" | "orchard" | "deep" | "boneyard" | "ridge" | "moor" | "echo";

export interface Spirit {
  id: SpiritId;
  title: string;
  trueName: string;
  meaning: string;
  anchor: CellRef;
  /** What it wants right now, in one line; the channel header. */
  wants: string;
  /** Standing wants list, in order; the news and undone list draw from them. */
  wantList: Array<{ id: string; text: string; met: boolean }>;
  temper: string;
  hour: string;
  colour: string;
  ornament: string;
  knows: string[];
  /** Gratitude/grudge per apprentice, -3..3. */
  regard: Record<string, number>;
  /** Whether the player has learned the true name. */
  named: boolean;
  /** Whether the spirit is awake (speaks); many wake on a milestone. */
  awake: boolean;
  /** Ether budget for its own workings. */
  reserve: number;
}

export interface Bargain { id: string; spirit: SpiritId; by: string; offer: Offer; answer: string | null; status: "open" | "accepted" | "refused" | "settled"; tick: number; spellId: string }

export interface CouncilCard {
  id: string;
  spellId: string;
  title: string;
  /** What it will do, priced and validated. */
  summary: string;
  rehearsal: Rehearsal | null;
  cost: number;
  /** Apprentices whose seal it needs. */
  needs: string[];
  seals: Record<string, boolean>;
  status: "open" | "sealed" | "withdrawn" | "cast";
  tick: number;
  reason: string;
}

export interface FestivalRecord { id: FestivalId; year: number; judge: SpiritId; entries: Array<{ by: string; spellId: string; verse: string }>; verdict: string | null; winner: string | null; tick: number }

// ───────────────────────────────────────────────────────────────────────────
// The undone list, the news, the notebooks
// ───────────────────────────────────────────────────────────────────────────

export interface UndoneItem {
  id: string;
  text: string;
  hand: "ysolde" | "familiar" | "apprentice" | "spirit";
  done: boolean;
  /** Annotations over the years. */
  notes: string[];
  /** Region it points at, for the map. */
  region: RegionId | null;
  /** Milestone id in the campaign, when it is one. */
  milestone: string | null;
  addedTick: number;
  doneTick: number | null;
}

export interface NewsItem { id: string; tick: number; by: string; hand: "familiar" | SpiritId | "golem" | "world" | "moor"; text: string; rung: "quiet" | "inbox" | "urgent"; region: RegionId | null; spellId: string | null; read: boolean }

export interface NewsPage { id: string; day: number; season: Season; year: number; items: NewsItem[]; oneThing: { text: string; undoneId: string | null; region: RegionId | null } | null; read: boolean }

export interface Notebook { id: string; author: string; title: string; era: string; pages: NotebookPage[]; missingPages?: number; locked?: boolean }
export interface NotebookPage { n: number; text: string; verses: Array<{ lines: string[]; about: string; echoable: boolean }>; words?: string[] }

export interface Story { id: string; title: string; about: string; text: string; unlocks?: string; year: number }

export interface Idiom { id: string; name: string; about: string; source: string; concepts: string[]; origin: "seed" | "learned" | "master"; provenance: string | null; usedBy: string[] }

// ───────────────────────────────────────────────────────────────────────────
// Whole-estate state (the engine's unit of work; the DO shards it)
// ───────────────────────────────────────────────────────────────────────────

export interface Apprentice { id: string; name: string; present: boolean; region: RegionId; x: number; y: number; reserve: number; reserveMax: number; reagents: Partial<Record<Reagent, number>>; words: string[]; names: string[]; foci: Focus[]; wildWords: string[]; deepScriesThisBell: number; proseInARow: number; studyOpen: boolean; joinedTick: number; lastSeenTick: number }

export interface EstateState {
  seed: string;
  regions: Record<RegionId, Region>;
  entities: Record<string, Entity>;
  sky: Sky;
  spirits: Record<SpiritId, Spirit>;
  apprentices: Record<string, Apprentice>;
  /** Persistent spells live in records; this is the active index. */
  activeSpells: string[];
  /** The Moor's pressure and memory. */
  moor: { pressure: number; reserve: number; stolenWords: string[]; heardWords: string[]; tactic: string; quiet: boolean; adapted: string[] };
  undone: UndoneItem[];
  milestones: Record<string, { done: boolean; tick: number | null }>;
  festivals: FestivalRecord[];
  inscriptions: Inscription[];
  /** Concept ids known to the household (union). */
  householdWords: string[];
  /** The estate's true name, once found; unlocks the widening. */
  estateName: string | null;
  /** Wall standing (Ilvane's ward), as a bool the stale ward reads. */
  wallStands: boolean;
  /** Counter for ids. */
  seq: number;
  /** Last processed tick. */
  lastTick: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Views for the panel
// ───────────────────────────────────────────────────────────────────────────

export interface RegionThumb { w: number; h: number; water: number[]; rot: number[]; growth: number[]; light: number[]; heat: number[]; stone: number[] }
export interface RegionSummary { id: RegionId; name: string; w: number; h: number; ailments: Ailment[]; wards: number; entities: number; spirit: SpiritId | null; restored: boolean; apprentices: string[]; thumb: RegionThumb; golems: string[] }
export interface GolemSummary { name: string; body: GolemBody; region: RegionId; x: number; y: number; mode: "automaton" | "charter" | "stale" | null; spellId: string | null; last: string; tired: number }

export interface Overview {
  sky: Sky;
  regions: RegionSummary[];
  spirits: Array<Pick<Spirit, "id" | "title" | "wants" | "colour" | "ornament" | "hour" | "awake" | "named" | "anchor" | "regard"> & { trueName: string | null; channelId: string | null; unmet: number }>;
  golems: GolemSummary[];
  halls: Array<{ key: string; spirits: SpiritId[]; topic: string; tick: number }>;
  undone: UndoneItem[];
  apprentices: Array<Pick<Apprentice, "id" | "name" | "present" | "region" | "reserve" | "reserveMax">>;
  activeSpells: Array<Pick<SpellRecord, "id" | "name" | "tier" | "caster" | "status"> & { region: RegionId | null; upkeep: number }>;
  news: { unread: number; latest: NewsPage | null };
  council: number;
  deliberating: Array<Pick<SpellRecord, "id" | "verse" | "status" | "caster" | "createdTick">>;
  moor: { pressure: number; quiet: boolean };
  estateName: string | null;
  firstHour: FirstHourState;
}

export interface FirstHourState { step: number; hearthLit: boolean; firstMisfire: boolean; firstScry: boolean; firstWard: boolean; firstEvening: boolean; gardenCasts: number; scrySuggested: boolean }

export interface RegionView { region: Region; entities: Entity[]; wards: Array<{ id: string; name: string | null; caster: string; cells: number[]; stale: boolean; tier: Tier }>; sky: Sky }

export interface SpeakResult {
  kind: "gate" | "instant" | "deliberating" | "study" | "silence";
  spellId?: string;
  /** For the gate: the familiar's one line. */
  line?: string;
  /** For instant: receipts. */
  receipts?: Receipt[];
  gate?: GateResult;
  /** When the study opened. */
  studyOpened?: boolean;
}

export interface ScryPage {
  spell: SpellRecord;
  casterName: string;
  hand: "familiar" | "ysolde" | "spirit" | "moor" | "other";
  /** The words of the verse with concept marks. */
  words: Array<{ word: string; concept: string | null; confidence: number; unsure: boolean; root: boolean; name: boolean }>;
  ancestry: Array<{ id: string; name: string; kind: "idiom" | "spell" | "rune" }>;
  before: Partial<Record<Layer, number>>;
  after: Partial<Record<Layer, number>>;
  triggeredBy: Array<{ id: string; name: string | null; verse: string }>;
  triggered: Array<{ id: string; name: string | null; verse: string }>;
  cost: { ether: number; from: string };
  /** For creatures/entities scried: the behaviour source. */
  behaviour?: { name: string; source: string; lines: number };
  /** Deep scry budget left this bell hour. */
  deepLeft: number;
  echo: string | null;
}

export interface SpellbookView {
  spells: Array<Pick<SpellRecord, "id" | "name" | "verse" | "lines" | "tier" | "status" | "castTick" | "variantOf" | "fromCache" | "caster"> & { region: RegionId | null; before: Partial<Record<Layer, number>>; after: Partial<Record<Layer, number>>; shelved: boolean; instant: boolean; firings: number }>;
  shelved: string[];
}

export interface GrimoireView {
  known: Array<Concept & { learnedFrom: string | null }>;
  smudged: Array<{ id: string; family: ConceptFamily; hint: string }>;
  names: TrueName[];
  inscriptions: Inscription[];
  masterIndex: Array<{ shelf: string; words: string[]; open: boolean }>;
  foci: Focus[];
  bargains: Bargain[];
  active: Array<{ id: string; name: string | null; tier: Tier; upkeep: number; region: RegionId | null }>;
}

export interface StudyView { notebooks: Array<Pick<Notebook, "id" | "author" | "title" | "era" | "missingPages" | "locked"> & { pages: number }>; stories: Story[]; wordsExplained: Record<string, string> }
