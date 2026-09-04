/**
 * Seeded RNG (xmur3 hash → mulberry32). Deterministic, forkable by label so
 * subsystems draw from independent streams without affecting each other.
 */
export interface Rng {
  next(): number;
  int(n: number): number;
  pick<T>(a: T[]): T;
  fork(label: string): Rng;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): Rng {
  const gen = mulberry32(xmur3(seed)());
  const rng: Rng = {
    next: () => gen(),
    int: (n) => (n <= 0 ? 0 : Math.floor(gen() * n)),
    pick: <T>(a: T[]): T => a[Math.floor(gen() * a.length)]!,
    fork: (label) => makeRng(`${seed}::${label}`),
  };
  return rng;
}

/** Stable hash of a string to a non-negative integer (for per-tick per-cell jitter). */
export function hashInt(s: string): number {
  return xmur3(s)();
}
