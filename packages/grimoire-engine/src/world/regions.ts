/**
 * The region catalog and cell access. Regions are struct-of-arrays; index =
 * y * w + x. Sizes follow docs/grimoire-design.md §8.1.
 */
import { LAYERS, type Cell, type Layer, type Region, type RegionId, type SpiritId, type SpeciesId } from "../types.js";

export interface RegionSpec {
  name: string;
  w: number;
  h: number;
  floors: number;
  downstream: RegionId | null;
  windward: RegionId[];
  spirit: SpiritId | null;
  blurb: string;
}

export const REGION_CATALOG: Record<RegionId, RegionSpec> = {
  "manor": { name: "the manor and hearth", w: 24, h: 16, floors: 1, downstream: null, windward: ["ridge"], spirit: "hearth", blurb: "Home; the familiar; the circle and the study; ether densest. Intact, cold; lights on the first verse." },
  "garden": { name: "the kitchen garden", w: 16, h: 16, floors: 1, downstream: "lower-reach", windward: ["manor"], spirit: null, blurb: "First growth; herbs for reagents. Overgrown, vermin visibly moving." },
  "scriptorium": { name: "the scriptorium", w: 12, h: 8, floors: 1, downstream: null, windward: [], spirit: null, blurb: "Where runes are written, later; the master's desk. Locked by a word." },
  "library": { name: "the sunken library", w: 32, h: 24, floors: 3, downstream: "lower-reach", windward: [], spirit: "library", blurb: "The lexicon; every master's notebooks. Flooded to the second floor." },
  "chapel": { name: "the chapel of names", w: 12, h: 12, floors: 1, downstream: null, windward: ["boneyard"], spirit: null, blurb: "The deepest lexicon; the council; the spellbook shelf. Intact; the door answers to household verse." },
  "orchard": { name: "the orchard", w: 40, h: 32, floors: 1, downstream: "lower-reach", windward: ["upper-reach", "ridge"], spirit: "orchard", blurb: "Growth, seasons, the first wards; sap. Drowning under Ilvane's ward." },
  "cold-house": { name: "the cold house", w: 16, h: 12, floors: 1, downstream: "lower-reach", windward: ["orchard"], spirit: null, blurb: "Slow growth; winter stores; light. Glass broken, rot in corners." },
  "hot-house": { name: "the hot house", w: 16, h: 12, floors: 1, downstream: "lower-reach", windward: ["orchard"], spirit: null, blurb: "Fast growth; the quarrel. Two wards fighting every dawn; Wren between them." },
  "night-house": { name: "the night house", w: 16, h: 12, floors: 1, downstream: "lower-reach", windward: ["orchard"], spirit: null, blurb: "Moonbloom; ether harvest. Dark; its ward released by the master, reason unknown." },
  "upper-reach": { name: "the upper reach and the weir", w: 48, h: 12, floors: 1, downstream: "mill", windward: ["ridge"], spirit: "river", blurb: "The river's entry; the weir governs the valley's water. Weir stuck half-open." },
  "mill": { name: "the mill", w: 20, h: 16, floors: 1, downstream: "lower-reach", windward: ["upper-reach"], spirit: "mill", blurb: "The wheel; power; the River's anchor. Wheel drawn still, sluice silted." },
  "lower-reach": { name: "the lower reach and the marsh", w: 48, h: 24, floors: 1, downstream: "grate", windward: ["mill", "near-moor"], spirit: null, blurb: "Slow water; silt; reeds; the grate. Rot spreading from the grate." },
  "grate": { name: "the grate", w: 6, h: 6, floors: 1, downstream: "near-moor", windward: ["near-moor"], spirit: null, blurb: "Where the river leaves; the Moor's way in. Bars corroded." },
  "mine-upper": { name: "the upper galleries", w: 32, h: 24, floors: 1, downstream: null, windward: [], spirit: null, blurb: "Stone; hauling golems; darkness. Toll hauling to nowhere." },
  "mine-deep": { name: "the deep", w: 32, h: 24, floors: 1, downstream: null, windward: [], spirit: "deep", blurb: "Rot, cold, old workings; Corwen's charter. Sealed by a ward with no known author." },
  "silver-seam": { name: "the silver seam", w: 16, h: 16, floors: 1, downstream: null, windward: [], spirit: null, blurb: "Silver for glass and foci. Reached only through the deep." },
  "foundry": { name: "the foundry", w: 20, h: 16, floors: 1, downstream: null, windward: ["mill"], spirit: "foundry", blurb: "Heat; ash; glass; the Foundry spirit. Cold; careless when lit." },
  "glassworks": { name: "the glassworks", w: 16, h: 12, floors: 1, downstream: null, windward: ["foundry"], spirit: "glass", blurb: "Glass for foci and lenses. Roof fallen." },
  "bell-tower": { name: "the bell tower", w: 8, h: 8, floors: 1, downstream: null, windward: ["ridge"], spirit: "bell", blurb: "The estate's time; sky events; festivals rung. Bell cracked; hours drift." },
  "boneyard": { name: "the boneyard", w: 16, h: 16, floors: 1, downstream: null, windward: ["near-moor"], spirit: "boneyard", blurb: "Memory; the ossuary; Corwen's golems. Quiet; one grave is warm." },
  "ridge": { name: "the ridge and the cairns", w: 64, h: 16, floors: 1, downstream: "upper-reach", windward: [], spirit: "ridge", blurb: "Ley nodes; weather comes here first; the third line. Cairns toppled, ether leaking." },
  "observatory": { name: "the observatory", w: 24, h: 24, floors: 1, downstream: null, windward: ["ridge"], spirit: null, blurb: "The great work; lenses; the moon. Locked from inside." },
  "green": { name: "the green", w: 16, h: 16, floors: 1, downstream: "lower-reach", windward: ["manor"], spirit: null, blurb: "The festival ground below the manor. Fine; waiting." },
  "near-moor": { name: "the near moor", w: 64, h: 32, floors: 1, downstream: "far-fen", windward: ["far-fen", "barrows"], spirit: "moor", blurb: "Outside the wall; blight's staging ground; wind. Hostile, adapting." },
  "barrows": { name: "the barrows", w: 32, h: 32, floors: 1, downstream: "far-fen", windward: ["far-fen"], spirit: null, blurb: "Old graves; the Moor's memory; stolen names. Unknown." },
  "far-fen": { name: "the far fen", w: 64, h: 64, floors: 1, downstream: null, windward: [], spirit: null, blurb: "The Moor's heart; source of rot. Unknown." },
  "road-out": { name: "the road out", w: 1, h: 48, floors: 1, downstream: null, windward: ["near-moor"], spirit: null, blurb: "The ending. Closed." },
};

export const REGION_ORDER: RegionId[] = Object.keys(REGION_CATALOG) as RegionId[];

export function idx(region: Pick<Region, "w">, x: number, y: number): number {
  return y * region.w + x;
}

export function inBounds(region: Pick<Region, "w" | "h">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < region.w && y < region.h;
}

export function cellAt(region: Region, x: number, y: number): Cell {
  const i = idx(region, x, y);
  const cell = { region: region.id, x, y } as Cell;
  for (const layer of LAYERS) (cell as Record<Layer, number>)[layer] = region.layers[layer][i] ?? 0;
  cell.elevation = region.elevation[i] ?? 0;
  cell.ley = (region.ley[i] ?? 0) === 1;
  cell.roofed = (region.roof[i] ?? 0) === 1;
  const sp = region.species[i] ?? "";
  cell.species = sp === "" ? null : (sp as SpeciesId);
  cell.mark = region.marks[String(i)] ?? null;
  cell.adorn = region.adorns[String(i)] ?? null;
  return cell;
}

export function neighbours(region: Region, x: number, y: number, radius = 1): Cell[] {
  const out: Cell[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(region, nx, ny)) out.push(cellAt(region, nx, ny));
    }
  }
  return out;
}

/** The four orthogonal neighbour indices of i, or -1 where out of bounds: [n, s, e, w]. */
export function ortho(region: Pick<Region, "w" | "h">, i: number): [number, number, number, number] {
  const x = i % region.w;
  const y = (i - x) / region.w;
  return [
    y > 0 ? i - region.w : -1,
    y < region.h - 1 ? i + region.w : -1,
    x < region.w - 1 ? i + 1 : -1,
    x > 0 ? i - 1 : -1,
  ];
}

export function emptyRegion(id: RegionId): Region {
  const spec = REGION_CATALOG[id];
  const n = spec.w * spec.h;
  const layers = {} as Record<Layer, number[]>;
  for (const layer of LAYERS) layers[layer] = new Array<number>(n).fill(0);
  return {
    id,
    name: spec.name,
    w: spec.w,
    h: spec.h,
    floors: spec.floors,
    elevation: new Array<number>(n).fill(0),
    ley: new Array<number>(n).fill(0),
    layers,
    species: new Array<string>(n).fill(""),
    roof: new Array<number>(n).fill(0),
    marks: {},
    adorns: {},
    sluices: [],
    places: {},
    ailments: [],
    downstream: spec.downstream,
    windward: spec.windward,
  };
}
