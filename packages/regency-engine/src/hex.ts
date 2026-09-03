/**
 * Axial hex coordinates (pointy-top). Shared by map generation (engine) and
 * rendering (panel) so both draw the same world.
 */
export interface Axial {
  q: number;
  r: number;
}

export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(h: Axial): string {
  return `${h.q},${h.r}`;
}

export function parseHexKey(key: string): Axial {
  const [q, r] = key.split(",").map(Number);
  return { q: q!, r: r! };
}

export function hexNeighbors(h: Axial): Axial[] {
  return HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Pixel centre of a pointy-top hex with the given size (circumradius). */
export function hexToPixel(h: Axial, size: number): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (h.q + h.r / 2);
  const y = size * 1.5 * h.r;
  return { x, y };
}

/** Six corner points of a pointy-top hex, clockwise from the top. */
export function hexCorners(h: Axial, size: number): Array<{ x: number; y: number }> {
  const c = hexToPixel(h, size);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: c.x + size * Math.cos(angle), y: c.y + size * Math.sin(angle) });
  }
  return out;
}

/** Offset (odd-r) grid → axial, used to enumerate a rectangular board. */
export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}
