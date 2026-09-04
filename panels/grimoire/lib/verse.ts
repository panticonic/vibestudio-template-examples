/**
 * Small client-side helpers for the verse box. These do not decide anything:
 * the form gate lives in the engine and the world. They only show the player
 * the shape of what they are about to speak.
 */
export interface VerseShape {
  lines: string[];
  words: number;
  longestLine: number;
  /** A soft hint: "this reads as prose" when one unbroken line runs long. */
  hint: string | null;
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function countWords(line: string): number {
  return line.split(/\s+/).filter((w) => w.length > 0).length;
}

export function shapeOf(text: string): VerseShape {
  const lines = splitLines(text);
  const perLine = lines.map(countWords);
  const words = perLine.reduce((a, b) => a + b, 0);
  const longestLine = perLine.reduce((a, b) => Math.max(a, b), 0);
  let hint: string | null = null;
  if (lines.length === 1 && words > 18) hint = "this reads as prose; the circle hears verse. Break it into lines.";
  else if (longestLine > 16) hint = "a line runs long; the estate hears short lines best.";
  else if (lines.length > 12) hint = "twelve lines is the most the fire will hold.";
  return { lines, words, longestLine, hint };
}

/** Words that look like the estate's roots, for a little highlighting in the box. */
export function looksLikeRoot(word: string, roots: Set<string>): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  return roots.has(w);
}

/** Split a verse into tokens keeping punctuation attached, for the scrying page. */
export function tokens(line: string): string[] {
  return line.split(/(\s+)/).filter((t) => t.length > 0);
}
