/**
 * Resonance: fuzzy matching of a verse against the concept index.
 * Lexical first (roots, cues, stems), then fuzzy (edit distance, bigrams).
 * Never a grammar. Hidden from the player; scrying shows what was heard.
 */
import type { Inscription, Resonance, ResonanceEntry } from "../types.js";
import { CONCEPTS, ROOTS } from "./concepts.js";
import { findNames } from "./names.js";

export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

export function tokenizeWords(s: string): string[] {
  return foldText(s)
    .replace(/[^\p{L}\p{N}'\-]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean);
}

const STOPWORDS = new Set([
  // en
  "the", "and", "that", "this", "with", "from", "into", "onto", "over", "under", "your", "their", "them", "then", "than", "there", "here", "have", "has", "had", "will", "shall", "would", "could", "should", "what", "when", "where", "which", "while", "until", "upon", "unto", "let", "come", "comes", "make", "made", "shall", "thee", "thou", "thy", "thine", "very", "just", "only", "also", "again", "still", "well", "some", "such", "each", "every", "before", "after", "about", "above", "below", "between", "through", "though", "because", "being", "been", "were", "was", "are", "not", "nor", "but", "for", "its", "our", "out", "off", "all", "any", "may", "might", "must", "does", "did", "how", "who", "whom", "whose", "why", "yet", "too", "own",
  // de
  "und", "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "ist", "sind", "war", "waren", "wird", "werden", "nicht", "mit", "von", "zum", "zur", "auf", "aus", "bei", "nach", "über", "uber", "unter", "durch", "für", "fur", "dass", "wenn", "dann", "doch", "noch", "auch", "sich", "ihr", "ihre", "sein", "seine", "mein", "meine", "dein", "deine", "mach", "mache", "lass", "lasse", "soll", "sollen", "kann", "können", "konnen", "wie", "was", "wer", "wo", "aber", "oder", "als", "bis", "vor", "hin", "her",
  // fr
  "les", "des", "une", "est", "sont", "que", "qui", "quoi", "dans", "sur", "sous", "pour", "par", "avec", "sans", "vers", "chez", "mais", "donc", "car", "comme", "cette", "ces", "son", "ses", "leur", "leurs", "mon", "mes", "ton", "tes", "nos", "vos", "fait", "fais", "faire", "soit", "sois", "laisse", "viens", "vient", "tout", "tous", "toute", "toutes", "elle", "elles", "ils", "nous", "vous", "moi", "toi", "lui", "aux", "plus", "moins", "très", "tres",
  // es
  "los", "las", "una", "unos", "unas", "del", "por", "para", "con", "sin", "sobre", "bajo", "entre", "hacia", "hasta", "desde", "pero", "sino", "como", "cuando", "donde", "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "aquel", "aquella", "que", "quien", "cual", "haz", "hace", "hacer", "sea", "deja", "ven", "viene", "todo", "todos", "toda", "todas", "ella", "ellos", "ellas", "nosotros", "vosotros", "usted", "muy", "mas", "menos", "ser", "estar", "hay",
  // it / nl / la bits
  "gli", "della", "dello", "delle", "degli", "nel", "nella", "sul", "sulla", "per", "con", "senza", "che", "chi", "come", "quando", "dove", "questo", "questa", "quello", "quella", "het", "een", "van", "voor", "met", "zonder", "naar", "door", "dat", "dit", "die", "deze", "niet", "wel", "aan", "bij", "tot", "als", "dan", "maar", "ook", "nog", "zijn", "haar", "hun", "mijn", "jouw", "laat", "kom", "komt", "maak", "maakt",
]);

const SUFFIXES = ["ements", "ement", "ations", "ation", "ingly", "ings", "ing", "ness", "ment", "edly", "ies", "ied", "ers", "est", "ed", "es", "ly", "er", "s", "en", "e", "n", "ent", "ant", "ir", "ar", "os", "as", "és", "ez", "er", "re", "ir", "ere", "are", "ire", "te", "de"];

export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  for (const suf of SUFFIXES) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  // collapse doubled final consonant (running → runn → run)
  if (w.length > 3 && w[w.length - 1] === w[w.length - 2] && !"aeiou".includes(w[w.length - 1]!)) w = w.slice(0, -1);
  return w;
}

/** Damerau-Levenshtein (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[m]![n]!;
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

export function diceBigram(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

interface CueEntry { concept: string; cue: string; folded: string; stem: string; words: string[] }

const CUE_INDEX: CueEntry[] = [];
const PHRASE_CUES: CueEntry[] = [];
for (const cpt of CONCEPTS) {
  for (const cue of cpt.cues) {
    const folded = foldText(cue).replace(/[^\p{L}\p{N}' -]+/gu, "").trim();
    const words = folded.split(/\s+/).filter(Boolean);
    const entry: CueEntry = { concept: cpt.id, cue, folded, stem: stem(folded), words };
    if (words.length > 1) PHRASE_CUES.push(entry); else CUE_INDEX.push(entry);
  }
}
const EXACT: Map<string, string[]> = new Map();
const STEMS: Map<string, string[]> = new Map();
for (const e of CUE_INDEX) {
  const ex = EXACT.get(e.folded) ?? [];
  if (!ex.includes(e.concept)) ex.push(e.concept);
  EXACT.set(e.folded, ex);
  const st = STEMS.get(e.stem) ?? [];
  if (!st.includes(e.concept)) st.push(e.concept);
  STEMS.set(e.stem, st);
}

const ROOT_LIST = Object.keys(ROOTS).sort((a, b) => b.length - a.length);

/** Try to read a token as a compound or intensive of roots. Returns concept ids in order. */
export function readRootWord(token: string): { concepts: string[]; kind: "root" | "compound" | "intensive" } | null {
  if (ROOTS[token]) return { concepts: [ROOTS[token]!], kind: "root" };
  // intensive: first syllable doubled
  for (const r of ROOT_LIST) {
    if (token.length > r.length && token.endsWith(r)) {
      const head = token.slice(0, token.length - r.length);
      if (r.startsWith(head) && head.length >= 2) return { concepts: [ROOTS[r]!, "more"], kind: "intensive" };
    }
  }
  // compound of two roots (modifier + head), optionally with a shared seam vowel elided
  for (const a of ROOT_LIST) {
    if (!token.startsWith(a) || token.length <= a.length) continue;
    const rest = token.slice(a.length);
    if (ROOTS[rest]) return { concepts: [ROOTS[a]!, ROOTS[rest]!], kind: "compound" };
    const last = a[a.length - 1]!;
    if ("aeiou".includes(last) && ROOTS[last + rest]) return { concepts: [ROOTS[a]!, ROOTS[last + rest]!], kind: "compound" };
  }
  return null;
}

export interface ResonateOptions { threshold?: number; unknownMultiplier?: number }

export function resonate(
  verse: string,
  known: { words: string[]; names: string[]; inscriptions: Inscription[] },
  opts: ResonateOptions = {},
): Resonance {
  const threshold = opts.threshold ?? 0.55;
  const unknownMul = opts.unknownMultiplier ?? 0.65;
  const knownSet = new Set(known.words);
  const tokens = tokenizeWords(verse);
  const names = findNames(verse, known.names);
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  const best: Map<string, ResonanceEntry> = new Map();
  const matched = new Set<number>();
  const inscriptionByWord = new Map(known.inscriptions.map((i) => [foldText(i.word), i]));

  const offer = (concept: string, conf: number, fromWord: string, viaRoot: boolean) => {
    const scaled = knownSet.has(concept) || viaRoot ? conf : conf * unknownMul;
    const prev = best.get(concept);
    if (!prev || prev.confidence < scaled) best.set(concept, { concept, confidence: Math.round(scaled * 1000) / 1000, fromWord, viaRoot });
  };

  // phrases first (multi-word cues)
  const joined = tokens.join(" ");
  for (const p of PHRASE_CUES) {
    const idx = (" " + joined + " ").indexOf(" " + p.folded + " ");
    if (idx >= 0) {
      offer(p.concept, 0.9, p.cue, false);
      const before = (" " + joined + " ").slice(0, idx).trim();
      const start = before.length ? before.split(" ").length : 0;
      for (let k = 0; k < p.words.length; k++) matched.add(start + k);
    }
  }

  tokens.forEach((tok, i) => {
    if (nameSet.has(tok)) { matched.add(i); return; }
    const ins = inscriptionByWord.get(tok);
    if (ins) { offer(ins.concept, 0.85, tok, true); matched.add(i); return; }
    const root = readRootWord(tok);
    if (root) {
      const conf = root.kind === "root" ? 1.0 : 0.95;
      for (const cpt of root.concepts) offer(cpt, conf, tok, true);
      matched.add(i);
      return;
    }
    const exact = EXACT.get(tok);
    if (exact) { for (const cpt of exact) offer(cpt, 0.9, tok, false); matched.add(i); return; }
    const st = stem(tok);
    const stemmed = STEMS.get(st);
    if (stemmed && tok.length >= 3) { for (const cpt of stemmed) offer(cpt, 0.8, tok, false); matched.add(i); return; }
    if (tok.length >= 5) {
      let hit = false;
      for (const e of CUE_INDEX) {
        if (e.folded.length < 5) continue;
        if (Math.abs(e.folded.length - tok.length) > 2) continue;
        if (editDistance(tok, e.folded) <= 1 || diceBigram(tok, e.folded) >= 0.75) { offer(e.concept, 0.6, tok, false); hit = true; }
      }
      if (hit) { matched.add(i); return; }
    }
  });

  const unknown: string[] = [];
  tokens.forEach((tok, i) => {
    if (matched.has(i)) return;
    if (tok.length < 4) return;
    if (STOPWORDS.has(tok)) return;
    if (/^\d+$/.test(tok)) return;
    if (!unknown.includes(tok)) unknown.push(tok);
  });

  const entries = [...best.values()].sort((a, b) => b.confidence - a.confidence || a.concept.localeCompare(b.concept));
  const earned = entries.filter((e) => e.confidence >= threshold).map((e) => e.concept);
  const top = entries.slice(0, 3);
  const mean = top.length ? top.reduce((s, e) => s + e.confidence, 0) / top.length : 0;
  const strength = Math.round(mean * Math.min(1, earned.length / 2) * 1000) / 1000;
  return { entries, unknown, names, earned, strength };
}

export function conceptsOf(resonance: Resonance): string[] {
  return resonance.entries.map((e) => e.concept);
}
