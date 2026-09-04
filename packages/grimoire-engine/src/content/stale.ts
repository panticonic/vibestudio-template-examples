import type { RegionId, Trigger } from "../types.js";

export interface StaleWorking {
  id: string;
  name: string;
  author: string;
  region: RegionId;
  tier: "ward" | "automaton" | "charter";
  trigger: Trigger;
  source: string;
  verse: string;
  margin: string[];
  why: string;
  golem?: string;
  /** Released records are kept for scrying but not active. */
  released?: boolean;
}

/**
 * The palimpsest: workings older masters left running. Sources are real
 * writing against the binding, legible on purpose, because the player reads
 * them to understand what is wrong.
 */
export const STALE_WORKINGS: StaleWorking[] = [
  {
    id: "stale:ilvane-sluice",
    name: "Ilvane's sluice ward",
    author: "Ilvane",
    region: "orchard",
    tier: "ward",
    trigger: { kind: "sky", event: "dawn" },
    verse: "Hesk dor-nith, sol vel ath Saelolath\n(whenever the stone is here, open the water beyond, to the Orchard)",
    source: `// Ilvane's sluice ward. Old form, carried by the familiar in the founding year.
// "Whenever the wall stands, open the sluice to the orchard."
const wall = read.places("near-moor").wall;          // the cell where the wall was spoken
const there = read.cell("near-moor", wall.x, wall.y);
// She tested for stone. There is stone at the wall: there is stone everywhere she built.
// She meant standing. The wall fell nine hundred years ago; the rubble is still stone.
if (there.stone > 0) {
  effect.sluice("orchard-sluice", "open");            // and so, every dawn, the orchard drowns a little more
  effect.mark({ region: "orchard", x: 0, y: 10 }, "ward:ilvane", "#4a7fa5");
}`,
    margin: ["the first ward on the estate", "patched by six hands; none dared release it", "— she tested for stone, not for standing. Everyone does, once."],
    why: "The predicate is `stone > 0`. Rubble is stone. The ward has been true every dawn since the wall fell.",
  },
  {
    id: "stale:corwen-heat",
    name: "Corwen's forcing heat",
    author: "Corwen",
    region: "hot-house",
    tier: "ward",
    trigger: { kind: "sky", event: "dawn" },
    verse: "At dawn, hama to the forcing beds,\nbral, until the glass sweats",
    source: `// The forcing heat. Two hundred years old and argued with ever since.
// Every dawn: bring the beds up to a warm 4, whatever else is happening.
const beds = read.places("hot-house").beds;
for (const c of read.neighbours({ region: "hot-house", x: beds.x, y: beds.y }, 3)) {
  if (c.heat < 4) effect.transmute(c, { heat: 4 - c.heat });
}
effect.mark({ region: "hot-house", x: beds.x, y: beds.y }, "ward:corwen-heat", "#c8401f");`,
    margin: ["correct, alone", "Marren's quench fights it every dawn", "Wren is between them"],
    why: "Correct on its own. Marren's quench (below) is also correct. Together, every dawn, they fight, and Wren carries water for both.",
  },
  {
    id: "stale:marren-quench",
    name: "Marren's cutting quench",
    author: "Marren",
    region: "hot-house",
    tier: "ward",
    trigger: { kind: "sky", event: "dawn" },
    verse: "At dawn, ithe to the beds where the cuttings are,\nthes, so the moonbloom does not wake",
    source: `// Marren kept moonbloom cuttings in the forcing beds one winter, a hundred years after Corwen.
// Moonbloom must not be warm at dawn. So: every dawn, the beds go down to 1.
const beds = read.places("hot-house").beds;
for (const c of read.neighbours({ region: "hot-house", x: beds.x, y: beds.y }, 3)) {
  if (c.heat > 1) effect.transmute(c, { heat: 1 - c.heat });
}
effect.mark({ region: "hot-house", x: beds.x + 1, y: beds.y }, "ward:marren-quench", "#7fb2c9");`,
    margin: ["the cuttings died a century ago", "the ward did not"],
    why: "The cuttings it protected have been gone a hundred years. The ward fires anyway, against Corwen's heat, every dawn.",
  },
  {
    id: "stale:toll-charter",
    name: "Toll's hauling",
    author: "the eleventh master",
    region: "mine-upper",
    tier: "automaton",
    golem: "Toll",
    trigger: { kind: "sky", event: "tick" },
    verse: "Toll, dor-bearer, haul to the east tower road\nuntil the tower stands",
    source: `// Toll's body, each tick. Haul stone from the adit to the tower road until the tower stands.
const s = read.senses();
if (!s) return;
const places = read.places("mine-upper");
const tower = places["east-tower-road"];
const adit = places.adit;
const carrying = (s.carrying.silver || 0) + (s.self.state.stone || 0);
// The tower will never stand. Nobody told the charter.
const towerStands = false;
if (towerStands) return;
if (!carrying && s.self.x === adit.x && s.self.y === adit.y) { bind.act("Toll", { kind: "carry" }); return; }
const target = carrying ? tower : adit;
const dx = target.x - s.self.x, dy = target.y - s.self.y;
if (dx === 0 && dy === 0) { bind.act("Toll", { kind: "place" }); return; }
bind.act("Toll", { kind: "move", dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : (dy > 0 ? "s" : "n") });`,
    margin: ["three hundred years", "it is not stupid; it is obedient"],
    why: "`until the tower stands` was rendered as a constant. The tower fell before the charter was finished.",
  },
  {
    id: "stale:warden-guard",
    name: "The Warden's watch",
    author: "Ysolde Marrow",
    region: "observatory",
    tier: "ward",
    trigger: { kind: "entity", name: "Warden", event: "arrives" },
    verse: "Warden, hold the door until every spirit consents,\nand the moon is whole, and the house is here",
    source: `// Her last complete spell. The Warden keeps the observatory door.
// The door opens only when every spirit's want is met and the moon is full and the household is present.
const sky = read.sky();
const consents = read.memory.consents || {};         // the world fills this from the spirits' want lists
const all = ["hearth","river","library","foundry","mill","bell","glass","orchard","deep","boneyard","ridge","moor"];
const everyone = all.every((id) => consents[id] === true);
const moonWhole = sky.moon === 4;
if (everyone && moonWhole) {
  bind.act("Warden", { kind: "speak", line: "They consent. Come in." });
  effect.sluice("observatory-door", "open");
} else {
  const missing = all.filter((id) => consents[id] !== true);
  bind.act("Warden", { kind: "speak", line: "Not yet. " + missing.length + " have not said so." });
}`,
    margin: ["complete", "it will not open", "— it is not what names are for. It is exactly what names are for."],
    why: "Not wrong. Locked from inside on a condition that needs the whole household and the Moor.",
  },
  {
    id: "stale:sealed-gallery",
    name: "The seal on the gallery",
    author: "unknown",
    region: "mine-deep",
    tier: "ward",
    trigger: { kind: "cell", region: "mine-deep", predicate: "cell.stone < 6", rect: { x: 14, y: 10, w: 5, h: 5 } },
    verse: "(no verse is recorded; the writing has no hand)",
    source: `// No author. No verse. The seal restores itself.
const t = read.trigger();
if (!t) return;
const p = t.payload;
if (p && typeof p.x === "number") effect.transmute({ region: "mine-deep", x: p.x, y: p.y }, { stone: 6, light: -6 });`,
    margin: ["no hand", "the Deep does not know who"],
    why: "Nobody knows. The Deep is frightened of it.",
  },
  {
    id: "stale:corwen-nine",
    name: "Corwen's charter for the nine",
    author: "Corwen",
    region: "mine-deep",
    tier: "charter",
    golem: "Corwen-Bone",
    trigger: { kind: "sky", event: "midnight" },
    verse: "(bound shut with a word the Boneyard holds)",
    source: `// Corwen's charter. Four hundred years long. Read it only with the Boneyard's names.
// · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
// · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
// walk. carry. do not stop. do not answer. do not rest. do not
// · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
const s = read.senses();
if (!s) return;
bind.act(s.self.name, { kind: "move", dir: ["n","e","s","w"][read.sky().tick % 4] });`,
    margin: ["unread", "the darkest hour of the campaign"],
    why: "It has no end condition and no consent. Release needs the Boneyard's names and the council's seal. Release is always free.",
  },
  {
    id: "stale:night-house",
    name: "The night house harvest",
    author: "Ysolde Marrow",
    region: "night-house",
    tier: "ward",
    trigger: { kind: "sky", event: "full-moon" },
    released: true,
    verse: "Moonbloom, open under the whole moon, lunae,\nand give what you keep to the dark house",
    source: `// Released by the master in her last winter. Kept for the record.
for (const c of read.region("night-house")) {
  if (c.species === "moonbloom" && c.growth >= 2) effect.transmute(c, { ether: 2, light: 1 });
}
effect.craft("moon-ether", "moonbed", 1);`,
    margin: ["released by her own hand", "— the moon was wrong. I went anyway."],
    why: "Released on purpose. She said why to the familiar, not to the notebook.",
  },
];
