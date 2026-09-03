/** SVG geometry for the painted map. Pure functions over engine state. */
import { createRng, hexCorners, hexKey, hexNeighbors, hexToPixel, parseHexKey, type Axial, type GameState, type Province } from "@workspace/regency-engine";

export const HEX = 22;
const PAD = HEX * 2;

/** Edge k joins corners k and k+1; this maps it to the neighbour direction across that edge. */
const EDGE_DIRECTION = [0, 5, 4, 3, 2, 1] as const;

export interface Pt {
  x: number;
  y: number;
}

export interface Decoration {
  x: number;
  y: number;
  kind: "tree" | "peak" | "hill" | "reed" | "wheat";
  scale: number;
}

export interface ProvinceShape {
  id: string;
  /** Closed outline loops as one path (evenodd). */
  path: string;
  centre: Pt;
  label: Pt;
  decorations: Decoration[];
}

export interface MapLayout {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  sea: string;
  land: string;
  coast: string;
  provinces: ProvinceShape[];
  rivers: string[];
  roads: Array<{ d: string; key: string }>;
  centres: Record<string, Pt>;
}

const k = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

/** Chain directed edges into closed loops and emit them as one path. */
export function traceLoops(edges: Array<[Pt, Pt]>): string {
  const byStart = new Map<string, Array<[Pt, Pt]>>();
  for (const e of edges) {
    const key = k(e[0]);
    byStart.set(key, [...(byStart.get(key) ?? []), e]);
  }
  const used = new Set<[Pt, Pt]>();
  let path = "";
  for (const start of edges) {
    if (used.has(start)) continue;
    let current = start;
    const pts: Pt[] = [current[0]];
    for (let guard = 0; guard < edges.length + 2; guard++) {
      used.add(current);
      pts.push(current[1]);
      const candidates = (byStart.get(k(current[1])) ?? []).filter((e) => !used.has(e));
      if (candidates.length === 0) break;
      current = candidates[0]!;
      if (k(current[0]) === k(start[0])) break;
    }
    if (pts.length >= 3) path += `M${pts.map(k).join("L")}Z`;
  }
  return path;
}

function smooth(points: Pt[]): string {
  if (points.length < 2) return "";
  let d = `M${k(points[0]!)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i]!.x + points[i + 1]!.x) / 2, y: (points[i]!.y + points[i + 1]!.y) / 2 };
    d += `Q${k(points[i]!)} ${k(mid)}`;
  }
  d += `L${k(points[points.length - 1]!)}`;
  return d;
}

export function layoutMap(state: GameState): MapLayout {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (h: Axial) => {
    const p = hexToPixel(h, HEX);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const key of state.map.seaCells) consider(parseHexKey(key));
  for (const p of Object.values(state.provinces)) for (const c of p.cells) consider(c);
  const offsetX = -minX + PAD;
  const offsetY = -minY + PAD;
  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2;

  const owner = new Map<string, string>();
  for (const p of Object.values(state.provinces)) for (const c of p.cells) owner.set(hexKey(c), p.id);

  const provinces: ProvinceShape[] = [];
  const coastEdges: Array<[Pt, Pt]> = [];
  const centres: Record<string, Pt> = {};
  for (const p of Object.values(state.provinces)) {
    const edges: Array<[Pt, Pt]> = [];
    for (const cell of p.cells) {
      const corners = hexCorners(cell, HEX);
      const neighbors = hexNeighbors(cell);
      for (let e = 0; e < 6; e++) {
        const other = owner.get(hexKey(neighbors[EDGE_DIRECTION[e]!]!));
        if (other === p.id) continue;
        const seg: [Pt, Pt] = [corners[e]!, corners[(e + 1) % 6]!];
        edges.push(seg);
        if (other === undefined) coastEdges.push(seg);
      }
    }
    const centre = hexToPixel(p.centre, HEX);
    centres[p.id] = centre;
    const rng = createRng(`${state.seed}:art:${p.id}`);
    const decorations: Decoration[] = [];
    const kind: Decoration["kind"] | null = p.terrain === "forest" ? "tree" : p.terrain === "mountains" ? "peak" : p.terrain === "hills" ? "hill" : p.terrain === "marsh" ? "reed" : p.fertility >= 4 ? "wheat" : null;
    if (kind) {
      const density = kind === "tree" ? 0.7 : kind === "wheat" ? 0.35 : 0.55;
      for (const cell of p.cells) {
        if (hexKey(cell) === hexKey(p.centre)) continue;
        if (!rng.chance(density)) continue;
        const c = hexToPixel(cell, HEX);
        const n = kind === "tree" ? 2 + rng.int(2) : 1;
        for (let i = 0; i < n; i++) decorations.push({ x: c.x + (rng.next() - 0.5) * HEX, y: c.y + (rng.next() - 0.5) * HEX * 0.8, kind, scale: 0.7 + rng.next() * 0.5 });
      }
    }
    provinces.push({ id: p.id, path: traceLoops(edges), centre, label: { x: centre.x, y: centre.y - HEX * 0.5 }, decorations });
  }
  let sea = "";
  for (const key of state.map.seaCells) {
    const c = hexCorners(parseHexKey(key), HEX);
    sea += `M${c.map(k).join("L")}Z`;
  }
  const land = traceLoops(coastEdges);
  const rivers = state.map.rivers.map((river) => smooth(river.map((h) => hexToPixel(h, HEX))));
  const roads: Array<{ d: string; key: string }> = [];
  const seen = new Set<string>();
  for (const p of Object.values(state.provinces)) {
    if (!p.buildings.road && !p.capitalOf) continue;
    for (const n of p.neighbors) {
      const q = state.provinces[n]!;
      if (!q.buildings.road && !q.capitalOf) continue;
      if (!p.buildings.road && !q.buildings.road) continue;
      const key = [p.id, q.id].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = centres[p.id]!;
      const b = centres[q.id]!;
      const mid = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.12, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.12 };
      roads.push({ d: `M${k(a)}Q${k(mid)} ${k(b)}`, key });
    }
  }
  return { width, height, offsetX, offsetY, sea, land, coast: land, provinces, rivers, roads, centres };
}

export function decorationPath(d: Decoration): string {
  const s = d.scale * 6;
  switch (d.kind) {
    case "tree":
      return `M${d.x} ${d.y - s * 1.4} l${s * 0.8} ${s * 1.3} h-${s * 0.45} v${s * 0.5} h-${s * 0.7} v-${s * 0.5} h-${s * 0.45} z`;
    case "peak":
      return `M${d.x - s * 1.4} ${d.y + s * 0.8} l${s * 0.9} -${s * 1.7} l${s * 0.5} ${s * 0.7} l${s * 0.4} -${s * 0.5} l${s * 1} ${s * 1.5} z`;
    case "hill":
      return `M${d.x - s * 1.3} ${d.y + s * 0.4} q${s * 1.3} -${s * 1.4} ${s * 2.6} 0`;
    case "reed":
      return `M${d.x - s * 0.8} ${d.y} h${s * 0.6} M${d.x + s * 0.1} ${d.y - s * 0.4} h${s * 0.7} M${d.x - s * 0.4} ${d.y + s * 0.4} h${s * 0.9}`;
    case "wheat":
      return `M${d.x} ${d.y + s * 0.6} v-${s * 1.2} m-${s * 0.35} ${s * 0.2} l${s * 0.35} -${s * 0.3} l${s * 0.35} ${s * 0.3} m-${s * 0.7} ${s * 0.45} l${s * 0.35} -${s * 0.3} l${s * 0.35} ${s * 0.3}`;
  }
}

export function terrainSymbol(p: Province): string {
  switch (p.terrain) {
    case "mountains":
      return "▲";
    case "hills":
      return "⌒";
    case "forest":
      return "♣";
    case "marsh":
      return "≈";
    default:
      return "";
  }
}

/**
 * Snow on the high ground: a cap over a peak, a dusting over a hill. Winter
 * only; the map draws it from the same decorations as the terrain art, so the
 * snow always lies exactly where the mountains are.
 */
export function snowPath(d: Decoration): string {
  const s = d.scale * 6;
  if (d.kind === "peak") {
    return `M${d.x - s * 0.55} ${d.y - s * 0.35} l${s * 0.4} -${s * 0.75} l${s * 0.5} ${s * 0.7} l${s * 0.4} -${s * 0.5} l${s * 0.45} ${s * 0.65} q-${s * 0.5} ${s * 0.25} -${s * 0.9} 0 q-${s * 0.45} -${s * 0.2} -${s * 0.85} -0.1 z`;
  }
  return `M${d.x - s * 1.1} ${d.y + s * 0.2} q${s * 1.1} -${s * 1.1} ${s * 2.2} 0 q-${s * 1.1} ${s * 0.35} -${s * 2.2} 0 z`;
}
