/**
 * The reaction table (design §9.2) and the tick. Integers per cell; every
 * reaction is a local rule evaluated each tick in a fixed order; deterministic
 * given the seed. Numbers are tuning constants at the top.
 *
 * Readability rule: the first ten reactions must be inferable from the map by
 * watching. Keep them simple and keep them visible.
 */
import type { Ailment, Dir, EstateState, Region, RegionId, Season, SpeciesId } from "../types.js";
import { refillReserve } from "./ether.js";
import { restGolems } from "./golems.js";
import { moorPressure } from "./moor.js";
import { idx, ortho } from "./regions.js";
import { makeRng, type Rng } from "./rng.js";
import { advanceSky, moonlight, ringFirstFrost, sunlight, type SkyEvent } from "./sky.js";
import { stepCreatures } from "./creatures.js";

// ── tuning ────────────────────────────────────────────────────────────────
export const SLUICE_FLOW = 60;
export const OUTFLOW_EVERY = 8;
export const DRAIN_RATE = 22;
export const MAX = { heat: 9, water: 6, stone: 9, growth: 6, air: 6, light: 6, rot: 6, ether: 6, steam: 4, silt: 6, ash: 6, frost: 4, spore: 6, silver: 6, glass: 6 } as const;
const STEAM_HEAT = 3;           // 1: heat ≥ 3 on water makes steam
const FIRE_HEAT = 5;            // 4: heat ≥ 5 on growth is fire
const DARK_ROT_PERIOD = 12;     // 6: wet dark seeds rot once in this many ticks
const ROT_SPREAD_PERIOD = 6;
const ROT_SHARE_CEILING = 0.45;   // soft stakes: rot never takes more than this share of a region's cells to full
function rottedShare(r: Region): number {
  let k = 0; const n = r.w * r.h;
  for (let i = 0; i < n; i++) if (r.layers.rot[i]! >= MAX.rot - 1) k++;
  return n ? k / n : 0;
}    // 7: rot spreads to a wet dark green neighbour once in this many ticks
const ROT_LIGHT = 4;            // 8: light ≥ 4 burns rot back
const ROT_ETHER_PERIOD = 8;     // 9: rot drinks ether
const SPORE_ROT = 4;            // 10: rot ≥ 4 casts spore on the wind
const FAST_FLOW = 3;            // 11: a drop ≥ 3 is fast water
const SILT_PERIOD = 12;         // 12/20: slow water lays silt once in this many ticks
const SILT_TO_STONE = 6;        // 12: silt above this becomes stone
const GLASS_HEAT = 6;           // 15: silver → glass
const LEY_GAIN = 2;             // 17: ether per tick on a ley cell
const LEY_CAP = 6;
const MOON_ETHER_PERIOD = 6;    // 18: moon ≥ half deposits ether
const CONDUCT_PERIOD = 1;       // 21
const IDLE_PERIOD = 4;

const SEASON_AMBIENT: Record<Season, number> = { spring: 0, summer: 1, autumn: 0, winter: -1 };

export const SPECIES_NEEDS: Record<SpeciesId, { water: number; light: number; saturate: number; note: string }> = {
  grass: { water: 1, light: 1, saturate: 3, note: "little water, any light; spreads fast, holds silt" },
  apple: { water: 2, light: 3, saturate: 6, note: "steady water, full light, cold winter; slow; sap in spring" },
  reed: { water: 2, light: 1, saturate: 4, note: "slow water; traps silt; builds marsh" },
  moonbloom: { water: 1, light: 0, saturate: 4, note: "moonlight only, no sun; opens at full moon" },
  firethorn: { water: 0, light: 2, saturate: 4, note: "dry, hot; burns readily; spreads by fire" },
  lichen: { water: 1, light: 0, saturate: 2, note: "stone, damp, dark; slow; tolerant of rot" },
  "blight-cap": { water: 0, light: 0, saturate: 4, note: "rot; the Moor's plant; spreads spore" },
};

export const REACTIONS: Array<{ n: number; when: string; then: string }> = [
  { n: 1, when: "heat ≥ 3 and water > 0", then: "1 water → steam; heat −1; air +1" },
  { n: 2, when: "steam in air, wind present", then: "steam moves with wind; deposits water where heat < 1" },
  { n: 3, when: "growth > 0, water ≥ need, light ≥ need", then: "growth +1; consumes water; if saturated, seeds a neighbour by species rule" },
  { n: 4, when: "heat ≥ 5 and growth > 0", then: "fire: growth −2, heat +2, light +3; when growth = 0, ash +1" },
  { n: 5, when: "fire and neighbour growth > 0 and wind toward it", then: "fire spreads; faster in dry season" },
  { n: 6, when: "water > 0 and light = 0 for a while", then: "rot seeds +1" },
  { n: 7, when: "rot > 0 and neighbour has water > 0, light < 2, growth > 0", then: "rot spreads; growth −1" },
  { n: 8, when: "light ≥ 4 on rot", then: "rot −1" },
  { n: 9, when: "rot > 0 and ether > 0", then: "rot +1, ether −1 (the Moor's weapon)" },
  { n: 10, when: "rot ≥ 4 and wind", then: "spore rides the wind; seeds rot where it lands in wet dark" },
  { n: 11, when: "water flows downhill", then: "to lowest neighbour; carries silt if slow, scours if fast" },
  { n: 12, when: "slow water over stone", then: "silt +1; silt above threshold becomes stone" },
  { n: 13, when: "fast water over silt", then: "silt carried away" },
  { n: 14, when: "heat < 0 and water > 0", then: "frost; blocks flow; thaws with heat" },
  { n: 15, when: "silver in stone, heat ≥ 6, ether ≥ 2", then: "silver → glass; glass holds light and ether" },
  { n: 16, when: "glass and light", then: "light passes; ether +1 per tick under moon" },
  { n: 17, when: "ether on a ley cell", then: "ether +2 per tick to line capacity; pools spread slowly" },
  { n: 18, when: "moon ≥ half, open sky", then: "ether +1" },
  { n: 19, when: "cairn toppled", then: "ether leaks from the node to the near moor" },
  { n: 20, when: "reed and slow water", then: "silt +1 (reeds trap silt)" },
  { n: 21, when: "heat conducts", then: "each cell moves toward the mean of its neighbours by 1" },
  { n: 22, when: "light propagates", then: "from sources, blocked by stone, halved by dense growth" },
];

export interface WorldEvent { kind: string; text: string; region?: RegionId; cell?: number; entity?: string; spell?: string; rung?: "quiet" | "inbox" | "urgent" }
export interface TickReport { tick: number; events: WorldEvent[]; touched: RegionId[]; skyEvents: SkyEvent[] }

const clamp = (v: number, max: number, min = -9) => (v > max ? max : v < min ? min : v);
const DIR_DELTA: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

function downwind(r: Region, i: number, dir: Dir): number {
  const x = i % r.w;
  const y = (i - x) / r.w;
  const [dx, dy] = DIR_DELTA[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) return -1;
  return ny * r.w + nx;
}

/** Where water arriving from upstream enters a region. */
const INFLOW: Partial<Record<RegionId, [number, number]>> = {
  "upper-reach": [0, 6], mill: [10, 0], "lower-reach": [0, 12], grate: [3, 0], "near-moor": [32, 1], "far-fen": [32, 0],
  orchard: [1, 10], library: [16, 20], "cold-house": [1, 6], "hot-house": [1, 6], "night-house": [1, 6], garden: [8, 0], green: [8, 0], barrows: [0, 16],
};

function isSource(_state: EstateState, r: Region, i: number): boolean {
  // The hearth and the furnace hold their heat once lit (the fire is kept).
  const p = r.places["hearth"] ?? r.places["furnace"];
  return !!p && idx(r, p.x, p.y) === i;
}

/** One region, one tick, reactions in order. Returns notable events. */
function reactRegion(state: EstateState, r: Region, rng: Rng, tick: number, events: WorldEvent[]): void {
  const rotCeilingHit = rottedShare(r) >= ROT_SHARE_CEILING;
  const L = r.layers;
  const n = r.w * r.h;
  const sky = state.sky;
  const sun = sunlight(sky);
  const moon = moonlight(sky);
  const wind = sky.windDir;
  const windy = sky.windForce >= 2;
  const dry = sky.season === "summer";
  const ambientHeat = SEASON_AMBIENT[sky.season] + (sun >= 5 ? 1 : 0);

  for (let i = 0; i < n; i++) {
    const blocked = L.stone[i]! >= 6;
    // 1 heat on water → steam
    if (L.heat[i]! >= STEAM_HEAT && L.water[i]! > 0) {
      L.water[i]!--; L.steam[i] = clamp(L.steam[i]! + 1, MAX.steam); L.heat[i]!--; L.air[i] = clamp(L.air[i]! + 1, MAX.air);
    }
    // 2 steam rides the wind; deposits water where cold
    if (L.steam[i]! > 0) {
      const j = windy ? downwind(r, i, wind) : -1;
      if (j >= 0 && L.stone[j]! < 6) {
        L.steam[i]!--;
        if (L.heat[j]! < 1) L.water[j] = clamp(L.water[j]! + 1, MAX.water); else L.steam[j] = clamp(L.steam[j]! + 1, MAX.steam);
      } else if (!windy && L.heat[i]! < 1) { L.steam[i]!--; L.water[i] = clamp(L.water[i]! + 1, MAX.water); }
    }
    // 3 growth
    const sp = r.species[i] as SpeciesId | "";
    if (sp !== "" && L.growth[i]! > 0 && !blocked) {
      const need = SPECIES_NEEDS[sp];
      const light = sp === "moonbloom" ? (L.light[i]! > 0 && sun === 0 ? 1 : 0) : L.light[i]!;
      const ok = sp === "blight-cap" ? L.rot[i]! > 0 : (L.water[i]! >= need.water && light >= need.light && (sp !== "moonbloom" || sun === 0) && L.rot[i]! < 3 && L.frost[i]! === 0);
      const slow = (tick + i) % (sp === "apple" || sp === "lichen" ? 24 : sp === "grass" ? 6 : 12) === 0;
      if (ok && slow) {
        if (L.growth[i]! < MAX.growth) L.growth[i]!++;
        if (need.water > 0 && L.water[i]! > 0 && (tick + i) % 12 === 0) L.water[i]!--;
        if (L.growth[i]! >= need.saturate && (tick + i) % 12 === 0) {
          const [a, b, c, d] = ortho(r, i);
          for (const j of [a, b, c, d]) {
            if (j < 0 || r.species[j] !== "" || L.stone[j]! >= 3) continue;
            const seedOk =
              sp === "grass" ? L.water[j]! >= 1 && L.rot[j]! === 0 :
              sp === "reed" ? L.water[j]! >= 2 && L.water[j]! <= 3 :
              sp === "firethorn" ? L.water[j]! === 0 :
              sp === "lichen" ? L.stone[j]! > 0 && L.water[j]! >= 1 && L.light[j]! <= 1 :
              sp === "blight-cap" ? L.rot[j]! > 0 : false;
            if (seedOk) { r.species[j] = sp; L.growth[j] = 1; break; }
          }
        }
      }
    }
    // 4 fire
    if (L.heat[i]! >= FIRE_HEAT && L.growth[i]! > 0) {
      L.growth[i] = Math.max(0, L.growth[i]! - 2);
      L.heat[i] = clamp(L.heat[i]! + 2, MAX.heat);
      if (L.growth[i] === 0) { L.ash[i] = clamp(L.ash[i]! + 1, MAX.ash); r.species[i] = ""; if ((tick + i) % 3 === 0) events.push({ kind: "fire", text: `fire burns out in ${r.name}`, region: r.id, cell: i }); }
      // 5 spread
      const j = downwind(r, i, wind);
      if (j >= 0 && L.growth[j]! > 0 && (dry || (tick + i) % 2 === 0)) L.heat[j] = clamp(L.heat[j]! + 3, MAX.heat);
    }
    // 6 wet dark seeds rot
    if (!rotCeilingHit && L.water[i]! > 0 && L.light[i]! === 0 && (tick + i) % DARK_ROT_PERIOD === 0 && L.rot[i]! < 2) L.rot[i]!++;
    // 7 rot spreads — but the marsh remembers: no region goes past half rotted (soft stakes)
    if (L.rot[i]! > 0 && (tick + i) % ROT_SPREAD_PERIOD === 0 && !rotCeilingHit) {
      const [a, b, c, d] = ortho(r, i);
      for (const j of [a, b, c, d]) {
        if (j >= 0 && L.water[j]! > 0 && L.light[j]! < 2 && L.growth[j]! > 0) {
          L.rot[j] = clamp(L.rot[j]! + 1, MAX.rot); L.growth[j]!--;
          if (L.growth[j] === 0) r.species[j] = "";
          break;
        }
      }
    }
    // 8 light burns rot back
    if (L.rot[i]! > 0 && L.light[i]! >= ROT_LIGHT) L.rot[i]!--;
    // 9 rot drinks ether
    if (L.rot[i]! > 0 && L.ether[i]! > 0 && (tick + i) % ROT_ETHER_PERIOD === 0) { if (!rotCeilingHit) L.rot[i] = clamp(L.rot[i]! + 1, MAX.rot); L.ether[i]!--; }
    // 10 spore on the wind; spore settles
    if (L.rot[i]! >= SPORE_ROT && windy && (tick + i) % 4 === 0) {
      const j = downwind(r, i, wind);
      if (j >= 0) L.spore[j] = clamp(L.spore[j]! + 1, MAX.spore);
    }
    if (L.spore[i]! > 0) {
      if (L.water[i]! > 0 && L.light[i]! < 2) { L.spore[i]!--; if (!rotCeilingHit) L.rot[i] = clamp(L.rot[i]! + 1, MAX.rot); }
      else if (L.light[i]! >= 3) L.spore[i]!--;
      else if (windy) { const j = downwind(r, i, wind); if (j >= 0) { L.spore[i]!--; L.spore[j] = clamp(L.spore[j]! + 1, MAX.spore); } }
    }
    // 12 slow water over stone → silt; silt → stone
    if (L.water[i]! > 0 && L.water[i]! <= 2 && L.stone[i]! > 0 && L.stone[i]! < 6 && (tick + i) % SILT_PERIOD === 0) L.silt[i] = clamp(L.silt[i]! + 1, MAX.silt);
    if (L.silt[i]! >= SILT_TO_STONE) { L.silt[i] = 0; L.stone[i] = clamp(L.stone[i]! + 1, MAX.stone); }
    // 14 frost
    if (L.heat[i]! < 0 && L.water[i]! > 0 && !r.roof[i]) { L.frost[i] = clamp(L.frost[i]! + 1, MAX.frost); L.water[i]!--; }
    else if (L.frost[i]! > 0 && L.heat[i]! > 0) { L.frost[i]!--; L.water[i] = clamp(L.water[i]! + 1, MAX.water); }
    // 15 silver → glass
    if (L.silver[i]! > 0 && L.heat[i]! >= GLASS_HEAT && L.ether[i]! >= 2) { L.silver[i]!--; L.glass[i] = clamp(L.glass[i]! + 1, MAX.glass); L.ether[i]!--; events.push({ kind: "glass", text: `silver runs to glass in ${r.name}`, region: r.id, cell: i, rung: "inbox" }); }
    // 16 glass under the moon
    if (L.glass[i]! > 0 && moon > 0 && !r.roof[i]) L.ether[i] = clamp(L.ether[i]! + 1, MAX.ether);
    // 17 ley
    if (r.ley[i] === 1) {
      if (L.ether[i]! < LEY_CAP) L.ether[i] = clamp(L.ether[i]! + LEY_GAIN, LEY_CAP);
      if ((tick + i) % 6 === 0) {
        const [a, b, c, d] = ortho(r, i);
        for (const j of [a, b, c, d]) if (j >= 0 && L.ether[j]! < L.ether[i]! - 2) { L.ether[j]!++; break; }
      }
    }
    // 18 moon ≥ half on open sky
    if (moon >= 2 && !r.roof[i] && (tick + i) % MOON_ETHER_PERIOD === 0 && L.ether[i]! < 4) L.ether[i]!++;
    // 20 reeds trap silt
    if (sp === "reed" && L.water[i]! > 0 && L.water[i]! <= 3 && (tick + i) % SILT_PERIOD === 0) L.silt[i] = clamp(L.silt[i]! + 1, MAX.silt);
  }

  // 11 / 13 water flows downhill (single pass, scan order; alternate direction by tick to avoid bias)
  flowWater(state, r, tick);

  // 19 cairns leak
  if (r.id === "ridge") {
    for (const [k, p] of Object.entries(r.places)) {
      if (!k.startsWith("cairn-")) continue;
      const i = idx(r, p.x, p.y);
      if (L.stone[i]! < 6 && L.ether[i]! > 0 && tick % 6 === 0) { L.ether[i]!--; state.moor.reserve = Math.min(60, state.moor.reserve + 1); }
    }
  }

  // 21 heat conducts (double-buffered), decaying toward ambient outdoors; sources hold
  if (tick % CONDUCT_PERIOD === 0) {
    const next = L.heat.slice();
    for (let i = 0; i < n; i++) {
      if (isSource(state, r, i) && L.heat[i]! >= 3) { next[i] = Math.max(L.heat[i]!, 5); continue; }
      const [a, b, c, d] = ortho(r, i);
      let sum = 0; let cnt = 0;
      for (const j of [a, b, c, d]) if (j >= 0 && L.stone[j]! < 6) { sum += L.heat[j]!; cnt++; }
      const target = r.roof[i] ? (cnt ? sum / cnt : L.heat[i]!) : (cnt ? (sum + ambientHeat * 2) / (cnt + 2) : ambientHeat);
      const h = L.heat[i]!;
      next[i] = h < target - 0.5 ? h + 1 : h > target + 0.5 ? h - 1 : h;
    }
    L.heat = next;
  }

  // 22 light: ambient + sources − blockers
  const ambient = r.roof.length ? 0 : 0;
  void ambient;
  const light = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (L.stone[i]! >= 6) continue;
    let v = r.roof[i] ? 0 : Math.max(sun, moon);
    if (L.heat[i]! >= FIRE_HEAT && (L.growth[i]! > 0 || isSource(state, r, i))) v += 3;
    else if (L.heat[i]! >= 3 && isSource(state, r, i)) v += 2;
    const ad = r.adorns[String(i)];
    if (ad && (ad.kind === "lantern" || ad.kind === "glow")) v += 2 + Math.min(1, ad.intensity ?? 0);
    const mk = r.marks[String(i)];
    if (mk?.glow) v += 1;
    if (r.species[i] === "moonbloom" && sky.moon === 4 && L.growth[i]! >= 3) v += 1;
    if (L.growth[i]! >= 5) v = Math.floor(v / 2);
    light[i] = clamp(v, MAX.light, 0);
  }
  // Sources spill one cell.
  for (let i = 0; i < n; i++) {
    if (light[i]! < 3) continue;
    const [a, b, c, d] = ortho(r, i);
    for (const j of [a, b, c, d]) if (j >= 0 && L.stone[j]! < 6 && light[j]! < light[i]! - 1) light[j] = light[i]! - 1;
  }
  L.light = light;
  if (rng.next() < 0) events.push({ kind: "never", text: "" });
}

/** A region with an `outflow` place drains through it at DRAIN_RATE a tick, into the downstream region. */
function drainOutflow(state: EstateState, r: Region): void {
  const p = r.places["outflow"];
  if (!p || !r.downstream) return;
  const L = r.layers;
  const j = idx(r, p.x, p.y);
  const cells = spillCells(r, j, 2);
  let budget = DRAIN_RATE;
  for (const k of cells) {
    while (budget > 0 && L.water[k]! > 0) { L.water[k]!--; budget--; }
    if (!budget) break;
  }
  const moved = DRAIN_RATE - budget;
  if (moved > 0) {
    const ds = state.regions[r.downstream];
    const q = INFLOW[ds.id];
    if (q) { const t = idx(ds, q[0], q[1]); ds.layers.water[t] = clamp(ds.layers.water[t]! + Math.min(2, moved), MAX.water); }
  }
}

function flowWater(state: EstateState, r: Region, tick: number): void {
  drainOutflow(state, r);
  const L = r.layers;
  const n = r.w * r.h;
  const forward = tick % 2 === 0;
  for (let k = 0; k < n; k++) {
    const i = forward ? k : n - 1 - k;
    const w = L.water[i]!;
    if (w < 2 || L.frost[i]! > 0 || L.stone[i]! >= 6) continue;
    const here = r.elevation[i]! + w;
    let best = -1; let bestDrop = 0;
    const [a, b, c, d] = ortho(r, i);
    for (const j of [a, b, c, d]) {
      if (j < 0 || L.stone[j]! >= 6 || L.frost[j]! > 0 || L.water[j]! >= MAX.water) continue;
      const drop = here - (r.elevation[j]! + L.water[j]!);
      if (drop > bestDrop) { bestDrop = drop; best = j; }
    }
    if (best < 0) {
      // Region outflow: boundary cells with standing water leak to the downstream region.
      if (r.downstream && w >= 3 && isOutflowEdge(r, i) && tick % OUTFLOW_EVERY === 0) {
        L.water[i]!--;
        const ds = state.regions[r.downstream];
        const p = INFLOW[ds.id];
        if (p) { const j = idx(ds, p[0], p[1]); if (ds.layers.water[j]! < MAX.water) ds.layers.water[j]!++; }
      }
      continue;
    }
    const fast = bestDrop >= FAST_FLOW;
    const amount = fast ? 2 : 1;
    const moved = Math.min(amount, w - 1, MAX.water - L.water[best]!);
    if (moved <= 0) continue;
    L.water[i]! -= moved; L.water[best]! += moved;
    if (fast) { if (L.silt[i]! > 0) { L.silt[i]!--; L.silt[best] = clamp(L.silt[best]! + 1, MAX.silt); } }  // 13 scour
    else if (L.silt[i]! > 0 && (tick + i) % 3 === 0) { L.silt[i]!--; L.silt[best] = clamp(L.silt[best]! + 1, MAX.silt); } // carries silt slowly
  }
}

function isOutflowEdge(r: Region, i: number): boolean {
  const x = i % r.w;
  const y = (i - x) / r.w;
  // The lowest edge, by the region's slope: pick whichever of the four edges the cell is on and the elevation is minimal there.
  const onEdge = x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1;
  if (!onEdge) return false;
  return r.elevation[i]! <= minEdgeElevation(r) + 1;
}

const edgeMinCache = new WeakMap<Region, number>();
function minEdgeElevation(r: Region): number {
  const cached = edgeMinCache.get(r);
  if (cached !== undefined) return cached;
  let min = Infinity;
  for (let x = 0; x < r.w; x++) { min = Math.min(min, r.elevation[idx(r, x, 0)]!, r.elevation[idx(r, x, r.h - 1)]!); }
  for (let y = 0; y < r.h; y++) { min = Math.min(min, r.elevation[idx(r, 0, y)]!, r.elevation[idx(r, r.w - 1, y)]!); }
  edgeMinCache.set(r, min);
  return min;
}

/** The inflow cell and the cells within two steps of it: where a sluice pours. */
function spillCells(r: Region, j: number, radius = 3): number[] {
  const x0 = j % r.w, y0 = (j - x0) / r.w;
  const out: number[] = [];
  for (let y = Math.max(0, y0 - radius); y <= Math.min(r.h - 1, y0 + radius); y++)
    for (let x = Math.max(0, x0 - radius); x <= Math.min(r.w - 1, x0 + radius); x++)
      if (Math.abs(x - x0) + Math.abs(y - y0) <= radius && r.layers.stone[y * r.w + x]! < 6) out.push(y * r.w + x);
  return out.length ? out : [j];
}

/** Sluices gate water into the region they feed. */
function runSluices(state: EstateState, tick: number): void {
  for (const r of Object.values(state.regions)) {
    for (const s of r.sluices) {
      if (s.state === "closed" || !s.feeds) continue;
      if (s.state === "half" && tick % 2 === 1) continue;
      const i = idx(r, s.x, s.y);
      if (r.layers.frost[i]! > 0) continue;
      const target = state.regions[s.feeds];
      const p = INFLOW[target.id];
      if (!p) continue;
      const j = idx(target, p[0], p[1]);
      // A sluice draws from the river system (the upper reach, which the ridge refills every tick).
      const src = state.regions["upper-reach"];
      const si = idx(src, 12, 6);
      // An open sluice pours: several units a tick, spread over the inflow cell and its neighbours.
      const flow = s.state === "open" ? SLUICE_FLOW : Math.ceil(SLUICE_FLOW / 2);
      const spill = spillCells(target, j);
      for (let k = 0; k < flow; k++) {
        const at = spill[k % spill.length]!;
        if (target.layers.water[at]! < MAX.water) { if (src.layers.water[si]! > 1) src.layers.water[si]!--; target.layers.water[at]!++; }  // the river always has more
      }
    }
  }
}

/** Weather: rain and snow on open cells, the river's source, evaporation in summer sun. */
function weather(state: EstateState, active: Set<RegionId>, tick: number): void {
  const sky = state.sky;
  const upper = state.regions["upper-reach"];
  const entry = idx(upper, 0, 6);
  const melt = sky.season === "spring" ? 2 : 1;
  if (tick % 2 === 0) upper.layers.water[entry] = clamp(upper.layers.water[entry]! + melt, MAX.water);
  if ((sky.weather === "clear" || sky.weather === "wind") && sky.hour >= 8 && sky.hour <= 18) {
    // Sun and wind on thin water: it goes up about once a day per cell, so a field dries unless something feeds it.
    for (const r of Object.values(state.regions)) {
      if (!active.has(r.id)) continue;
      const n = r.w * r.h;
      for (let i = 0; i < n; i++) if (!r.roof[i] && (tick + i) % 20 === 0 && r.layers.water[i]! > 0 && r.layers.water[i]! < 3) r.layers.water[i]!--;
    }
  }
  if (sky.weather === "rain" || sky.weather === "storm" || sky.weather === "snow") {
    for (const r of Object.values(state.regions)) {
      if (!active.has(r.id)) continue;
      const n = r.w * r.h;
      const period = sky.weather === "storm" ? 24 : 48;   // a storm wets every open cell once a day; rain, every other day
      for (let i = 0; i < n; i++) if (!r.roof[i] && (tick + i) % period === 0 && r.layers.stone[i]! < 6) {
        if (sky.weather === "snow") r.layers.frost[i] = clamp(r.layers.frost[i]! + 1, MAX.frost);
        else r.layers.water[i] = clamp(r.layers.water[i]! + 1, MAX.water);
      }
    }
  }
}

/** Drawn wrong where the estate is wrong. */
export function computeAilments(region: Region, state: EstateState): Ailment[] {
  const L = region.layers;
  const n = region.w * region.h;
  const out: Ailment[] = [];
  const count = (f: (i: number) => boolean): number[] => { const c: number[] = []; for (let i = 0; i < n; i++) if (f(i)) c.push(i); return c; };
  const wetNative = new Set<RegionId>(["upper-reach", "mill", "lower-reach", "grate", "far-fen", "near-moor", "barrows"]);
  const darkNative = new Set<RegionId>(["mine-upper", "mine-deep", "silver-seam", "barrows"]);
  if (!wetNative.has(region.id)) {
    const flooded = count((i) => L.water[i]! >= 2);
    if (flooded.length > n * 0.05) out.push({ kind: "flooded", severity: Math.min(1, flooded.length / (n * 0.5)), cells: flooded.slice(0, 200), note: `${region.name} is ${flooded.length > n * 0.4 ? "drowning" : "flooding"}` });
  }
  const rot = count((i) => L.rot[i]! >= 2);
  if (rot.length > 0 && region.id !== "far-fen") out.push({ kind: "rot", severity: Math.min(1, rot.length / (n * 0.3)), cells: rot.slice(0, 200), note: `rot in ${region.name}` });
  const staleWards = Object.entries(region.marks).filter(([, m]) => m.sigil.startsWith("ward:") && m.spellId.startsWith("stale:"));
  for (const [i, m] of staleWards) {
    const kind = m.sigil.includes("lock") || m.sigil.includes("door") || m.sigil.includes("sealed") ? "locked" : "stale-ward";
    out.push({ kind, severity: 1, cells: [Number(i)], note: `${m.sigil.slice(5).replace(/-/g, " ")}: ${kind === "locked" ? "locked by a word" : `a stale ward by ${m.by}`}` });
  }
  if (region.id === "hot-house" && staleWards.length >= 2) out.push({ kind: "quarrel", severity: 1, note: "two wards fighting every dawn; Wren between them" });
  if (!darkNative.has(region.id) && region.id === "night-house") {
    const bloom = count((i) => region.species[i] === "moonbloom" && L.growth[i]! >= 3);
    if (bloom.length === 0) out.push({ kind: "dark", severity: 1, note: "dark; nothing blooms" });
  }
  if (region.id === "library") {
    const dark = count((i) => L.light[i]! === 0 && L.water[i]! > 0);
    if (dark.length > n * 0.3) out.push({ kind: "dark", severity: 0.6, note: "wet and dark; the books need dark, not wet" });
  }
  if (region.id === "manor") {
    const h = region.places["hearth"]!;
    if (L.heat[idx(region, h.x, h.y)]! < 3) out.push({ kind: "cold", severity: 1, cells: [idx(region, h.x, h.y)], note: "the hearth is cold" });
  }
  if (region.id === "cold-house") {
    const broken = count((i) => !region.roof[i] && L.stone[i]! < 6);
    if (broken.length) out.push({ kind: "broken", severity: 0.7, cells: broken, note: "glass broken; the sky gets in" });
  }
  if (region.id === "mill") {
    const wheel = region.places["wheel"]!;
    const wi = idx(region, wheel.x, wheel.y);
    const silted = count((i) => L.silt[i]! > 0 && i % region.w >= 8 && i % region.w <= 11);
    if (silted.length) out.push({ kind: "silted", severity: Math.min(1, silted.length / 24), cells: silted, note: "the sluice is silted" });
    if (L.water[wi]! < 2 || silted.length > 6) out.push({ kind: "still", severity: 1, cells: [wi], note: "the wheel is still" });
  }
  if (region.id === "glassworks") {
    const fallen = count((i) => !region.roof[i] && L.stone[i]! < 6 && i % region.w >= 4 && i % region.w < region.w - 4);
    if (fallen.length > 10) out.push({ kind: "broken", severity: 1, note: "the roof has fallen" });
  }
  if (region.id === "bell-tower" && !state.sky.bellTrue) out.push({ kind: "broken", severity: 0.8, note: "the bell is cracked; the hours drift" });
  const vermin = Object.values(state.entities).filter((e) => e.region === region.id && e.sub === "vermin").length;
  if (vermin >= 3) out.push({ kind: "vermin", severity: Math.min(1, vermin / 10), note: `vermin in ${region.name}` });
  if (region.id === "ridge") {
    const leaking = Object.entries(region.places).filter(([k]) => k.startsWith("cairn-")).filter(([, p]) => L.stone[idx(region, p.x, p.y)]! < 6).map(([, p]) => idx(region, p.x, p.y));
    if (leaking.length) out.push({ kind: "leaking", severity: leaking.length / 5, cells: leaking, note: `${leaking.length} cairn${leaking.length === 1 ? "" : "s"} toppled; ether leaking` });
  }
  if (region.id === "grate") {
    const bars = count((i) => (i - (i % region.w)) / region.w === 3 && L.stone[i]! > 0 && L.stone[i]! < 6);
    if (bars.length) out.push({ kind: "broken", severity: 0.8, cells: bars, note: "bars corroded" });
  }
  if (region.id === "road-out") out.push({ kind: "locked", severity: 1, note: "closed" });
  return out;
}

export function regionRestored(region: Region, state: EstateState): boolean {
  return computeAilments(region, state).every((a) => a.severity <= 0.2);
}

function defaultActive(state: EstateState): RegionId[] {
  const set = new Set<RegionId>();
  for (const a of Object.values(state.apprentices)) if (a.present) set.add(a.region);
  for (const e of Object.values(state.entities)) set.add(e.region);
  for (const r of Object.values(state.regions)) if (r.ailments.some((a) => a.severity > 0.2)) set.add(r.id);
  return [...set];
}

/**
 * One tick of the world. Mutates state in place. Golem bodies under a binding
 * are NOT run here (the DO runs their source); everything else is.
 */
export function tickWorld(state: EstateState, opts: { activeRegions?: RegionId[]; idle?: boolean } = {}): TickReport {
  const tick = state.sky.tick + 1;
  const rng = makeRng(`${state.seed}:tick:${tick}`);
  const events: WorldEvent[] = [];
  const activeList = opts.activeRegions ?? defaultActive(state);
  const active = new Set<RegionId>(activeList);
  const touched: RegionId[] = [];

  // 5. sky first, so this tick's light and weather are the sky's.
  const advanced = advanceSky(state.sky, rng.fork("sky"));
  state.sky = advanced.sky;
  events.push(...advanced.texts);
  const skyEvents = advanced.events;

  // weather and the river's source
  weather(state, active, tick);
  runSluices(state, tick);

  // 4. reactions over touched regions; idle regions on a slower cadence
  const order = Object.keys(state.regions) as RegionId[];
  for (let k = 0; k < order.length; k++) {
    const id = order[k]!;
    const r = state.regions[id];
    const isActive = active.has(id);
    if (!isActive && (opts.idle || (tick + k) % IDLE_PERIOD !== 0)) continue;
    reactRegion(state, r, rng.fork(id), tick, events);
    touched.push(id);
  }

  // first frost rings the festival
  if (state.sky.season === "autumn" && !state.sky.festival && skyEvents.includes("frost")) {
    const alreadyRung = state.festivals.some((f) => f.id === "first-frost" && f.year === state.sky.year);
    if (!alreadyRung) {
      const ev = ringFirstFrost(state.sky);
      if (ev) { events.push(ev); skyEvents.push("festival"); }
    }
  }

  // creatures, golems, the moor
  events.push(...stepCreatures(state, rng.fork("creatures"), activeList));
  restGolems(state);
  events.push(...moorPressure(state, rng.fork("moor")));

  // apprentices' reserve refills at the hearth
  for (const a of Object.values(state.apprentices)) {
    const hearth = state.regions.manor.places["hearth"]!;
    const atHearth = a.present && a.region === "manor" && Math.abs(a.x - hearth.x) <= 3 && Math.abs(a.y - hearth.y) <= 3;
    if (tick % 4 === 0) refillReserve(a, atHearth, state.sky);
  }

  // ailments recomputed for touched regions
  for (const id of touched) state.regions[id].ailments = computeAilments(state.regions[id], state);

  state.lastTick = tick;
  return { tick, events, touched, skyEvents };
}
