/**
 * True names: the deep tongue's nouns. Found, not learned.
 */
import type { TrueName } from "../types.js";

function n(name: string, meaning: string, kind: TrueName["kind"], ref: string): TrueName {
  return { name, meaning, kind, ref };
}

export const TRUE_NAMES: TrueName[] = [
  // spirits
  n("Hamanith", "heat within", "spirit", "hearth"),
  n("Velharan", "the flow that holds", "spirit", "river"),
  n("Thesaurin", "the kept quenching", "spirit", "library"),
  n("Hahamadath", "great heat that breaks", "spirit", "foundry"),
  n("Doranvel", "stone and flow", "spirit", "mill"),
  n("Tantanoes", "the many dusks", "spirit", "bell"),
  n("Lumevitre", "light held", "spirit", "glass"),
  n("Saelolath", "all growth beyond", "spirit", "orchard"),
  n("Morithedor", "cold rot in stone", "spirit", "deep"),
  n("Ossnem", "bone named", "spirit", "boneyard"),
  n("Norael", "north-all", "spirit", "ridge"),
  n("Aenithil", "the one who sits between", "spirit", "familiar"),
  // golems
  n("Toll", "the hauler", "golem", "Toll"),
  n("Wren", "the tender", "golem", "Wren"),
  n("Sedge", "the reed-sleeper", "golem", "Sedge"),
  n("Ash", "the foundry's", "golem", "Ash"),
  n("Warden", "the master's guard", "golem", "Warden"),
  ...Array.from({ length: 8 }, (_, i) => n(`Corwen-${i + 1}`, `the ${i + 1}${["st", "nd", "rd"][i] ?? "th"} of Corwen's nine`, "golem", `Corwen-${i + 1}`)),
  n("Corwen-Bone", "the ninth, of bone", "golem", "Corwen-Bone"),
  // places
  n("weir", "where the river is governed", "place", "weir"),
  n("wheel", "the mill's heart", "place", "wheel"),
  n("grate", "where the river leaves", "place", "grate"),
  n("furnace", "the foundry's mouth", "place", "furnace"),
  n("bell", "the estate's time", "place", "bell"),
  n("oldest-apple", "the Orchard's anchor", "place", "oldest-apple"),
  n("sealed-gallery", "the deep's door", "place", "sealed-gallery"),
  ...Array.from({ length: 5 }, (_, i) => n(`cairn-${i + 1}`, `the ${i + 1}${["st", "nd", "rd"][i] ?? "th"} cairn on the ridge`, "place", `cairn-${i + 1}`)),
  n("warm-grave", "the grave that is warm", "place", "warm-grave"),
  n("roof", "the glassworks' fallen roof", "place", "roof"),
  n("gate", "the gate in Ilvane's wall", "place", "gate"),
  n("hearth", "the fire at the centre", "place", "hearth"),
  n("orchard-sluice", "the orchard's water", "place", "orchard-sluice"),
  n("library-sluice", "the library's water", "place", "library-sluice"),
  n("cold-sluice", "the cold house's water", "place", "cold-sluice"),
  n("hot-sluice", "the hot house's water", "place", "hot-sluice"),
  n("mill-sluice", "the mill's water", "place", "mill-sluice"),
  n("observatory-door", "the door locked from inside", "place", "observatory-door"),
  // the estate
  n("Velhamanithael", "the flow, the heat within, all of it", "estate", "estate"),
];

const BY_LOWER: Record<string, TrueName> = Object.fromEntries(TRUE_NAMES.map((t) => [t.name.toLowerCase(), t]));

export function nameKind(name: string): TrueName["kind"] | null {
  return BY_LOWER[name.toLowerCase()]?.kind ?? null;
}

export function trueName(name: string): TrueName | null {
  return BY_LOWER[name.toLowerCase()] ?? null;
}

/**
 * True names present in the verse. Golem and place names are written on the
 * things and are always recognisable; spirit, estate and person names must be
 * in `known`.
 */
export function findNames(verse: string, known: string[]): string[] {
  const knownLower = new Set(known.map((k) => k.toLowerCase()));
  const tokens = verse
    .replace(/[^\p{L}\p{N}\-']+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""));
  const out: string[] = [];
  for (const raw of tokens) {
    const tok = raw.toLowerCase();
    const tn = BY_LOWER[tok];
    if (!tn) continue;
    // Golem and place names are written on the things, but they are proper nouns: "Ash" the golem, not "ash" the reagent.
    const capitalised = raw[0] !== undefined && raw[0] !== raw[0]!.toLowerCase();
    const always = (tn.kind === "golem" || tn.kind === "place") && capitalised;
    if (always || knownLower.has(tok)) {
      if (!out.includes(tn.name)) out.push(tn.name);
    }
  }
  return out;
}
