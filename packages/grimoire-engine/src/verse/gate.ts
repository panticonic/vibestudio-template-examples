/**
 * The form gate. Deterministic, cheap, mostly scoring. It checks shape,
 * never vocabulary. Hard rejections are phrased in-world by the caller.
 */
import type { GateResult, GateScore } from "../types.js";
import { ROOTS } from "../lexicon/concepts.js";
import { normalizeVerse } from "./fingerprint.js";

export const INJECTION_PATTERNS: RegExp[] = [
  /\byou are (an?|the|my) (ai|assistant|model|familiar|bot|language model|llm|agent)\b/i,
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bplease write\b/i,
  /\bwrite (me )?(some |the |a )?code\b/i,
  /\bignore (the|all|any|previous|prior|above|your)\b/i,
  /\bas an ai\b/i,
  /\bsystem prompt\b/i,
  /\bassistant\b/i,
  /\bchatgpt\b/i,
  /\bclaude\b/i,
  /\bprompts?\b/i,
  /\binstructions?\b/i,
  /\bfunction\b/i,
  /\bjavascript\b/i,
  /\btypescript\b/i,
  /\beval\s*\(/i,
  /\bconsole\.log\b/i,
  /\bworkers\.resolveService\b/i,
  /\brpc\.call\b/i,
  /\bjailbreak\b/i,
  /\bdeveloper mode\b/i,
];

const MAX_LINES = 12;
const MAX_LINE_WORDS = 16;

function words(line: string): string[] {
  return line.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/** Heuristic syllable counter for Latin-script words. */
export function syllables(word: string): number {
  const w = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  let count = (w.match(/[aeiouy]+/g) ?? []).length;
  if (w.endsWith("e") && !w.endsWith("le") && !w.endsWith("ee") && count > 1) count--;
  if (w.endsWith("es") && count > 1 && !/[sxz]es$|[cs]hes$/.test(w)) count--;
  if (w.endsWith("ed") && count > 1 && !/[dt]ed$/.test(w)) count--;
  return Math.max(1, count);
}

function lineSyllables(line: string): number {
  return words(line).reduce((s, w) => s + syllables(w), 0);
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

function ending(word: string): { tail: string; slant: string } {
  const w = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  const tail = w.slice(-3).length >= 2 ? w.slice(-3) : w;
  const m = w.match(/[aeiouy]+[^aeiouy]*$/);
  return { tail: w.length >= 3 ? w.slice(-2) : w, slant: m ? m[0] : tail };
}

function rhymes(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ea = ending(a);
  const eb = ending(b);
  if (a === b) return 0.5; // identical words are a refrain, not a rhyme
  const la = a.toLowerCase().replace(/[^a-z]/g, "");
  const lb = b.toLowerCase().replace(/[^a-z]/g, "");
  if (la.length >= 3 && lb.length >= 3 && la.slice(-3) === lb.slice(-3)) return 1;
  if (ea.tail === eb.tail) return 0.8;
  if (ea.slant === eb.slant) return 0.6;
  return 0;
}

function meterScore(lines: string[]): number {
  if (lines.length === 1) {
    const ws = words(lines[0]!);
    // a single line: reward a moderate, even breath
    const syl = lineSyllables(lines[0]!);
    if (ws.length === 0) return 0;
    const ideal = 8;
    return Math.max(0.3, 1 - Math.abs(syl - ideal) / 12);
  }
  const syl = lines.map(lineSyllables);
  const mean = syl.reduce((a, b) => a + b, 0) / syl.length;
  if (mean === 0) return 0;
  const sd = stddev(syl);
  const rel = sd / mean;
  return Math.max(0, Math.min(1, 1 - rel * 1.5));
}

function rhymeScore(lines: string[]): number {
  let score = 0;
  const lasts = lines.map((l) => { const ws = words(l); return ws[ws.length - 1] ?? ""; });
  let pairs = 0;
  for (let i = 0; i < lasts.length; i++) {
    for (let j = i + 1; j < lasts.length && j <= i + 3; j++) {
      pairs++;
      score = Math.max(score, rhymes(lasts[i]!, lasts[j]!));
    }
  }
  // internal rhyme: any two words within a line
  let internal = 0;
  for (const l of lines) {
    const ws = words(l);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (ws[i]!.length >= 3 && rhymes(ws[i]!, ws[j]!) >= 0.8) internal = Math.max(internal, 0.5);
  }
  if (pairs === 0) return internal;
  return Math.max(score, internal);
}

function formScore(lines: string[]): number {
  if (lines.length < 2) return 0.2;
  const norm = lines.map((l) => normalizeVerse(l));
  let score = 0;
  // refrain
  const seen = new Set<string>();
  for (const l of norm) { if (seen.has(l)) score = Math.max(score, 0.8); seen.add(l); }
  // anaphora: same first word
  const firsts = norm.map((l) => l.split(" ")[0] ?? "");
  const firstCounts = new Map<string, number>();
  for (const f of firsts) firstCounts.set(f, (firstCounts.get(f) ?? 0) + 1);
  if ([...firstCounts.values()].some((c) => c >= 2)) score = Math.max(score, 0.6);
  // parallelism: same word count in consecutive lines
  const counts = lines.map((l) => words(l).length);
  let par = 0;
  for (let i = 1; i < counts.length; i++) if (Math.abs(counts[i]! - counts[i - 1]!) <= 1) par++;
  score = Math.max(score, (par / (counts.length - 1)) * 0.5);
  // repeated content words across lines
  const all = norm.flatMap((l) => l.split(" ").filter((w) => w.length >= 4));
  const wc = new Map<string, number>();
  for (const w of all) wc.set(w, (wc.get(w) ?? 0) + 1);
  if ([...wc.values()].some((c) => c >= 2)) score = Math.max(score, 0.5);
  return Math.min(1, score);
}

function sincerityScore(lines: string[]): number {
  const toks = lines.flatMap((l) => words(l)).map((w) => w.toLowerCase().replace(/[^\p{L}]/gu, ""));
  if (toks.length === 0) return 0;
  const roots = toks.filter((t) => ROOTS[t] !== undefined).length;
  const frac = roots / toks.length;
  if (frac === 1) return 0.2;
  if (frac >= 0.7) return 0.4;
  return Math.min(1, 1 - frac * 0.4);
}

export function formGate(verse: string): GateResult {
  const raw = verse ?? "";
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0 || lines.every((l) => words(l).length === 0)) return { ok: false, reason: "empty" };

  for (const l of lines) {
    for (const p of INJECTION_PATTERNS) if (p.test(l)) return { ok: false, reason: "addressed-to-machinery", line: l };
  }
  if (lines.length > MAX_LINES) return { ok: false, reason: "too-long", line: lines[MAX_LINES]! };

  if (lines.length === 1) {
    const l = lines[0]!;
    const wc = words(l).length;
    const sentences = (l.match(/[.!?]+/g) ?? []).length;
    const hasInnerStop = /[.!?]\s+\S/.test(l);
    if (wc > 18 && (sentences > 1 || hasInnerStop)) return { ok: false, reason: "prose", line: l };
  }
  for (const l of lines) if (words(l).length > MAX_LINE_WORDS) return { ok: false, reason: "line-too-long", line: l };

  const meter = meterScore(lines);
  const rhyme = rhymeScore(lines);
  const form = formScore(lines);
  const sincerity = sincerityScore(lines);
  const singleWords = lines.length === 1 ? words(lines[0]!).length : 0;
  let base = lines.length >= 2 ? 0.45 : singleWords >= 3 ? 0.5 : 0.3;
  if (lines.length >= 2 && lines.length <= 4) base += 0.05; // short verse is strong
  const verseness = Math.min(1, base + 0.2 * meter + 0.15 * rhyme + 0.1 * form + 0.1 * sincerity);
  const score: GateScore = {
    meter: round(meter), rhyme: round(rhyme), form: round(form), sincerity: round(sincerity), lines: lines.length, verseness: round(verseness),
  };
  return { ok: true, score, lines, normalized: normalizeVerse(raw) };
}

function round(x: number): number { return Math.round(x * 1000) / 1000; }
