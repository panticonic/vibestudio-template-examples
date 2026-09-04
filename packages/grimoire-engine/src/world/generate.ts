/**
 * World generation. Deterministic from the seed. Every region starts in the
 * state the design's "starts as" column gives it (§8.1), so the map is drawn
 * wrong where the estate is wrong from the first tick.
 */
import type { Dir, Entity, EstateState, Region, RegionId, SpeciesId, SluiceState, CreatureKind } from "../types.js";
import { GOLEM_CATALOG, staleGolemSource } from "./golems.js";
import { REGION_ORDER, emptyRegion, idx, inBounds } from "./regions.js";
import { makeRng, type Rng } from "./rng.js";
import { initialSky } from "./sky.js";
import { SPIRIT_SEED } from "./spirits-seed.js";
import { computeAilments } from "./physics.js";

type Rect = { x: number; y: number; w: number; h: number };
const all = (r: Region): Rect => ({ x: 0, y: 0, w: r.w, h: r.h });

function eachCell(r: Region, rect: Rect, f: (i: number, x: number, y: number) => void): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (inBounds(r, x, y)) f(idx(r, x, y), x, y);
}

function fill(r: Region, layer: keyof Region["layers"], value: number, rect: Rect = all(r)): void {
  eachCell(r, rect, (i) => { r.layers[layer][i] = value; });
}

function scatter(r: Region, layer: keyof Region["layers"], value: number, density: number, rng: Rng, rect: Rect = all(r)): void {
  eachCell(r, rect, (i) => { if (rng.next() < density) r.layers[layer][i] = value; });
}

function plant(r: Region, species: SpeciesId, growth: number, density: number, rng: Rng, rect: Rect = all(r), every?: number): void {
  eachCell(r, rect, (i, x, y) => {
    if (every ? (x % every === 1 && y % every === 1) : rng.next() < density) {
      r.species[i] = species;
      r.layers.growth[i] = growth;
    }
  });
}

function roof(r: Region, value: 0 | 1, rect: Rect = all(r)): void {
  eachCell(r, rect, (i) => { r.roof[i] = value; });
}

function walls(r: Region, thickness = 1, stone = 8): void {
  eachCell(r, all(r), (i, x, y) => {
    if (x < thickness || y < thickness || x >= r.w - thickness || y >= r.h - thickness) r.layers.stone[i] = stone;
  });
}

/** Elevation sloping toward the outflow edge with a little noise. */
function slope(r: Region, toward: Dir | null, base: number, drop: number, rng: Rng): void {
  eachCell(r, all(r), (i, x, y) => {
    let t = 0;
    if (toward === "s") t = y / Math.max(1, r.h - 1);
    if (toward === "n") t = 1 - y / Math.max(1, r.h - 1);
    if (toward === "e") t = x / Math.max(1, r.w - 1);
    if (toward === "w") t = 1 - x / Math.max(1, r.w - 1);
    r.elevation[i] = Math.round(base - t * drop + (rng.next() - 0.5) * 1.2);
  });
}

/** A basin: lowest at (cx, cy), rising toward the edges. Water pools instead of leaving. */
function bowl(r: Region, cx: number, cy: number, base: number, depth: number, rng: Rng): void {
  const maxD = Math.max(1, Math.hypot(Math.max(cx, r.w - 1 - cx), Math.max(cy, r.h - 1 - cy)));
  eachCell(r, all(r), (i, x, y) => {
    const t = Math.min(1, Math.hypot(x - cx, y - cy) / maxD);
    r.elevation[i] = Math.round(base - depth * (1 - t) + (rng.next() - 0.5) * 0.8);
  });
}

function place(r: Region, id: string, x: number, y: number, name: string, trueName?: string): void {
  r.places[id] = trueName ? { x, y, name, trueName } : { x, y, name };
}

function sluice(r: Region, name: string, x: number, y: number, state: SluiceState, feeds: RegionId | null, wardedBy: string | null = null): void {
  r.sluices.push({ name, region: r.id, x, y, state, feeds, wardedBy });
}

function leyH(r: Region, y: number, ether = 3): void { eachCell(r, { x: 0, y, w: r.w, h: 1 }, (i) => { r.ley[i] = 1; r.layers.ether[i] = Math.max(r.layers.ether[i]!, ether); }); }
function leyV(r: Region, x: number, ether = 3): void { eachCell(r, { x, y: 0, w: 1, h: r.h }, (i) => { r.ley[i] = 1; r.layers.ether[i] = Math.max(r.layers.ether[i]!, ether); }); }

function creature(state: EstateState, sub: CreatureKind, region: RegionId, x: number, y: number): Entity {
  const name = `${sub}-${state.seq++}`;
  const e: Entity = { name, kind: "creature", sub, region, x, y, state: sub === "vermin" ? { fed: 0 } : { hunger: 0 }, carrying: {}, behaviour: null, bound: null, last: "", tired: 0 };
  state.entities[name] = e;
  return e;
}

function creaturesIn(state: EstateState, sub: CreatureKind, region: Region, n: number, rng: Rng, ok: (i: number) => boolean = () => true): void {
  let placed = 0;
  let guard = 0;
  while (placed < n && guard++ < 500) {
    const x = rng.int(region.w);
    const y = rng.int(region.h);
    const i = idx(region, x, y);
    if (region.layers.stone[i]! >= 6 || !ok(i)) continue;
    creature(state, sub, region.id, x, y);
    placed++;
  }
}

export function generateEstate(seed: string): EstateState {
  const rng = makeRng(seed);
  const regions = {} as Record<RegionId, Region>;
  for (const id of REGION_ORDER) regions[id] = emptyRegion(id);
  const state: EstateState = {
    seed,
    regions,
    entities: {},
    sky: initialSky(),
    spirits: JSON.parse(JSON.stringify(SPIRIT_SEED)) as EstateState["spirits"],
    apprentices: {},
    activeSpells: [],
    moor: { pressure: 1, reserve: 10, stolenWords: [], heardWords: [], tactic: "spore", quiet: false, adapted: [] },
    undone: [],
    milestones: {},
    festivals: [],
    inscriptions: [],
    householdWords: [],
    estateName: null,
    wallStands: false,
    seq: 1,
    lastTick: 0,
  };
  const R = (id: RegionId) => regions[id];
  const r = (label: string) => rng.fork(label);

  // ── manor & hearth: intact, cold; ether densest; lights on the first verse ──
  {
    const m = R("manor");
    slope(m, null, 10, 0, r("manor"));
    roof(m, 1);
    walls(m);
    leyH(m, 8, 3);
    leyV(m, 12, 3);
    m.layers.ether[idx(m, 12, 8)] = 6;
    fill(m, "light", 1);
    place(m, "hearth", 12, 8, "the hearth", "Hamanith");
    place(m, "circle", 7, 8, "the circle");
    place(m, "study", 18, 4, "the study");
    place(m, "kitchen", 5, 12, "the kitchen");
    creaturesIn(state, "moth", m, 2, r("manor-moths"));
  }
  // ── kitchen garden: overgrown, vermin visibly moving ──
  {
    const g = R("garden");
    slope(g, "s", 9, 2, r("garden"));
    fill(g, "water", 1);
    plant(g, "grass", 3, 0.85, r("garden-grass"));
    plant(g, "firethorn", 2, 0.06, r("garden-thorn"));
    fill(g, "light", 2);
    place(g, "herb-beds", 8, 4, "the herb beds");
    place(g, "well", 3, 13, "the well");
    creaturesIn(state, "vermin", g, 8, r("garden-vermin"));
    creaturesIn(state, "sparrow", g, 3, r("garden-sparrows"));
  }
  // ── scriptorium: locked by a word ──
  {
    const s = R("scriptorium");
    slope(s, null, 10, 0, r("scriptorium"));
    roof(s, 1);
    walls(s);
    place(s, "desk", 6, 4, "the master's desk");
    place(s, "door", 0, 4, "the scriptorium door");
    s.marks[String(idx(s, 0, 4))] = { sigil: "ward:scriptorium-lock", glow: "#6d5a8e", by: "Ysolde", spellId: "stale:scriptorium-lock" };
  }
  // ── sunken library: flooded to the second floor; the books need dark ──
  {
    const l = R("library");
    slope(l, "s", 6, 4, r("library"));
    roof(l, 1);
    walls(l);
    fill(l, "water", 2, { x: 1, y: 8, w: l.w - 2, h: 8 });
    fill(l, "water", 4, { x: 1, y: 16, w: l.w - 2, h: 7 });
    scatter(l, "rot", 1, 0.15, r("library-rot"), { x: 1, y: 8, w: l.w - 2, h: 15 });
    place(l, "stacks", 16, 12, "the stacks", "Thesaurin");
    place(l, "reading-room", 16, 3, "the reading room");
    place(l, "stair", 2, 8, "the stair");
    plant(l, "lichen", 1, 0.1, r("library-lichen"), { x: 1, y: 16, w: l.w - 2, h: 7 });
  }
  // ── chapel of names: intact; door answers to household verse ──
  {
    const c = R("chapel");
    slope(c, null, 10, 0, r("chapel"));
    roof(c, 1);
    walls(c);
    leyV(c, 6, 4);
    fill(c, "light", 1);
    place(c, "walls", 6, 1, "the walls of names");
    place(c, "shelf", 2, 6, "the household shelf");
    place(c, "door", 6, 11, "the chapel door");
  }
  // ── orchard: drowning under Ilvane's ward ──
  {
    const o = R("orchard");
    bowl(o, 20, 28, 9, 4, r("orchard"));
    place(o, "outflow", 20, 31, "the orchard drain");
    plant(o, "apple", 4, 0, r("orchard-apples"), all(o), 3);
    plant(o, "grass", 1, 0.5, r("orchard-grass"));
    fill(o, "water", 1);
    fill(o, "water", 3, { x: 0, y: 14, w: o.w, h: o.h - 14 });
    fill(o, "water", 4, { x: 4, y: 22, w: o.w - 8, h: 8 });
    scatter(o, "rot", 1, 0.08, r("orchard-rot"), { x: 0, y: 20, w: o.w, h: 12 });
    fill(o, "light", 3);
    place(o, "oldest-apple", 20, 16, "the oldest apple", "Saelolath");
    place(o, "sluice-house", 0, 10, "Ilvane's sluice");
    sluice(o, "orchard-sluice", 0, 10, "open", "orchard", "stale:ilvane-sluice");
    o.marks[String(idx(o, 0, 10))] = { sigil: "ward:ilvane-sluice", glow: "#3f7f9f", by: "Ilvane", spellId: "stale:ilvane-sluice" };
    creaturesIn(state, "sparrow", o, 4, r("orchard-sparrows"));
  }
  // ── cold house: glass broken, rot in corners ──
  {
    const c = R("cold-house");
    slope(c, "s", 9, 1, r("cold-house"));
    roof(c, 1);
    walls(c);
    roof(c, 0, { x: 5, y: 3, w: 6, h: 3 }); // broken glass: open sky
    fill(c, "heat", -1);
    fill(c, "water", 1);
    plant(c, "grass", 1, 0.4, r("cold-grass"));
    for (const [x, y] of [[1, 1], [c.w - 2, 1], [1, c.h - 2], [c.w - 2, c.h - 2]] as const) c.layers.rot[idx(c, x, y)] = 2;
    sluice(c, "cold-sluice", 0, 6, "closed", "cold-house");
    place(c, "stores", 12, 8, "the winter stores");
  }
  // ── hot house: two wards fighting every dawn; Wren between them ──
  {
    const h = R("hot-house");
    slope(h, "s", 9, 1, r("hot-house"));
    roof(h, 1);
    walls(h);
    fill(h, "heat", 3);
    fill(h, "water", 2);
    fill(h, "light", 2);
    plant(h, "grass", 2, 0.7, r("hot-grass"));
    sluice(h, "hot-sluice", 0, 6, "half", "hot-house");
    h.marks[String(idx(h, 3, 3))] = { sigil: "ward:hot-heat", glow: "#c8412b", by: "Ysolde", spellId: "stale:hot-heat" };
    h.marks[String(idx(h, 12, 8))] = { sigil: "ward:hot-cool", glow: "#3f7f9f", by: "Ysolde", spellId: "stale:hot-cool" };
    place(h, "beds", 8, 6, "the forcing beds");
  }
  // ── night house: dark; ward released by the master ──
  {
    const n = R("night-house");
    slope(n, "s", 9, 1, r("night-house"));
    roof(n, 1);
    walls(n);
    fill(n, "light", 0);
    fill(n, "water", 1);
    plant(n, "moonbloom", 1, 0, r("night-bloom"), all(n), 3);
    place(n, "moonbed", 8, 6, "the moonbed");
  }
  // ── upper reach & weir: weir stuck half-open ──
  {
    const u = R("upper-reach");
    slope(u, "e", 14, 6, r("upper-reach"));
    eachCell(u, all(u), (i, _x, y) => { if (y < 3 || y > 8) u.layers.stone[i] = 3; });
    fill(u, "water", 4, { x: 0, y: 4, w: u.w, h: 4 });
    fill(u, "water", 2, { x: 0, y: 3, w: u.w, h: 1 });
    fill(u, "water", 2, { x: 0, y: 8, w: u.w, h: 1 });
    leyH(u, 6, 3);
    fill(u, "light", 4);
    // The weir: a stone bar across the channel with a half-open gate.
    eachCell(u, { x: 24, y: 3, w: 1, h: 6 }, (i, _x, y) => { u.layers.stone[i] = y === 6 ? 2 : 7; });
    place(u, "weir", 24, 6, "the weir", "Velharan");
    place(u, "entry", 0, 6, "where the river enters");
    plant(u, "reed", 2, 0.3, r("upper-reeds"), { x: 0, y: 3, w: u.w, h: 1 });
    plant(u, "reed", 2, 0.3, r("upper-reeds-2"), { x: 0, y: 8, w: u.w, h: 1 });
  }
  // ── mill: wheel drawn still, sluice silted ──
  {
    const m = R("mill");
    slope(m, "s", 8, 4, r("mill"));
    roof(m, 1, { x: 12, y: 4, w: 7, h: 8 });
    eachCell(m, all(m), (i, x) => { if (x < 7 || x > 11) m.layers.stone[i] = 2; });
    fill(m, "water", 3, { x: 8, y: 0, w: 4, h: m.h });
    fill(m, "silt", 3, { x: 8, y: 0, w: 4, h: 6 });
    leyV(m, 10, 3);
    fill(m, "light", 3);
    sluice(m, "mill-sluice", 10, 2, "half", "mill");
    place(m, "wheel", 10, 8, "the wheel", "Doranvel");
    place(m, "millhouse", 15, 8, "the millhouse");
  }
  // ── lower reach & marsh: rot spreading from the grate ──
  {
    const l = R("lower-reach");
    slope(l, "e", 4, 2, r("lower-reach"));
    fill(l, "water", 2);
    fill(l, "water", 1, { x: 0, y: 0, w: l.w, h: 3 });
    fill(l, "silt", 1);
    plant(l, "reed", 2, 0.35, r("marsh-reeds"));
    plant(l, "grass", 1, 0.2, r("marsh-grass"), { x: 0, y: 0, w: l.w, h: 4 });
    scatter(l, "rot", 2, 0.5, r("marsh-rot"), { x: 40, y: 6, w: 8, h: 14 });
    scatter(l, "rot", 1, 0.2, r("marsh-rot-2"), { x: 30, y: 4, w: 10, h: 16 });
    leyH(l, 12, 2);
    fill(l, "light", 3);
    sluice(l, "library-sluice", 8, 20, "closed", "library");
    place(l, "reed-bed", 30, 16, "the reed bed");
    place(l, "outflow", 47, 12, "the outflow to the grate");
    creaturesIn(state, "silt-worm", l, 4, r("marsh-worms"));
  }
  // ── the grate: bars corroded ──
  {
    const g = R("grate");
    slope(g, "s", 2, 1, r("grate"));
    fill(g, "water", 3);
    fill(g, "rot", 3);
    eachCell(g, { x: 0, y: 3, w: g.w, h: 1 }, (i, x) => { g.layers.stone[i] = x % 2 === 0 ? 3 : 0; });
    fill(g, "light", 1);
    place(g, "grate", 3, 3, "the grate");
  }
  // ── mine: upper galleries: Toll hauling to nowhere ──
  {
    const m = R("mine-upper");
    slope(m, null, 6, 0, r("mine-upper"));
    roof(m, 1);
    fill(m, "stone", 8);
    // corridors
    eachCell(m, { x: 2, y: 12, w: m.w - 4, h: 3 }, (i) => { m.layers.stone[i] = 1; });
    eachCell(m, { x: 16, y: 2, w: 3, h: m.h - 4 }, (i) => { m.layers.stone[i] = 1; });
    eachCell(m, { x: 2, y: 4, w: 10, h: 3 }, (i) => { m.layers.stone[i] = 1; });
    leyV(m, 16, 2);
    fill(m, "light", 0);
    plant(m, "lichen", 1, 0.08, r("mine-lichen"));
    fill(m, "water", 1, { x: 2, y: 13, w: 8, h: 1 });
    place(m, "adit", 2, 13, "the adit");
    place(m, "east-tower-road", m.w - 3, 13, "the road to the fallen east tower");
    place(m, "shaft", 17, m.h - 3, "the shaft down");
  }
  // ── the deep: sealed by a ward with no known author ──
  {
    const d = R("mine-deep");
    slope(d, null, 2, 0, r("mine-deep"));
    roof(d, 1);
    fill(d, "stone", 8);
    eachCell(d, { x: 2, y: 17, w: d.w - 4, h: 3 }, (i) => { d.layers.stone[i] = 1; });
    eachCell(d, { x: 14, y: 10, w: 5, h: 8 }, (i) => { d.layers.stone[i] = 1; });
    eachCell(d, { x: 15, y: 2, w: 3, h: 9 }, (i) => { d.layers.stone[i] = 1; });
    fill(d, "heat", -2);
    fill(d, "light", 0);
    fill(d, "water", 1, { x: 2, y: 18, w: d.w - 4, h: 1 });
    scatter(d, "rot", 3, 0.4, r("deep-rot"), { x: 2, y: 17, w: 10, h: 3 });
    plant(d, "lichen", 1, 0.15, r("deep-lichen"));
    eachCell(d, { x: 13, y: 9, w: 7, h: 1 }, (i) => { d.layers.stone[i] = 9; });
    d.marks[String(idx(d, 16, 9))] = { sigil: "ward:sealed-gallery", glow: "#3b3b4f", by: "unknown", spellId: "stale:sealed-gallery" };
    place(d, "sealed-gallery", 16, 12, "the sealed gallery", "Morithedor");
    place(d, "shaft", 16, 2, "the shaft up");
    place(d, "seam-way", d.w - 3, 18, "the way to the seam");
  }
  // ── silver seam ──
  {
    const s = R("silver-seam");
    slope(s, null, 1, 0, r("silver-seam"));
    roof(s, 1);
    fill(s, "stone", 7);
    eachCell(s, { x: 1, y: 7, w: s.w - 2, h: 2 }, (i) => { s.layers.stone[i] = 1; });
    scatter(s, "silver", 3, 0.5, r("seam-silver"), { x: 1, y: 5, w: s.w - 2, h: 6 });
    fill(s, "light", 0);
    place(s, "seam", 8, 8, "the silver seam");
  }
  // ── foundry: cold; careless when lit ──
  {
    const f = R("foundry");
    slope(f, null, 9, 0, r("foundry"));
    roof(f, 1);
    walls(f);
    fill(f, "light", 1);
    place(f, "furnace", 10, 8, "the furnace", "Hahamadath");
    place(f, "hearth-of-ash", 4, 12, "the ash pit");
    f.layers.stone[idx(f, 10, 8)] = 4;
  }
  // ── glassworks: roof fallen ──
  {
    const g = R("glassworks");
    slope(g, null, 9, 0, r("glassworks"));
    walls(g);
    roof(g, 1, { x: 1, y: 1, w: 3, h: g.h - 2 });
    roof(g, 1, { x: g.w - 4, y: 1, w: 3, h: g.h - 2 });
    scatter(g, "stone", 3, 0.4, r("glass-rubble"), { x: 4, y: 1, w: g.w - 8, h: g.h - 2 });
    fill(g, "light", 3);
    fill(g, "water", 1);
    place(g, "roof", 8, 6, "the fallen roof", "Lumevitre");
    place(g, "kiln", 3, 6, "the glass kiln");
  }
  // ── bell tower: bell cracked ──
  {
    const b = R("bell-tower");
    slope(b, null, 16, 0, r("bell-tower"));
    roof(b, 1);
    walls(b);
    leyV(b, 4, 1);
    place(b, "bell", 4, 4, "the bell", "Tantanoes");
    place(b, "stair", 1, 6, "the bell stair");
  }
  // ── boneyard: quiet; one grave is warm ──
  {
    const b = R("boneyard");
    slope(b, "s", 9, 1, r("boneyard"));
    fill(b, "stone", 1);
    plant(b, "lichen", 1, 0.3, r("bone-lichen"));
    plant(b, "grass", 1, 0.3, r("bone-grass"));
    leyV(b, 8, 2);
    fill(b, "light", 2);
    b.layers.heat[idx(b, 8, 8)] = 2;
    place(b, "warm-grave", 8, 8, "the warm grave", "Ossnem");
    place(b, "ossuary", 2, 2, "the ossuary");
    creature(state, "warm-thing", "boneyard", 8, 8);
  }
  // ── ridge & cairns: toppled, ether leaking ──
  {
    const rg = R("ridge");
    slope(rg, "s", 24, 6, r("ridge"));
    fill(rg, "stone", 2);
    plant(rg, "grass", 1, 0.3, r("ridge-grass"));
    plant(rg, "firethorn", 1, 0.1, r("ridge-thorn"));
    leyH(rg, 4, 2);
    fill(rg, "light", 4);
    for (let k = 1; k <= 5; k++) {
      const x = 8 + (k - 1) * 12;
      place(rg, `cairn-${k}`, x, 4, `the ${["first", "second", "third", "fourth", "far"][k - 1]} cairn`, k === 5 ? "Norael" : undefined);
      rg.layers.stone[idx(rg, x, 4)] = 3; // toppled: a low heap, not a standing cairn (6)
      rg.layers.ether[idx(rg, x, 4)] = 1;
    }
    place(rg, "pass", 32, 0, "the pass");
  }
  // ── observatory: locked from inside ──
  {
    const o = R("observatory");
    slope(o, null, 20, 0, r("observatory"));
    roof(o, 1);
    walls(o, 2, 9);
    leyH(o, 12, 4);
    leyV(o, 12, 4);
    o.layers.ether[idx(o, 12, 12)] = 6;
    fill(o, "light", 0);
    place(o, "door", 12, 22, "the observatory door");
    place(o, "lens-mount", 12, 12, "the lens mount");
    o.marks[String(idx(o, 12, 22))] = { sigil: "ward:observatory-door", glow: "#c9b8d8", by: "Ysolde", spellId: "stale:observatory-door" };
  }
  // ── the green: fine; waiting ──
  {
    const g = R("green");
    slope(g, "s", 8, 1, r("green"));
    plant(g, "grass", 2, 0.95, r("green-grass"));
    fill(g, "light", 3);
    fill(g, "water", 1);
    place(g, "maypole", 8, 8, "the maypole");
  }
  // ── near moor: hostile, adapting ──
  {
    const n = R("near-moor");
    slope(n, "s", 3, 2, r("near-moor"));
    fill(n, "water", 1);
    plant(n, "grass", 1, 0.3, r("moor-grass"));
    plant(n, "blight-cap", 2, 0.12, r("moor-blight"));
    scatter(n, "rot", 2, 0.25, r("moor-rot"));
    fill(n, "light", 2);
    eachCell(n, { x: 0, y: 0, w: n.w, h: 1 }, (i, x) => { n.layers.stone[i] = x === 32 ? 0 : 6; }); // Ilvane's wall, and the gate
    place(n, "gate", 32, 0, "the gate in Ilvane's wall");
    place(n, "wall", 16, 0, "Ilvane's wall");
  }
  // ── the barrows ──
  {
    const b = R("barrows");
    slope(b, "e", 4, 1, r("barrows"));
    fill(b, "stone", 1);
    scatter(b, "stone", 5, 0.1, r("barrow-mounds"));
    scatter(b, "rot", 3, 0.3, r("barrow-rot"));
    fill(b, "light", 1);
    place(b, "first-barrow", 16, 16, "the first barrow");
  }
  // ── the far fen ──
  {
    const f = R("far-fen");
    slope(f, null, 1, 0, r("far-fen"));
    fill(f, "water", 3);
    fill(f, "rot", 5);
    plant(f, "blight-cap", 3, 0.3, r("fen-blight"));
    fill(f, "light", 1);
    place(f, "heart", 32, 32, "the heart of the fen");
  }
  // ── the road out: closed ──
  {
    const rd = R("road-out");
    slope(rd, "s", 3, 1, r("road-out"));
    fill(rd, "stone", 6);
    place(rd, "road", 0, 0, "the road out");
  }

  // ── golems ──
  for (const g of GOLEM_CATALOG) {
    const e: Entity = {
      name: g.name,
      kind: "golem",
      sub: g.body,
      region: g.region,
      x: g.x,
      y: g.y,
      state: {},
      carrying: {},
      behaviour: null,
      bound: g.startsBound === "stale" ? { mode: "stale", spellId: `stale:golem-${g.name.toLowerCase()}`, source: staleGolemSource(g.name), author: g.staleAuthor ?? "unknown" } : null,
      last: g.staleNote ?? "asleep",
      tired: 0,
    };
    state.entities[e.name] = e;
  }

  for (const id of REGION_ORDER) regions[id].ailments = computeAilments(regions[id], state);
  return state;
}
