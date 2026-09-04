/**
 * Verse normalisation and fingerprints for the spell cache.
 */

export function normalizeVerse(verse: string): string {
  const lines = verse
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\p{L}\p{N}\s'\-]+/gu, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
  return lines.join(" / ");
}

/** FNV-1a 32-bit, hex. */
export function fingerprint(normalized: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function tokens(s: string): string[] {
  return s.split(/[\s/]+/).filter((t) => t.length > 0);
}

function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
  return dp[m]![n]!;
}

/** 0..1: token Dice coefficient plus an order bonus from the longest common subsequence. */
export function verseSimilarity(a: string, b: string): number {
  const A = tokens(normalizeVerse(a));
  const B = tokens(normalizeVerse(b));
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of A) counts.set(t, (counts.get(t) ?? 0) + 1);
  let inter = 0;
  for (const t of B) {
    const c = counts.get(t) ?? 0;
    if (c > 0) { inter++; counts.set(t, c - 1); }
  }
  const dice = (2 * inter) / (A.length + B.length);
  const order = lcsLength(A, B) / Math.max(A.length, B.length);
  return Math.round((0.8 * dice + 0.2 * order) * 1000) / 1000;
}
