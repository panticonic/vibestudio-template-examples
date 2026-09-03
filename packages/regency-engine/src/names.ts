import type { Rng } from "./rng.js";

const ONSETS = ["", "b", "br", "c", "cr", "d", "dr", "f", "g", "gr", "h", "k", "l", "m", "n", "p", "r", "s", "st", "t", "th", "v", "w", "y"];
const VOWELS = ["a", "e", "i", "o", "u", "ae", "ia", "ou", "ei"];
const CODAS = ["", "l", "n", "r", "s", "th", "m", "nd", "rn", "st", "ld", "sk"];
const PROVINCE_SUFFIX = ["mark", "wold", "dale", "moor", "fen", "shire", "holm", "ford", "hurst", "vale", "reach", "burn", "gate", "field", "ness"];
const REALM_SUFFIX = ["ia", "land", "mark", "heim", "ora", "avia", "enne", "eth"];

function syllable(rng: Rng, closed: boolean): string {
  return rng.pick(ONSETS) + rng.pick(VOWELS) + (closed ? rng.pick(CODAS) : "");
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function provinceName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = syllable(rng, rng.chance(0.4)) + (rng.chance(0.5) ? syllable(rng, false) : "");
    const name = capitalise(base + rng.pick(PROVINCE_SUFFIX));
    if (name.length <= 12 && !used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Province ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

export function realmName(rng: Rng, used: Set<string>): { name: string; adjective: string } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const stem = capitalise(syllable(rng, true) + (rng.chance(0.5) ? syllable(rng, false) : ""));
    const name = stem + rng.pick(REALM_SUFFIX);
    if (name.length <= 11 && !used.has(name)) {
      used.add(name);
      const adjective = name.endsWith("ia") ? name.slice(0, -2) + "ian" : name + "ish";
      return { name, adjective };
    }
  }
  const name = `Realm ${used.size + 1}`;
  used.add(name);
  return { name, adjective: name };
}

export const REALM_CHARACTERS = [
  "a mercantile republic of sea captains and counting-houses, slow to war and quick to bargain",
  "a martial highland kingdom that measures honour in captured banners",
  "an old and pious monarchy, obsessed with legitimacy and dynastic claims",
  "a restless federation of horse-lords whose word lasts exactly one season",
  "a cautious river principality that hoards grain and never fights alone",
  "an ambitious young duchy whose ruler believes the map is unfinished",
] as const;

export const REALM_COLORS = ["#c94f4f", "#3f7fbf", "#4f9a5a", "#b8862d", "#7a4fb0", "#2f8f8a"] as const;
export const PLAYER_COLOR = "#d8a63a";
