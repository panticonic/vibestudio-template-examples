import type { EstateState, RegionId, Season, SpellRecord, UndoneItem } from "../types.js";

/** Ysolde's letter. Short, affectionate, unhelpful. The first thing the player reads. */
export const LETTER = `You will have found the key under the third stone, which means you can read, which means you are the one I meant.

I never met you. I chose you from a list of names the Library gave me, on a night when the moon was wrong for anything else, and I chose you because your name had two open vowels in it and the familiar did not object. That is more than most masters get.

The estate is running. Nobody has turned it off. Some of what runs is mine and some is older and some of it I never understood, and I would rather you read it than trusted it.

The hearth will light for you. Start there. The familiar will give you the words it gives everyone; treat them as a loan. Go to the garden second. Do not go to the observatory until the spirits tell you to. They will not tell you for a long time.

Be literal with the River. Be kind to the Hearth; it is kinder than it needs to be. The Foundry is not your friend and will say that it is. Wren is tired.

I did not finish. Below is what is undone, in the order I would do it, which is not the order you will.

— Y.`;

export interface UndoneSeed { id: string; text: string; region: RegionId | null; milestone: string | null }

export const UNDONE_SEED: UndoneSeed[] = [
  { id: "u-orchard", text: "the orchard — Ilvane's sluice, still. read it before you touch it", region: "orchard", milestone: "orchard-sluice" },
  { id: "u-hot-house", text: "the hot house quarrel — Wren is tired", region: "hot-house", milestone: "hot-house-quarrel" },
  { id: "u-wheel", text: "the wheel. ask Velharan. be literal with her", region: "mill", milestone: "wheel" },
  { id: "u-library", text: "the library — dry, not drained. the books", region: "library", milestone: "library" },
  { id: "u-bell", text: "the bell (silver? glass will do for a season)", region: "bell-tower", milestone: "bell" },
  { id: "u-night-house", text: "the night house — I released it. do not ask yet", region: "night-house", milestone: "night-house" },
  { id: "u-deep", text: "the deep — no", region: "mine-deep", milestone: "deep" },
  { id: "u-cairns", text: "the cairns", region: "ridge", milestone: "cairns" },
  { id: "u-name", text: "the name", region: "observatory", milestone: "name" },
];

export function initialUndone(tick: number): UndoneItem[] {
  return UNDONE_SEED.map((u) => ({ id: u.id, text: u.text, hand: "ysolde", done: false, notes: [], region: u.region, milestone: u.milestone, addedTick: tick, doneTick: null }));
}

// ───────────────────────────────────────────────────────────────────────────
// Milestones: the campaign's 29 workings, checked against world state
// ───────────────────────────────────────────────────────────────────────────

export interface Milestone { id: string; title: string; year: number; season: Season; region: RegionId; teaches: string[]; reward: string; check: (state: EstateState, spells: SpellRecord[]) => boolean }

function frac(state: EstateState, id: RegionId, pred: (i: number, r: EstateState["regions"][RegionId]) => boolean): number {
  const r = state.regions?.[id];
  if (!r) return 0;
  const n = r.w * r.h;
  let k = 0;
  for (let i = 0; i < n; i++) if (pred(i, r)) k++;
  return n ? k / n : 0;
}
function activeIn(spells: SpellRecord[], id: RegionId, kinds?: string[]): SpellRecord[] {
  return spells.filter((s) => s.status === "cast" && s.persistent?.active && s.scope?.includes(id) && (!kinds || kinds.includes(s.persistent.kind)));
}
function entity(state: EstateState, name: string) { return state.entities?.[name] ?? null; }
function spirit(state: EstateState, id: keyof EstateState["spirits"]) { return state.spirits?.[id] ?? null; }
function placeCell(state: EstateState, id: RegionId, place: string) {
  const r = state.regions?.[id]; const p = r?.places?.[place];
  if (!r || !p) return null;
  const i = p.y * r.w + p.x;
  return { r, i };
}

export const MILESTONES: Milestone[] = [
  { id: "garden", title: "The kitchen garden", year: 1, season: "spring", region: "garden", teaches: ["ward", "whenever"], reward: "hara, hesk; the first charm", check: (s, sp) => frac(s, "garden", (i, r) => r.layers.growth[i]! >= 2) > 0.35 && activeIn(sp, "garden", ["ward"]).length > 0 },
  { id: "orchard-sluice", title: "The orchard flood", year: 1, season: "spring", region: "orchard", teaches: ["release", "while"], reward: "the Orchard speaks; sapa; Ysolde's echo", check: (s, sp) => !sp.some((x) => x.id === "stale:ilvane-sluice" && x.persistent?.active) && frac(s, "orchard", (i, r) => r.layers.water[i]! >= 2) < 0.25 },
  { id: "hot-house-quarrel", title: "The greenhouse quarrel", year: 1, season: "spring", region: "hot-house", teaches: ["charter"], reward: "Wren's charter; the news; First Sap", check: (s, sp) => activeIn(sp, "hot-house", ["ward"]).filter((x) => x.id.startsWith("stale:")).length <= 1 && entity(s, "Wren")?.bound?.mode !== "stale" },
  { id: "wheel", title: "The silted mill", year: 1, season: "summer", region: "mill", teaches: ["push", "silt", "voice"], reward: "the wheel turns; the Mill speaks; power", check: (s) => { const p = placeCell(s, "mill", "wheel"); return !!p && p.r.layers.silt[p.i]! <= 1 && p.r.layers.water[p.i]! >= 2; } },
  { id: "weir", title: "The weir", year: 1, season: "summer", region: "upper-reach", teaches: ["working", "checkpoint"], reward: "sluices obey; the River's gratitude", check: (_s, sp) => sp.some((x) => x.tier === "working" && x.status === "cast" && x.scope?.includes("upper-reach")) },
  { id: "library", title: "The sunken library", year: 1, season: "summer", region: "library", teaches: ["cost", "dry"], reward: "the Library wakes; the index", check: (s) => frac(s, "library", (i, r) => r.layers.water[i]! > 0) < 0.1 },
  { id: "midsummer", title: "Midsummer", year: 1, season: "summer", region: "green", teaches: ["adorn"], reward: "the Glass judges from the rubble", check: (s) => (s.festivals ?? []).some((f) => f.id === "midsummer" && f.verdict) },
  { id: "foundry", title: "The cold foundry", year: 1, season: "autumn", region: "foundry", teaches: ["compound ward", "council"], reward: "ash, salt; the Foundry speaks", check: (s) => { const p = placeCell(s, "foundry", "furnace"); return !!p && p.r.layers.heat[p.i]! >= 5; } },
  { id: "first-autumn", title: "First autumn", year: 1, season: "autumn", region: "grate", teaches: ["scry the Moor"], reward: "the wall holds or does not", check: (s) => (s.sky?.year ?? 1) >= 1 && s.sky?.season === "winter" || (s.sky?.year ?? 1) > 1 },
  { id: "bell", title: "The bell", year: 1, season: "autumn", region: "bell-tower", teaches: ["glass", "mend"], reward: "true time; First Frost rung", check: (s) => s.sky?.bellTrue === true },
  { id: "frost", title: "Frost", year: 1, season: "winter", region: "cold-house", teaches: ["light", "freeze"], reward: "the cold house keeps", check: (s) => s.sky?.season === "winter" && frac(s, "cold-house", (i, r) => r.layers.frost[i]! > 0) < 0.15 && frac(s, "cold-house", (i, r) => r.layers.light[i]! >= 2) > 0.5 },
  { id: "night-house", title: "The night house", year: 1, season: "winter", region: "night-house", teaches: ["until-moon", "moon-ether"], reward: "moon-ether; a reason withheld", check: (s) => frac(s, "night-house", (i, r) => r.species[i] === "moonbloom" && r.layers.growth[i]! >= 2) > 0.1 },
  { id: "notebooks", title: "The notebooks", year: 1, season: "winter", region: "library", teaches: ["reading"], reward: "the Long Dark; the observatory named", check: (s) => spirit(s, "library")?.awake === true && (s.sky?.year ?? 1) >= 2 },
  { id: "galleries", title: "The upper galleries", year: 2, season: "spring", region: "mine-upper", teaches: ["automaton", "many bodies"], reward: "silver reaches the foundry", check: (s, sp) => entity(s, "Toll")?.bound?.mode !== "stale" && activeIn(sp, "mine-upper", ["automaton", "charter"]).length >= 3 },
  { id: "reeds", title: "Sedge and the reeds", year: 2, season: "spring", region: "lower-reach", teaches: ["ecology"], reward: "the grate kept by reeds", check: (s) => entity(s, "Sedge")?.bound !== null && frac(s, "lower-reach", (i, r) => r.species[i] === "reed") > 0.15 },
  { id: "glassworks", title: "The glassworks' roof", year: 2, season: "spring", region: "glassworks", teaches: ["mend", "foci"], reward: "the Glass speaks; foci possible", check: (s) => frac(s, "glassworks", (i, r) => r.roof[i] === 1) > 0.8 },
  { id: "staff", title: "The staff", year: 2, season: "summer", region: "glassworks", teaches: ["focus"], reward: "wards over the whole estate", check: (s) => Object.values(s.apprentices ?? {}).some((a) => a.foci?.some((f) => !f.broken && f.regions === "estate")) },
  { id: "scriptorium", title: "The scriptorium", year: 2, season: "summer", region: "scriptorium", teaches: ["runes"], reward: "writing in the old way", check: (_s, sp) => sp.some((x) => x.ancestry?.some((a) => a.startsWith("rune:"))) },
  { id: "moors-ear", title: "A word of yours", year: 2, season: "summer", region: "near-moor", teaches: ["register"], reward: "the Moor's ear", check: (s) => (s.moor?.heardWords?.length ?? 0) > 0 },
  { id: "sealed-gallery", title: "The sealed gallery", year: 2, season: "autumn", region: "mine-deep", teaches: ["scry-deep"], reward: "the Deep's fear", check: (s) => spirit(s, "deep")?.named === true },
  { id: "corwens-nine", title: "Corwen's nine", year: 2, season: "autumn", region: "mine-deep", teaches: ["ethics of binding"], reward: "release is always free", check: (s) => ["Corwen-1", "Corwen-2", "Corwen-3", "Corwen-4", "Corwen-5", "Corwen-6", "Corwen-7", "Corwen-8", "Corwen-Bone"].every((n) => entity(s, n)?.bound?.mode !== "stale") },
  { id: "moor-bargains", title: "The Moor bargains", year: 2, season: "autumn", region: "near-moor", teaches: ["bargain"], reward: "a name for a name", check: (s) => (s.moor?.stolenWords?.length ?? 0) > 0 && (s.moor?.adapted?.length ?? 0) > 0 },
  { id: "cairns", title: "The cairns", year: 2, season: "winter", region: "ridge", teaches: ["working", "weather"], reward: "ether stops leaking", check: (s) => [1, 2, 3, 4, 5].every((k) => { const p = placeCell(s, "ridge", `cairn-${k}`); return !!p && p.r.layers.stone[p.i]! >= 6; }) },
  { id: "third-line", title: "The third line", year: 2, season: "winter", region: "ridge", teaches: ["ley"], reward: "the lines cross at the observatory", check: (s) => { const p = placeCell(s, "observatory", "lens-mount"); return !!p && p.r.layers.ether[p.i]! >= 5; } },
  { id: "warden", title: "The Warden", year: 3, season: "spring", region: "observatory", teaches: ["counter-working"], reward: "the door will speak", check: (s) => entity(s, "Warden")?.bound?.mode !== "stale" },
  { id: "consent", title: "Every spirit's consent", year: 3, season: "spring", region: "chapel", teaches: ["council"], reward: "seals", check: (s) => (["hearth", "river", "library", "foundry", "mill", "bell", "glass", "orchard", "deep", "boneyard", "ridge"] as const).every((id) => spirit(s, id)?.wantList?.every((w) => w.met)) },
  { id: "familiars-name", title: "The familiar's name", year: 3, season: "summer", region: "manor", teaches: ["name"], reward: "what happened at the observatory", check: (s) => Object.values(s.apprentices ?? {}).some((a) => a.names?.includes("Aenithil")) },
  { id: "lenses", title: "The lenses", year: 3, season: "summer", region: "observatory", teaches: ["ritual"], reward: "the observatory sees", check: (_s, sp) => sp.some((x) => x.tier === "ritual" && x.status === "cast" && x.scope?.includes("observatory")) },
  { id: "name", title: "The name", year: 3, season: "autumn", region: "observatory", teaches: ["estate"], reward: "the widening", check: (s) => !!s.estateName },
];

export function evaluateMilestones(state: EstateState, spells: SpellRecord[]): Array<{ id: string; done: boolean }> {
  return MILESTONES.map((m) => {
    let done = false;
    try { done = !!m.check(state, spells); } catch { done = false; }
    return { id: m.id, done };
  });
}
