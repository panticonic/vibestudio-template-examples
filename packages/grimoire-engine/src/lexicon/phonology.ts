/**
 * The estate's sound. Consonants m n l r s th v h k t d b; vowels a e i o u
 * plus long ae, ou. One to three syllables, stress on the first. Roots
 * compound by juxtaposition, head last. Intensives by reduplication.
 */

const CONSONANTS = ["th", "m", "n", "l", "r", "s", "v", "h", "k", "t", "d", "b"];
const VOWELS = ["ae", "ou", "a", "e", "i", "o", "u"];

function tokenize(word: string): string[] | null {
  const w = word.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    const hit = [...CONSONANTS, ...VOWELS].find((p) => w.startsWith(p, i));
    if (!hit) return null;
    out.push(hit);
    i += hit.length;
  }
  return out;
}

export function isWellFormedRoot(word: string): boolean {
  const toks = tokenize(word);
  if (!toks || toks.length === 0) return false;
  const vowels = toks.filter((t) => VOWELS.includes(t)).length;
  if (vowels < 1 || vowels > 3) return false;
  // no two vowels adjacent (long vowels are single tokens), no three consonants
  let cons = 0;
  let prevVowel = false;
  for (const t of toks) {
    const isV = VOWELS.includes(t);
    if (isV && prevVowel) return false;
    cons = isV ? 0 : cons + 1;
    if (cons > 2) return false;
    prevVowel = isV;
  }
  return true;
}

/** Compound: modifier first, head last. `vel` + `ithe` → `velithe`. */
export function compound(a: string, b: string): string {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  // elide a doubled vowel at the seam
  const last = x[x.length - 1]!;
  const first = y[0]!;
  if ("aeiou".includes(last) && last === first) return x + y.slice(1);
  return x + y;
}

/** Intensive: reduplicate the first syllable. `hama` → `hahama`. */
export function intensive(root: string): string {
  const toks = tokenize(root);
  if (!toks) return root + root;
  let syl = "";
  let sawVowel = false;
  for (const t of toks) {
    syl += t;
    if (VOWELS.includes(t)) { sawVowel = true; break; }
  }
  if (!sawVowel) return root + root;
  return syl + root;
}

/** The Moor's register: the same root said with reversed stress — the syllables reversed. `hama` → `amah`. */
export function moorRegister(root: string): string {
  const toks = tokenize(root);
  if (!toks) return root.split("").reverse().join("");
  // split into syllables (consonant cluster + vowel)
  const syls: string[] = [];
  let cur = "";
  for (const t of toks) {
    cur += t;
    if (VOWELS.includes(t)) { syls.push(cur); cur = ""; }
  }
  if (cur) {
    if (syls.length) syls[syls.length - 1] += cur; else syls.push(cur);
  }
  return syls.map((s) => s.split("").reverse().join("")).reverse().join("");
}
