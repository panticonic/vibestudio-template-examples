/**
 * Grimoire — the wire contract.
 *
 * The world Durable Object (`GrimoireWorldDO`, service `examples.grimoire.v1`,
 * object key = estate key, `main` by default) exposes every method listed in
 * `WorldMethods` as an `@rpc` method taking exactly one input object. Panels
 * call it via `workers.durableObjectService(GRIMOIRE_PROTOCOL, estateKey)`;
 * agents use
 * `createDurableObjectServiceClient(this.rpc, GRIMOIRE_PROTOCOL, estateKey)`.
 *
 * Execution model (hybrid, decided 2026-09-04):
 *  - The familiar casts by running the binding prelude plus its own writing
 *    in ITS OWN eval sandbox against a `Snapshot` it fetched with
 *    `snapshot`, then submits the resulting `RunResult` with `commit`
 *    (or `rehearse` for a fork). The world validates everything at commit
 *    against the spell record, the tier's rehearsal rule and effect ceiling,
 *    and the caster's ether.
 *  - The world runs unattended source (wards, automata, workings, spirit
 *    acts, the Moor) in its own eval sandbox through a `SourceExecutor`.
 *    Tests inject a local executor.
 *  - Either way the program is `composeProgram(prelude, source, snapshot)`
 *    from the engine, so scrying shows one kind of record.
 */
import type {
  Apprentice, Bargain, CouncilCard, Entity, FestivalRecord, GrimoireView, Idiom, Intent, MisfireKind, NewsPage, Notebook, Overview,
  Region, RegionId, RegionView, RejectReason, RunResult, ScryPage, Snapshot, SpellRecord, SpellbookView, SpiritId, Story, StudyView, Tier, UndoneItem, Utterance,
} from "./types.js";

export const GRIMOIRE_PROTOCOL = "examples.grimoire.v1";
export const GRIMOIRE_SERVICE_NAME = "grimoire";
export const DEFAULT_ESTATE_KEY = "main";

/** Participant roles the agent worker can play. The seat arrives in the channel subscription config. */
export type AgentRole =
  | "familiar"                 // one per apprentice: `familiar` with `apprentice` set; circle and study are two channels over one conversation
  | `spirit:${SpiritId}`
  | "moor"
  | `golem:${string}`;

export interface AgentSeatConfig {
  role: AgentRole;
  estateKey: string;
  /** For the familiar: whose familiar conversation this is. */
  apprentice?: string;
  apprenticeName?: string;
  /** "circle" | "study" for the familiar's two rooms. */
  room?: "circle" | "study";
  handle?: string;
  name?: string;
  /** Directory of other seats, for `notify`. */
  directory?: Array<{ role: string; name: string; ref: string }>;
}

export interface Participant { role: string; channelId: string; participantId: string; targetId: string; handle: string; name: string; apprentice: string | null; room: "circle" | "study" | null }

// ───────────────────────────────────────────────────────────────────────────
// Method inputs and outputs. Every method: (input) => output.
// ───────────────────────────────────────────────────────────────────────────

export interface WorldMethods {
  // ── estate lifecycle ──
  newEstate: { in: { seed?: string; apprentice: string; apprenticeName: string; keepParticipants?: boolean }; out: { ok: true; letter: string; undone: UndoneItem[] } };
  joinEstate: { in: { apprentice: string; apprenticeName: string }; out: { ok: true; isNew: boolean } };
  /** Presence: the panel says who is looking and where. */
  presence: { in: { apprentice: string; present: boolean; region?: RegionId }; out: { ok: true } };

  // ── reading ──
  overview: { in: { apprentice?: string }; out: Overview };
  region: { in: { id: RegionId }; out: RegionView };
  spell: { in: { id: string }; out: SpellRecord | null };
  spellbook: { in: { apprentice: string }; out: SpellbookView };
  grimoire: { in: { apprentice: string }; out: GrimoireView };
  study: { in: { apprentice: string }; out: StudyView };
  notebook: { in: { id: string; apprentice: string }; out: Notebook | null };
  news: { in: { apprentice: string; limit?: number }; out: { pages: NewsPage[]; unread: number } };
  acknowledgeNews: { in: { apprentice: string; pageIds: string[] }; out: { ok: true } };
  undone: { in: Record<string, never>; out: UndoneItem[] };
  addUndone: { in: { apprentice: string; text: string; region?: RegionId }; out: UndoneItem };
  council: { in: Record<string, never>; out: CouncilCard[] };
  festivals: { in: Record<string, never>; out: FestivalRecord[] };
  entities: { in: { region?: RegionId }; out: Entity[] };
  utterances: { in: { spirit?: SpiritId; since?: number; apprentice?: string }; out: Utterance[] };
  idioms: { in: Record<string, never>; out: Idiom[] };
  stories: { in: { apprentice: string }; out: Story[] };
  /** The letter, the first thing the player reads. */
  letter: { in: Record<string, never>; out: { text: string; undone: UndoneItem[] } };

  // ── speaking (the circle) ──
  speak: { in: { apprentice: string; verse: string; room?: "circle" | "study"; focusCell?: { region: RegionId; x: number; y: number } }; out: import("./types.js").SpeakResult };
  /** Fast path: recast a spell of yours, optionally with substitutions of the same class. */
  recast: { in: { apprentice: string; spellId: string; substitutions?: Record<string, string | number> }; out: { ok: boolean; spellId?: string; receipts?: import("./types.js").Receipt[]; reason?: string } };
  release: { in: { apprentice: string; spellId: string }; out: { ok: boolean; reason?: string } };
  shelve: { in: { apprentice: string; spellId: string; shelved: boolean }; out: { ok: true } };
  /** Scrying: deep scries are budgeted per bell hour; shallow ones are free. */
  scry: { in: { apprentice: string; kind: "spell" | "cell" | "entity" | "spirit"; ref: string; region?: RegionId; x?: number; y?: number }; out: ScryPage | { error: string } };
  /** Charms placed by hand from the map (light a lantern, leave a mark): free, `lil` only. */
  adorn: { in: { apprentice: string; cell: { region: RegionId; x: number; y: number }; charm: { kind: import("./types.js").CharmKind; colour?: string; label?: string } }; out: { ok: boolean } };
  seal: { in: { apprentice: string; cardId: string; seal: boolean }; out: { ok: boolean; card?: CouncilCard; reason?: string } };
  /** Enter a festival with a spell of yours. */
  enterFestival: { in: { apprentice: string; spellId: string }; out: { ok: boolean; reason?: string } };
  /** Convene two or more spirits in a shared hall channel about a topic; each is woken to speak to the others there. The player may be admitted. */
  convene: { in: { apprentice: string; spirits: SpiritId[]; topic: string; channelId: string }; out: { ok: boolean; reason?: string; key: string } };
  /** The player speaks to a spirit in its channel; the world records it as an utterance and wakes the spirit. */
  address: { in: { apprentice: string; spirit: SpiritId; verse: string }; out: { ok: boolean; reason?: string; utteranceId?: string } };

  // ── the familiar's tools (caller must be the familiar seated for that apprentice) ──
  /** The intent record, before any code. Deterministic check against the record; returns what it lacks. */
  hear: { in: { spellId: string; intent: Intent }; out: { ok: boolean; lacking: string[]; note: string; tier: Tier } };
  /** A snapshot for the binding: the subject's region(s), sky, caster, workings. Marked `fork` when for rehearsal. */
  snapshot: { in: { spellId: string; regions?: RegionId[]; fork?: boolean }; out: Snapshot };
  /** The binding prelude the familiar prepends to its writing in its own eval. */
  prelude: { in: Record<string, never>; out: { source: string; version: string } };
  /** Record a rehearsal the familiar ran on a fork (its RunResult). The world re-summarises it. */
  rehearse: { in: { spellId: string; source: string; result: RunResult }; out: { ok: boolean; rehearsal: import("./types.js").Rehearsal } };
  /** Commit a cast: the writing, the run result, a name and a gloss. The world validates and applies. For persistent tiers it installs the source. */
  commit: { in: { spellId: string; source: string; result: RunResult; name?: string; gloss?: Record<string, string>; margin?: string; ancestry?: string[]; persistent?: { kind: "ward" | "automaton" | "charter" | "working" | "ritual"; trigger?: import("./types.js").Trigger; golem?: string } }; out: { ok: boolean; status: import("./types.js").SpellRecord["status"]; receipts: import("./types.js").Receipt[]; rejected: string[]; misfire?: { kind: MisfireKind; note: string }; line: string } };
  /** Ask the world to run the writing in ITS sandbox instead (the familiar may prefer this for long workings). */
  castHere: { in: { spellId: string; source: string; name?: string; gloss?: Record<string, string>; margin?: string; persistent?: WorldMethods["commit"]["in"]["persistent"] }; out: WorldMethods["commit"]["out"] };
  reject: { in: { spellId: string; reason: RejectReason; line: string }; out: { ok: true } };
  misfire: { in: { spellId: string; kind: MisfireKind; source?: string; line: string }; out: { ok: true; receipts: import("./types.js").Receipt[] } };
  inscribe: { in: { spellId: string; word: string; definition: string; concept: string; firstEffect: string }; out: { ok: boolean; reason?: string } };
  remember: { in: { apprentice: string; note: string }; out: { ok: true } };
  /** The familiar's margin note on a spell (also used for Ysolde's echo by the world). */
  annotate: { in: { spellId: string; text: string }; out: { ok: true } };
  /** Glance line for prose in the circle; the world counts prose and opens the study after three. */
  glance: { in: { apprentice: string; line: string }; out: { ok: true; studyOpened: boolean } };
  /** What the familiar should know before a turn: compact world summary for the apprentice's location and the spell's subject. */
  briefing: { in: { spellId?: string; apprentice: string }; out: { text: string } };
  /** Promote a clean spell into the idiom library. */
  promoteIdiom: { in: { spellId: string; name: string; about: string }; out: { ok: boolean; idiomId?: string } };

  // ── spirits, golems, the Moor (caller must be the seat) ──
  spiritBriefing: { in: { spirit: SpiritId | "moor" }; out: { text: string; wants: string; regard: Record<string, number> } };
  spiritSpeak: { in: { spirit: SpiritId | "moor"; to: string | null; verse: string; kind?: "speech" | "answer" | "judgement" }; out: { ok: true; utteranceId: string } };
  spiritWants: { in: { spirit: SpiritId; wants: string }; out: { ok: true } };
  spiritRegard: { in: { spirit: SpiritId; apprentice: string; delta: number }; out: { ok: true; regard: number } };
  answerBargain: { in: { spirit: SpiritId; bargainId: string; accept: boolean; answer: string; give?: { word?: string; name?: string } }; out: { ok: boolean } };
  /** A spirit or the Moor acts with its own standing focus: source run in the world's sandbox against its anchor region. */
  spiritAct: { in: { spirit: SpiritId | "moor"; source: string; note: string }; out: WorldMethods["commit"]["out"] };
  judgeFestival: { in: { spirit: SpiritId; festivalId: string; verdict: string; winner: string | null }; out: { ok: boolean } };
  /** A spirit writes to the news. */
  spiritNews: { in: { spirit: SpiritId | "moor"; text: string; rung?: "quiet" | "inbox" | "urgent"; region?: RegionId }; out: { ok: true } };
  golemSenses: { in: { golem: string }; out: import("./types.js").Senses };
  golemAct: { in: { golem: string; action: import("./types.js").GolemAction }; out: { ok: boolean; reason?: string; receipt?: import("./types.js").Receipt } };
  golemSay: { in: { golem: string; line: string }; out: { ok: true } };
  golemNews: { in: { golem: string; text: string }; out: { ok: true } };

  // ── time ──
  /** Advance the world by n ticks (the panel's "let the day pass"; the DO's idle cadence). Runs due wards/automata/workings. */
  advance: { in: { ticks?: number; reason?: string }; out: { ok: true; tick: number; fired: number; news: number } };

  // ── seating ──
  registerParticipant: { in: Participant; out: Participant[] };
  listParticipants: { in: Record<string, never>; out: Participant[] };
  setChannel: { in: { key: string; channelId: string }; out: { ok: true } };
  channels: { in: Record<string, never>; out: Record<string, string> };
  redeliver: { in: Record<string, never>; out: { delivered: number; failed: number } };
  /** Debug/test helper: the whole state (large). */
  dump: { in: Record<string, never>; out: { regions: Record<RegionId, Region>; entities: Record<string, Entity>; apprentices: Record<string, Apprentice>; spells: SpellRecord[]; bargains: Bargain[] } };
}

export type WorldMethodName = keyof WorldMethods;
export type WorldIn<M extends WorldMethodName> = WorldMethods[M]["in"];
export type WorldOut<M extends WorldMethodName> = WorldMethods[M]["out"];

/** What the world sends the familiar to wake it with a verse. */
export interface VerseWake { kind: "verse"; spellId: string; apprentice: string; apprenticeName: string; verse: string; room: "circle" | "study"; briefing: string; firstHourStep: number | null; scripted?: "moths" | "hearth" | "scry" }
export interface StudyWake { kind: "study"; apprentice: string; apprenticeName: string; text: string; briefing: string }
export interface StoryWake { kind: "story"; apprentice: string; apprenticeName: string; storyId: string; briefing: string }
export interface SpiritWake { kind: "spirit"; spirit: SpiritId | "moor"; why: string; briefing: string; utteranceId?: string; hall?: { channelId: string; with: Array<{ spirit: SpiritId; title: string; ref: string }>; topic: string } }
export interface GolemWake { kind: "golem"; golem: string; charter: string; briefing: string }
export type Wake = VerseWake | StudyWake | StoryWake | SpiritWake | GolemWake;

/** Agent worker RPC: the world calls this on the seat's targetId with a steering id for idempotent redelivery. */
export interface AgentMethods {
  receiveWake: { in: { channelId: string; wake: Wake; steeringId: string }; out: { ok: true } };
}

/** The familiar's tool names, for the bench and the panel's trajectory view. */
export const FAMILIAR_TOOLS = ["hear", "look", "snapshot", "rehearse", "cast", "cast_here", "reject", "misfire", "inscribe", "remember", "annotate", "read_notebook", "read_idiom", "promote_idiom", "glance"] as const;
export type FamiliarTool = (typeof FAMILIAR_TOOLS)[number];

/** Channel keys the panel creates and registers with `setChannel`. */
export function circleChannelKey(estateKey: string, apprentice: string): string { return `grimoire-${estateKey}-circle-${apprentice}`; }
export function studyChannelKey(estateKey: string, apprentice: string): string { return `grimoire-${estateKey}-study-${apprentice}`; }
export function spiritChannelKey(estateKey: string, spirit: SpiritId | "moor"): string { return `grimoire-${estateKey}-spirit-${spirit}`; }
export function golemChannelKey(estateKey: string, golem: string): string { return `grimoire-${estateKey}-golem-${golem.toLowerCase()}`; }
export function hallChannelKey(estateKey: string, spirits: readonly string[]): string { return `grimoire-${estateKey}-hall-${[...spirits].sort().join("-")}`; }
