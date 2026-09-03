/**
 * People. Ministers, sovereigns and ambassadors are generated with a name, a
 * house, an ambition and a rival, and their standing moves with the fortunes
 * of their cause. The heir grows up in the Regent's shadow and judges them at
 * the end.
 */
import type { Rng } from "./rng.js";
import type { Ambition, Courtier, GameState, Heir, HeirTrait, RealmId } from "./types.js";

const GIVEN = ["Aldric", "Berenice", "Cassian", "Dorotea", "Emeric", "Fenna", "Godric", "Hesper", "Isolde", "Joris", "Katrin", "Lucan", "Maud", "Nikolaus", "Ottilie", "Perrin", "Quintus", "Rosalind", "Sigrun", "Tobias", "Ursel", "Valen", "Wenna", "Ysolt"];
const HOUSES = ["Ashcombe", "Blackmere", "Carrow", "Dunmore", "Ellsworth", "Fairhollow", "Greymantle", "Hollins", "Ironwood", "Kestrel", "Lindqvist", "Marrow", "Northgale", "Oakhurst", "Pellan", "Quillon", "Ravensby", "Stormont", "Thornebury", "Vane", "Wexley", "Yarrow"];

const AMBITION_LINES: Record<Ambition, string> = {
  glory: "hungry for banners and a name that outlives the reign",
  gold: "counts every coin twice and trusts a full granary over a full church",
  order: "believes a realm is a ledger of obedience and hates a riot more than a war",
  peace: "would sooner lose a province than a decade of peace",
  faith: "measures the realm by its shrines and the Regent by their piety",
  power: "serves the Regent loyally, for now, and keeps a list of who serves the Regent less",
};

const MINISTER_AMBITIONS: Record<string, Ambition[]> = {
  herald: ["order", "power", "peace"],
  chancellor: ["order", "power", "faith"],
  treasurer: ["gold", "order", "peace"],
  marshal: ["glory", "power", "order"],
  envoy: ["peace", "power", "gold"],
};

export function makeCourtier(rng: Rng, role: string, ambitions: Ambition[], used: Set<string>): Courtier {
  let name = "";
  for (let i = 0; i < 40; i++) {
    const candidate = `${rng.pick(GIVEN)} ${rng.pick(HOUSES)}`;
    if (!used.has(candidate)) {
      name = candidate;
      break;
    }
  }
  if (!name) name = `${rng.pick(GIVEN)} of ${role}`;
  used.add(name);
  const ambition = rng.pick(ambitions);
  return {
    role,
    name,
    house: name.split(" ").slice(-1)[0]!,
    ambition,
    standing: 50,
    rival: null,
    portrait: rng.int(1_000_000),
    temperament: AMBITION_LINES[ambition],
  };
}

/** Generate the player's council, one sovereign and one ambassador per rival, and the heir. */
export function generateCourt(rng: Rng, realmIds: RealmId[], playerRealm: RealmId): { court: Record<string, Courtier>; heir: Heir } {
  const used = new Set<string>();
  const court: Record<string, Courtier> = {};
  for (const role of Object.keys(MINISTER_AMBITIONS)) court[role] = makeCourtier(rng, role, MINISTER_AMBITIONS[role]!, used);
  const ministers = Object.keys(MINISTER_AMBITIONS).filter((r) => r !== "herald");
  for (const role of ministers) {
    const others = ministers.filter((r) => r !== role && court[r]!.rival !== role);
    court[role]!.rival = rng.chance(0.6) && others.length ? rng.pick(others) : null;
  }
  for (const realm of realmIds) {
    if (realm === playerRealm) continue;
    court[`sovereign:${realm}`] = makeCourtier(rng, `sovereign:${realm}`, ["glory", "gold", "power", "faith", "peace"], used);
    court[`ambassador:${realm}`] = makeCourtier(rng, `ambassador:${realm}`, ["peace", "power", "gold"], used);
  }
  const heir: Heir = {
    name: rng.pick(GIVEN),
    ageAtStart: 6 + rng.int(4),
    traits: { bold: 0, cautious: 0, just: 0, greedy: 0, pious: 0 },
    tutor: null,
    verdict: null,
  };
  return { court, heir };
}

export function moodOf(standing: number): string {
  if (standing >= 75) return "favoured";
  if (standing >= 55) return "content";
  if (standing >= 40) return "uneasy";
  if (standing >= 25) return "slighted";
  return "embittered";
}

export function bumpStanding(state: GameState, role: string, delta: number): void {
  const c = state.court[role];
  if (!c) return;
  c.standing = Math.max(0, Math.min(100, Math.round((c.standing + delta) * 10) / 10));
}

export function bumpTrait(state: GameState, trait: HeirTrait, delta: number): void {
  state.heir.traits[trait] = Math.round((state.heir.traits[trait] + delta) * 10) / 10;
}

export function dominantTraits(heir: Heir): HeirTrait[] {
  return [...(Object.keys(heir.traits) as HeirTrait[])].sort((a, b) => heir.traits[b] - heir.traits[a]).filter((t) => heir.traits[t] > 0).slice(0, 2);
}

export function heirAge(state: GameState): number {
  return state.heir.ageAtStart + Math.floor(state.season / 4);
}

/** The heir's verdict, written when the game ends. */
export function heirVerdict(state: GameState, kind: "victory" | "defeat", title: string): string {
  const heir = state.heir;
  const traits = dominantTraits(heir);
  const player = state.realms[state.playerRealm]!;
  const regent = state.regent;
  const lines: string[] = [];
  const opening = kind === "victory" ? `${heir.name}, now of age, receives the Regent in the hall.` : `${heir.name} learns of the Regent's fall from a tutor's whisper.`;
  lines.push(opening);
  const voice: Record<HeirTrait, string> = {
    bold: "“You taught me that a crown is taken, not inherited. I will remember the banners.”",
    cautious: "“You taught me to count the cost of every march. I will remember the treaties you did not sign.”",
    just: "“You taught me that bread comes before glory. The people will remember your doles before your wars.”",
    greedy: "“You taught me that gold is the realm's blood. I fear I learned it too well.”",
    pious: "“You taught me to look to the shrines before the sword. The clergy will bless your name.”",
  };
  for (const t of traits) lines.push(voice[t]);
  if (traits.length === 0) lines.push("“You left me no strong lesson, only a realm to learn from.”");
  if (regent.reputation >= 70) lines.push(`Of the Regent's own name the court says only good things; the reputation of ${regent.name} (${Math.round(regent.reputation)}) passes to the heir like a second crown.`);
  else if (regent.reputation <= 35) lines.push(`Of the Regent's own name little kind is said; the heir inherits a whispered reputation (${Math.round(regent.reputation)}) along with the throne.`);
  else lines.push(`The Regent's name (${Math.round(regent.reputation)}) is neither cursed nor sung; it is remembered.`);
  if (heir.tutor) lines.push(`${heir.name}'s tutor, ${state.court[heir.tutor]?.name ?? heir.tutor}, stands at the heir's shoulder.`);
  lines.push(kind === "victory" ? `${title}: the Regency of ${player.name} ends with prestige ${Math.round(player.prestige)} and legitimacy ${Math.round(player.legitimacy)}.` : `${title}: the Regency of ${player.name} is over.`);
  return lines.join(" ");
}
