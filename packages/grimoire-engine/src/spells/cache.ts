/**
 * The spell cache: a spell you have cast is yours. Exact recasts and
 * same-class variations take the fast path with no model turn.
 */
import type { Intent, Resonance, SpellRecord } from "../types.js";
import { nameKind } from "../lexicon/names.js";
import { fingerprint, normalizeVerse, verseSimilarity } from "../verse/fingerprint.js";

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, hundred: 100 };

function numeric(tok: string): number | null {
  if (/^\d+$/.test(tok)) return Number(tok);
  return NUMBER_WORDS[tok] ?? null;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

export function matchCache(
  verse: string,
  resonance: Resonance,
  candidates: SpellRecord[],
): { spell: SpellRecord; kind: "exact" | "variation"; substitutions: Record<string, string | number> } | null {
  const normalized = normalizeVerse(verse);
  const fp = fingerprint(normalized);
  const cast = candidates.filter((c) => c.status === "cast");
  for (const c of cast) if (c.fingerprint === fp) return { spell: c, kind: "exact", substitutions: {} };
  const earned = [...new Set([...resonance.earned, ...resonance.names])];
  for (const c of cast) {
    if (verseSimilarity(normalized, c.verseNormalized) >= 0.92 && sameSet(earned, c.earned)) {
      return { spell: c, kind: "exact", substitutions: {} };
    }
  }
  const toks = normalized.split(" ").filter((t) => t !== "/");
  for (const c of cast) {
    const ctoks = c.verseNormalized.split(" ").filter((t) => t !== "/");
    if (ctoks.length !== toks.length) continue;
    const diffs: Array<[string, string]> = [];
    for (let i = 0; i < toks.length; i++) if (toks[i] !== ctoks[i]) diffs.push([ctoks[i]!, toks[i]!]);
    if (diffs.length !== 1) continue;
    const [oldTok, newTok] = diffs[0]!;
    const oldKind = nameKind(oldTok);
    const newKind = nameKind(newTok);
    if (oldKind && newKind && oldKind === newKind) {
      const oldName = c.resonance.names.find((n) => n.toLowerCase() === oldTok) ?? oldTok;
      const newName = resonance.names.find((n) => n.toLowerCase() === newTok) ?? newTok;
      return { spell: c, kind: "variation", substitutions: { [oldName]: newName } };
    }
    const oldN = numeric(oldTok);
    const newN = numeric(newTok);
    if (oldN !== null && newN !== null) return { spell: c, kind: "variation", substitutions: { [oldTok]: newN } };
  }
  return null;
}

function replaceAll(s: string, subs: Record<string, string | number>): string {
  let out = s;
  for (const [k, v] of Object.entries(subs)) out = out.replace(new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), String(v));
  return out;
}

export function applySubstitutions(intent: Intent, subs: Record<string, string | number>): Intent {
  const next: Intent = JSON.parse(JSON.stringify(intent)) as Intent;
  next.subject.ref = replaceAll(next.subject.ref, subs);
  next.effect = replaceAll(next.effect, subs);
  if (next.binding) next.binding.condition = replaceAll(next.binding.condition, subs);
  if (next.quantity) {
    for (const [k, v] of Object.entries(subs)) {
      if (typeof v === "number" && (String(next.quantity.value) === k || NUMBER_WORDS[k] === next.quantity.value)) next.quantity.value = v;
    }
  }
  next.concepts = next.concepts.map((c) => ({ ...c, fromWord: replaceAll(c.fromWord, subs) }));
  return next;
}
