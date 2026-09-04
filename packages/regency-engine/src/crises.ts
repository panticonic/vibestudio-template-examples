/**
 * Crises: choices put to the Regent. Each is generated from the state with
 * concrete provinces and people, offers two or three engine-backed options,
 * and takes its default if the Regent lets the season close without deciding.
 */
import type { Rng } from "./rng.js";
import { armiesIn, realmProvinces, realmStrength, atWar, hasClaim, livingRealms } from "./state.js";
import { NEUTRAL, REBELS, type Crisis, type CrisisOption, type GameState, type RealmId } from "./types.js";

type Maker = (state: GameState, rng: Rng) => Omit<Crisis, "id" | "season" | "chosen" | "decidedBy"> | null;

const pick = <T,>(rng: Rng, items: T[]): T | undefined => (items.length ? items[rng.int(items.length)] : undefined);

const MAKERS: Record<string, Maker> = {
  plague: (state, rng) => {
    const p = pick(rng, realmProvinces(state, state.playerRealm).filter((x) => x.population > 10));
    if (!p) return null;
    return {
      kind: "plague",
      title: `Sickness in ${p.name}`,
      text: `A sweating sickness has taken hold in ${p.name}. The physicians want the roads closed and the markets shut; the merchants say a closed town is a dead town.`,
      realm: state.playerRealm,
      province: p.id,
      options: [
        { id: "quarantine", label: "Close the roads", text: "Trade stops, the sickness does not spread, the burghers grumble.", adviser: "chancellor", effects: [{ kind: "population", province: p.id, factor: 0.96 }, { kind: "estate", estate: "burghers", amount: -6 }, { kind: "heir", trait: "cautious", amount: 1 }] },
        { id: "physicians", label: "Pay the physicians", text: "Forty gold buys herbs, beds and burials. The people remember.", adviser: "treasurer", effects: [{ kind: "treasury", amount: -40 }, { kind: "population", province: p.id, factor: 0.98 }, { kind: "estate", estate: "peasants", amount: 5 }, { kind: "heir", trait: "just", amount: 1 }, { kind: "reputation", amount: 3 }] },
        { id: "ignore", label: "Let it run its course", text: "Cheap, and remembered.", effects: [{ kind: "population", province: p.id, factor: 0.88 }, { kind: "unrest", province: p.id, amount: 15 }, { kind: "estate", estate: "peasants", amount: -8 }, { kind: "reputation", amount: -5 }] },
      ],
      defaultOption: "ignore",
    };
  },
  harvest: (state, rng) => {
    const p = pick(rng, realmProvinces(state, state.playerRealm).filter((x) => x.fertility >= 3));
    if (!p) return null;
    return {
      kind: "harvest",
      title: `A golden harvest in ${p.name}`,
      text: `The fields of ${p.name} have yielded twice their measure. The Treasurer wants it sold while prices hold; the Chancellor wants it in the granaries; the clergy want a tithe of thanks.`,
      realm: state.playerRealm,
      province: p.id,
      options: [
        { id: "sell", label: "Sell the surplus", text: "+30 gold now.", adviser: "treasurer", effects: [{ kind: "treasury", amount: 30 }, { kind: "heir", trait: "greedy", amount: 1 }] },
        { id: "store", label: "Fill the granaries", text: "Every granary in the realm gains ten measures.", adviser: "chancellor", effects: [{ kind: "granary", province: "all", amount: 10 }, { kind: "estate", estate: "peasants", amount: 3 }, { kind: "heir", trait: "cautious", amount: 1 }] },
        { id: "tithe", label: "A feast of thanksgiving", text: "The shrines and the people share it.", effects: [{ kind: "estate", estate: "clergy", amount: 6 }, { kind: "estate", estate: "peasants", amount: 4 }, { kind: "unrest", province: "all", amount: -5 }, { kind: "heir", trait: "pious", amount: 1 }] },
      ],
      defaultOption: "store",
    };
  },
  defection: (state, rng) => {
    const border = realmProvinces(state, state.playerRealm).filter((p) => !p.capitalOf && p.neighbors.some((n) => state.provinces[n]!.owner !== state.playerRealm && state.provinces[n]!.owner !== NEUTRAL && state.provinces[n]!.owner !== REBELS));
    const p = pick(rng, border);
    if (!p) return null;
    const neighbour = p.neighbors.map((n) => state.provinces[n]!).find((n) => n.owner !== state.playerRealm && n.owner in state.realms)!;
    return {
      kind: "defection",
      title: `The lord of ${p.name} looks abroad`,
      text: `Lord ${p.name.replace(/(mark|wold|dale|moor|fen|shire|holm|ford|hurst|vale|reach|burn|gate|field|ness)$/, "")} has been seen at the court of ${state.realms[neighbour.owner]!.name}. He wants his taxes halved and his son at the heir's table, or he will take his lands with him.`,
      realm: state.playerRealm,
      province: p.id,
      options: [
        { id: "grant", label: "Grant his terms", text: "The province is calm; the other lords notice.", adviser: "chancellor", effects: [{ kind: "unrest", province: p.id, amount: -25 }, { kind: "estate", estate: "nobles", amount: 4 }, { kind: "treasury", amount: -15 }, { kind: "heir", trait: "cautious", amount: 1 }] },
        { id: "garrison", label: "Send the guard", text: "Two levy companies hold the province; the lord sulks.", adviser: "marshal", effects: [{ kind: "army", province: p.id, unit: "levy", companies: 2 }, { kind: "unrest", province: p.id, amount: 10 }, { kind: "estate", estate: "nobles", amount: -4 }, { kind: "heir", trait: "bold", amount: 1 }] },
        { id: "refuse", label: "Refuse him", text: "He may make good on the threat.", effects: [{ kind: "unrest", province: p.id, amount: 30 }, { kind: "relation", realm: neighbour.owner, amount: -10 }, { kind: "reputation", amount: 2 }] },
      ],
      defaultOption: "refuse",
    };
  },
  claimant: (state, rng) => {
    const rival = pick(rng, livingRealms(state).filter((r) => r !== state.playerRealm && !atWar(state, state.playerRealm, r)));
    if (!rival) return null;
    return {
      kind: "claimant",
      title: "A claimant returns",
      text: `A man calling himself the old king's natural son has appeared at the court of ${state.realms[rival]!.name}, and ${state.realms[rival]!.name} has not sent him away. Half the nobles find the story convenient.`,
      realm: state.playerRealm,
      options: [
        { id: "buy", label: "Buy his silence", text: "Sixty gold and a manor abroad.", adviser: "treasurer", effects: [{ kind: "treasury", amount: -60 }, { kind: "estate", estate: "nobles", amount: 3 }, { kind: "heir", trait: "cautious", amount: 1 }] },
        { id: "denounce", label: "Denounce him from the shrines", text: "The clergy earn their tithes.", adviser: "chancellor", effects: [{ kind: "estate", estate: "clergy", amount: 5 }, { kind: "estate", estate: "nobles", amount: -3 }, { kind: "relation", realm: rival, amount: -15 }, { kind: "heir", trait: "pious", amount: 1 }] },
        { id: "demand", label: "Demand he be handed over", text: `${state.realms[rival]!.name} will not like it.`, adviser: "envoy", effects: [{ kind: "relation", realm: rival, amount: -25 }, { kind: "estate", estate: "nobles", amount: 4 }, { kind: "reputation", amount: 4 }, { kind: "heir", trait: "bold", amount: 1 }] },
      ],
      defaultOption: "buy",
    };
  },
  interdict: (state) => {
    const player = state.realms[state.playerRealm]!;
    if (player.infamy < 15 && player.estates.clergy > 45) return null;
    return {
      kind: "interdict",
      title: "The shrines fall silent",
      text: "The archpriest has closed the shrines until the Regent atones for broken oaths and unprovoked wars. No weddings, no burials, no blessings on the harvest.",
      realm: state.playerRealm,
      options: [
        { id: "atone", label: "Atone publicly", text: "A pilgrimage and a purse for the shrines.", adviser: "chancellor", effects: [{ kind: "treasury", amount: -25 }, { kind: "infamy", amount: -15 }, { kind: "estate", estate: "clergy", amount: 12 }, { kind: "heir", trait: "pious", amount: 2 }] },
        { id: "defy", label: "Defy the archpriest", text: "Seize the shrine treasuries.", adviser: "treasurer", effects: [{ kind: "treasury", amount: 40 }, { kind: "estate", estate: "clergy", amount: -20 }, { kind: "estate", estate: "peasants", amount: -6 }, { kind: "unrest", province: "all", amount: 8 }, { kind: "heir", trait: "bold", amount: 1 }, { kind: "reputation", amount: -6 }] },
      ],
      defaultOption: "atone",
    };
  },
  assassin: (state) => {
    const player = state.realms[state.playerRealm]!;
    if (player.infamy < 10 && player.estates.nobles > 40 && state.regent.reputation > 30) return null;
    return {
      kind: "assassin",
      title: "A knife in the antechamber",
      text: "A page was found with a poisoned blade outside the Regent's chamber. He names a noble house before he dies. The Marshal wants heads; the Chancellor wants a trial.",
      realm: state.playerRealm,
      options: [
        { id: "trial", label: "Hold a public trial", text: "Slow, lawful, and watched by every estate.", adviser: "chancellor", effects: [{ kind: "estate", estate: "burghers", amount: 4 }, { kind: "estate", estate: "clergy", amount: 3 }, { kind: "reputation", amount: 5 }, { kind: "heir", trait: "just", amount: 2 }, { kind: "standing", role: "chancellor", amount: 6 }] },
        { id: "purge", label: "Let the Marshal act", text: "The house is broken tonight.", adviser: "marshal", effects: [{ kind: "estate", estate: "nobles", amount: -12 }, { kind: "unrest", province: "all", amount: -4 }, { kind: "reputation", amount: -4 }, { kind: "heir", trait: "bold", amount: 2 }, { kind: "standing", role: "marshal", amount: 6 }] },
        { id: "quiet", label: "Bury it quietly", text: "Nobody is punished and everyone knows.", effects: [{ kind: "reputation", amount: -8 }, { kind: "estate", estate: "nobles", amount: 2 }, { kind: "heir", trait: "cautious", amount: 1 }] },
      ],
      defaultOption: "quiet",
    };
  },
  marriage: (state, rng) => {
    const rival = pick(rng, livingRealms(state).filter((r) => r !== state.playerRealm && !atWar(state, state.playerRealm, r) && (state.realms[state.playerRealm]!.relations[r] ?? 0) > -10));
    if (!rival) return null;
    return {
      kind: "marriage",
      title: `An offer from ${state.realms[rival]!.name}`,
      text: `${state.realms[rival]!.name} proposes a betrothal between the heir and a child of their house. The Envoy calls it a decade of peace; the nobles call it a foreign hand on the throne.`,
      realm: state.playerRealm,
      options: [
        { id: "accept", label: "Accept the betrothal", text: "Relations warm; the nobles cool.", adviser: "envoy", effects: [{ kind: "relation", realm: rival, amount: 35 }, { kind: "estate", estate: "nobles", amount: -8 }, { kind: "prestige", amount: 4 }, { kind: "heir", trait: "cautious", amount: 1 }, { kind: "standing", role: "envoy", amount: 6 }] },
        { id: "delay", label: "Answer in a year", text: "Nobody is offended yet.", effects: [{ kind: "relation", realm: rival, amount: 5 }] },
        { id: "refuse", label: "Refuse politely", text: "The nobles approve; the neighbour remembers.", effects: [{ kind: "relation", realm: rival, amount: -15 }, { kind: "estate", estate: "nobles", amount: 5 }, { kind: "heir", trait: "bold", amount: 1 }] },
      ],
      defaultOption: "delay",
    };
  },
  tutor: (state) => {
    if (state.heir.tutor) return null;
    return {
      kind: "tutor",
      title: `A tutor for ${state.heir.name}`,
      text: `${state.heir.name} is old enough for lessons. Whoever teaches the heir shapes the reign to come.`,
      realm: state.playerRealm,
      options: [
        { id: "marshal", label: "The Marshal", text: "Swords, maps and the value of a banner.", effects: [{ kind: "tutor", role: "marshal" }, { kind: "heir", trait: "bold", amount: 2 }, { kind: "standing", role: "marshal", amount: 8 }] },
        { id: "chancellor", label: "The Chancellor", text: "Law, ledgers and the patience of the long game.", effects: [{ kind: "tutor", role: "chancellor" }, { kind: "heir", trait: "just", amount: 2 }, { kind: "standing", role: "chancellor", amount: 8 }] },
        { id: "envoy", label: "The Envoy", text: "Letters, languages and the art of not fighting.", effects: [{ kind: "tutor", role: "envoy" }, { kind: "heir", trait: "cautious", amount: 2 }, { kind: "standing", role: "envoy", amount: 8 }] },
      ],
      defaultOption: "chancellor",
    };
  },
  feud: (state, rng) => {
    const ministers = ["chancellor", "treasurer", "marshal", "envoy"].filter((r) => state.court[r] && state.court[r]!.rival && state.court[r]!.standing < 40);
    const role = pick(rng, ministers);
    if (!role) return null;
    const c = state.court[role]!;
    const rival = state.court[c.rival!]!;
    return {
      kind: "feud",
      title: `${c.name} against ${rival.name}`,
      text: `The ${role} has accused the ${rival.role} of working against the realm, and demands the Regent choose between them. The court watches to see whose word weighs more.`,
      realm: state.playerRealm,
      options: [
        { id: "back", label: `Back the ${role}`, text: `${c.name} is vindicated; ${rival.name} is humbled.`, effects: [{ kind: "standing", role, amount: 20 }, { kind: "standing", role: rival.role, amount: -15 }] },
        { id: "back_rival", label: `Back the ${rival.role}`, text: `${rival.name} is vindicated; ${c.name} is humbled.`, effects: [{ kind: "standing", role: rival.role, amount: 15 }, { kind: "standing", role, amount: -12 }] },
        { id: "both", label: "Rebuke them both", text: "Order at the price of two grudges.", effects: [{ kind: "standing", role, amount: -6 }, { kind: "standing", role: rival.role, amount: -6 }, { kind: "reputation", amount: 2 }, { kind: "heir", trait: "just", amount: 1 }] },
      ],
      defaultOption: "both",
    };
  },
  guild: (state, rng) => {
    const p = pick(rng, realmProvinces(state, state.playerRealm).filter((x) => x.buildings.market > 0));
    if (!p) return null;
    return {
      kind: "guild",
      title: `The guilds of ${p.name} petition`,
      text: `The merchant guilds of ${p.name} offer a loan of eighty gold in return for a charter freeing them from the nobles' tolls.`,
      realm: state.playerRealm,
      province: p.id,
      options: [
        { id: "charter", label: "Grant the charter", text: "+80 gold; the nobles lose a privilege.", adviser: "treasurer", effects: [{ kind: "treasury", amount: 80 }, { kind: "estate", estate: "burghers", amount: 10 }, { kind: "estate", estate: "nobles", amount: -8 }, { kind: "heir", trait: "greedy", amount: 1 }] },
        { id: "refuse", label: "Refuse", text: "The tolls stand.", effects: [{ kind: "estate", estate: "nobles", amount: 3 }, { kind: "estate", estate: "burghers", amount: -4 }] },
      ],
      defaultOption: "refuse",
    };
  },
  rebels: (state, rng) => {
    const risen = realmProvinces(state, state.playerRealm).filter((p) => armiesIn(state, p.id).some((a) => a.realm === REBELS));
    const p = pick(rng, risen);
    if (!p) return null;
    const player = state.realms[state.playerRealm]!;
    const demand = player.laws.taxRate > 0.35 ? "tax" : p.famineStreak > 0 ? "bread" : "war";
    const demandText = demand === "tax" ? "lower taxes" : demand === "bread" ? "bread from the granaries" : "an end to the levies";
    return {
      kind: "rebels",
      title: `The rebels of ${p.name} send terms`,
      text: `The rebels holding ${p.name} will lay down arms for ${demandText} and a pardon. The Marshal says rebels who are paid come back; the Chancellor says the same of rebels who are hanged.`,
      realm: state.playerRealm,
      province: p.id,
      options: [
        { id: "concede", label: "Concede and pardon", text: "The rebels disband; the estates take note.", adviser: "chancellor", effects: [{ kind: "disband_rebels", province: p.id }, { kind: "unrest", province: p.id, amount: -30 }, { kind: "estate", estate: "peasants", amount: 6 }, { kind: "estate", estate: "nobles", amount: -5 }, { kind: "heir", trait: "just", amount: 1 }, ...(demand === "bread" ? [{ kind: "granary" as const, province: p.id, amount: 15 }] : demand === "tax" ? [{ kind: "treasury" as const, amount: -20 }] : [])] },
        { id: "crush", label: "Crush them", text: "The Marshal will need the men.", adviser: "marshal", effects: [{ kind: "estate", estate: "nobles", amount: 4 }, { kind: "estate", estate: "peasants", amount: -6 }, { kind: "heir", trait: "bold", amount: 1 }] },
      ],
      defaultOption: "crush",
    };
  },
  exile: (state) => {
    const player = state.realms[state.playerRealm]!;
    if (player.legitimacy > 35 || state.regent.reputation > 45) return null;
    return {
      kind: "exile",
      title: "The estates name a price",
      text: "A delegation of the estates offers the Regent an honourable exile with a pension, and the heir a council of their choosing. Refuse, and they will find a less honourable way.",
      realm: state.playerRealm,
      options: [
        { id: "refuse", label: "Refuse and hold on", text: "The Regent stays; the estates sharpen.", effects: [{ kind: "estates", amount: -4 }, { kind: "reputation", amount: 3 }, { kind: "heir", trait: "bold", amount: 1 }] },
        { id: "concessions", label: "Buy time with concessions", text: "Taxes eased, a purge of the household.", adviser: "chancellor", effects: [{ kind: "treasury", amount: -30 }, { kind: "estates", amount: 6 }, { kind: "legitimacy_floor", amount: 25 }, { kind: "heir", trait: "cautious", amount: 1 }] },
      ],
      defaultOption: "refuse",
    };
  },
  border_raid: (state, rng) => {
    const enemy = pick(rng, livingRealms(state).filter((r) => r !== state.playerRealm && atWar(state, state.playerRealm, r)));
    if (!enemy) return null;
    const p = pick(rng, realmProvinces(state, state.playerRealm).filter((x) => x.neighbors.some((n) => state.provinces[n]!.owner === enemy)));
    if (!p) return null;
    return {
      kind: "raid",
      title: `Raiders out of ${state.realms[enemy]!.name}`,
      text: `Riders from ${state.realms[enemy]!.name} have burned the outlying farms of ${p.name}. The peasants ask for arms; the nobles ask for revenge.`,
      realm: state.playerRealm,
      province: p.id,
      options: [
        { id: "arm", label: "Arm the peasants", text: "A levy company rises; the fields stay burned.", adviser: "marshal", effects: [{ kind: "army", province: p.id, unit: "levy", companies: 1 }, { kind: "estate", estate: "peasants", amount: 3 }, { kind: "heir", trait: "bold", amount: 1 }] },
        { id: "relief", label: "Send relief", text: "Twenty gold rebuilds the farms.", adviser: "treasurer", effects: [{ kind: "treasury", amount: -20 }, { kind: "unrest", province: p.id, amount: -10 }, { kind: "estate", estate: "peasants", amount: 4 }, { kind: "heir", trait: "just", amount: 1 }] },
        { id: "nothing", label: "Bear it", text: "War is war.", effects: [{ kind: "unrest", province: p.id, amount: 10 }, { kind: "estate", estate: "peasants", amount: -4 }] },
      ],
      defaultOption: "nothing",
    };
  },
};

export const CRISIS_KINDS = Object.keys(MAKERS);

/** Generate zero or one crisis for the season, plus scripted ones. */
export function generateCrises(state: GameState, rng: Rng, forced: string[] = []): Crisis[] {
  const out: Crisis[] = [];
  const pendingKinds = new Set(state.crises.filter((c) => c.chosen === null).map((c) => c.kind));
  const recent = new Set(state.crises.filter((c) => state.season - c.season < 6).map((c) => c.kind));
  const tryMake = (kind: string) => {
    if (pendingKinds.has(kind)) return;
    const made = MAKERS[kind]?.(state, rng);
    if (!made) return;
    out.push({ ...made, id: `c${state.nextId++}`, season: state.season, chosen: null, decidedBy: null });
    pendingKinds.add(kind);
  };
  for (const kind of forced) tryMake(kind);
  // The heir's tutor is chosen early.
  if (state.season === 2 && !state.heir.tutor) tryMake("tutor");
  // Rebels always send terms.
  if (realmProvinces(state, state.playerRealm).some((p) => armiesIn(state, p.id).some((a) => a.realm === REBELS)) && !recent.has("rebels")) tryMake("rebels");
  // Pressure-driven crises first, then a random one.
  const player = state.realms[state.playerRealm]!;
  if (player.legitimacy < 35 && !recent.has("exile")) tryMake("exile");
  if ((player.infamy >= 20 || player.estates.clergy < 30) && !recent.has("interdict") && rng.chance(0.5)) tryMake("interdict");
  if (out.length === 0 && rng.chance(0.4)) {
    const pool = CRISIS_KINDS.filter((k) => !["tutor", "rebels", "exile", "interdict"].includes(k) && !recent.has(k));
    const kind = pick(rng, rng.shuffle(pool));
    if (kind) tryMake(kind);
  }
  return out;
}

/** Return the option that applies for a crisis at resolution. */
export function resolvedOption(c: Crisis): CrisisOption {
  return c.options.find((o) => o.id === (c.chosen ?? c.defaultOption)) ?? c.options[0]!;
}

export function describeEffects(state: GameState, effects: Crisis["options"][number]["effects"]): string {
  const rn = (id: RealmId) => state.realms[id]?.name ?? id;
  const pn = (id: string) => (id === "all" ? "every province" : state.provinces[id]?.name ?? id);
  return effects
    .map((e) => {
      switch (e.kind) {
        case "treasury":
          return `${e.amount >= 0 ? "+" : ""}${e.amount} gold`;
        case "estate":
          return `${e.estate} ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "estates":
          return `all estates ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "unrest":
          return `unrest in ${pn(e.province)} ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "population":
          return `${pn(e.province)} loses ${Math.round((1 - e.factor) * 100)}% of its people`;
        case "heir":
          return `the heir grows more ${e.trait}`;
        case "reputation":
          return `reputation ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "relation":
          return `${rn(e.realm)}'s regard ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "army":
          return `${e.companies} ${e.unit} in ${pn(e.province)}`;
        case "province_to":
          return `${pn(e.province)} passes to ${rn(e.realm)}`;
        case "war":
          return `war with ${rn(e.realm)}`;
        case "prestige":
          return `prestige ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "infamy":
          return `infamy ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "granary":
          return `granaries of ${pn(e.province)} +${e.amount}`;
        case "standing":
          return `the ${e.role}'s standing ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "tutor":
          return `the ${e.role} becomes tutor`;
        case "fertility":
          return `${pn(e.province)} fertility ${e.amount >= 0 ? "+" : ""}${e.amount}`;
        case "disband_rebels":
          return `the rebels of ${pn(e.province)} disband`;
        case "legitimacy_floor":
          return `legitimacy no lower than ${e.amount} this season`;
      }
    })
    .join("; ");
}

export function crisisSummary(state: GameState, c: Crisis): string {
  return [`**${c.title}** [${c.id}] — ${c.text}`, ...c.options.map((o) => `- \`${o.id}\` ${o.label}: ${o.text} (${describeEffects(state, o.effects)})${o.id === c.defaultOption ? " — default if undecided" : ""}`)].join("\n");
}

export { hasClaim, realmStrength };
