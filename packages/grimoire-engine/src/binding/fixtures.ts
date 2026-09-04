/**
 * Synthetic fixtures for binding/content tests. Independent of world/ so the
 * modules can be tested while the world generator is written elsewhere.
 */
import type { Apprentice, EffectEnvelope, EstateState, Layer, Region, RegionId, Snapshot, SpellRecord, Spirit, SpiritId, Tier } from "../types.js";

const LAYERS: Layer[] = ["heat", "water", "stone", "growth", "air", "light", "rot", "ether", "steam", "silt", "ash", "frost", "spore", "silver", "glass"];

export function syntheticRegion(id: RegionId, w: number, h: number, fill: Partial<Record<Layer, number>> = {}): Region {
  const n = w * h;
  const layers = {} as Record<Layer, number[]>;
  for (const l of LAYERS) layers[l] = new Array(n).fill(fill[l] ?? 0);
  return {
    id, name: id, w, h, floors: 1,
    elevation: new Array(n).fill(0).map((_, i) => Math.floor(i / w)),
    ley: new Array(n).fill(0),
    layers,
    species: new Array(n).fill(""),
    roof: new Array(n).fill(0),
    marks: {}, adorns: {},
    sluices: [{ name: id + "-sluice", region: id, x: 0, y: 0, state: "closed", feeds: null, wardedBy: null }],
    places: { hearth: { x: 1, y: 1, name: "the hearth", trueName: "Hamanith" }, furnace: { x: 2, y: 2, name: "the furnace" }, wall: { x: 0, y: h - 1, name: "the wall" } },
    ailments: [],
    downstream: null,
    windward: [],
  };
}

export function syntheticApprentice(id = "ada"): Apprentice {
  return { id, name: "Ada", present: true, region: "garden", x: 1, y: 1, reserve: 40, reserveMax: 60, reagents: { silver: 2 }, words: ["heat", "water"], names: [], foci: [], wildWords: [], deepScriesThisBell: 0, proseInARow: 0, studyOpen: false, joinedTick: 0, lastSeenTick: 0 };
}

export function syntheticSpirit(id: SpiritId): Spirit {
  return { id, title: id, trueName: id, meaning: "", anchor: { region: "garden", x: 0, y: 0 }, wants: "", wantList: [], temper: "", hour: "", colour: "", ornament: "", knows: [], regard: {}, named: false, awake: true, reserve: 20 };
}

export function syntheticState(regions: Region[] = [syntheticRegion("garden", 8, 8, { water: 1, light: 3, growth: 1 })]): EstateState {
  const rec = {} as Record<RegionId, Region>;
  for (const r of regions) rec[r.id] = r;
  const spirits = {} as Record<SpiritId, Spirit>;
  for (const id of ["hearth", "river", "library", "foundry", "mill", "bell", "glass", "orchard", "deep", "boneyard", "ridge", "moor", "echo"] as SpiritId[]) spirits[id] = syntheticSpirit(id);
  return {
    seed: "test",
    regions: rec,
    entities: {
      Toll: { name: "Toll", kind: "golem", sub: "stone", region: regions[0]!.id, x: 3, y: 3, state: {}, carrying: {}, behaviour: null, bound: null, last: "", tired: 0 },
      "sparrow-1": { name: "sparrow-1", kind: "creature", sub: "sparrow", region: regions[0]!.id, x: 4, y: 4, state: {}, carrying: {}, behaviour: null, bound: null, last: "", tired: 0 },
    },
    sky: { tick: 100, hour: 8, day: 3, season: "spring", year: 1, moon: 4, weather: "clear", windDir: "w", windForce: 1, forecast: [], festival: null, bellTrue: false, bell: 4 },
    spirits,
    apprentices: { ada: syntheticApprentice() },
    activeSpells: [],
    moor: { pressure: 0, reserve: 10, stolenWords: [], heardWords: [], tactic: "", quiet: false, adapted: [] },
    undone: [],
    milestones: {},
    festivals: [],
    inscriptions: [],
    householdWords: [],
    estateName: null,
    wallStands: false,
    seq: 0,
    lastTick: 100,
  };
}

export function syntheticRecord(over: Partial<SpellRecord> = {}): SpellRecord {
  return {
    id: "s1", name: null, caster: "ada", coCasters: [], verse: "let the cold come down", verseNormalized: "let the cold come down", fingerprint: "fp", lines: ["let the cold come down"],
    score: { meter: 0.5, rhyme: 0, form: 0.2, sincerity: 0.8, lines: 1, verseness: 0.6 },
    resonance: { entries: [], unknown: [], names: [], earned: [], strength: 0.5 },
    tier: "cantrip", status: "heard", intent: null, writing: null, gloss: {}, margin: [], rehearsal: null, receipts: [], firings: [], misfire: null, reject: null, ancestry: [], variantOf: null, persistent: null,
    etherBudget: 30, etherSpent: 0, focus: null, createdTick: 100, castTick: null, earned: ["heat", "water", "cold"], scope: ["garden"], fromCache: false, triggeredBy: null, triggered: [], trail: [], promotedIdiom: null,
    ...over,
  };
}

export function syntheticEnvelope(over: Partial<EffectEnvelope> = {}): EffectEnvelope {
  return { cells: 48, ether: 30, regions: ["garden"], capabilities: ["adorn", "transmute", "push"], ...over };
}

export function syntheticSnapshot(over: Partial<Snapshot> = {}, tier: Tier = "cantrip"): Snapshot {
  const state = syntheticState();
  const record = syntheticRecord({ tier });
  return {
    spellId: record.id,
    record: { id: record.id, caster: record.caster, tier, earned: record.earned, scope: record.scope, etherBudget: record.etherBudget, coCasters: [] },
    regions: Object.values(state.regions),
    entities: Object.values(state.entities),
    sky: state.sky,
    caster: { id: "ada", name: "Ada", reserve: 40, reserveMax: 60, reagents: {}, words: ["heat"], names: [], foci: [], region: "garden", x: 1, y: 1, active: [] },
    workings: {},
    utterances: [],
    memory: {},
    envelope: syntheticEnvelope(),
    fork: false,
    ...over,
  };
}

/** The everything-allowed envelope for exercising content sources. */
export function fullEnvelope(regions: RegionId[]): EffectEnvelope {
  return { cells: 65536, ether: 100000, regions, capabilities: ["adorn", "transmute", "push", "spawn", "move", "transfer", "mark", "sluice", "craft", "ward", "time", "voice", "bind", "against", "scry-deep", "estate"] };
}
