/**
 * "Why?" — a pure reading of the world that turns a number the panel shows
 * into the short chain of causes behind it. It walks the realm's ledger, the
 * province's own arithmetic and the recent chronicle; it never guesses, and it
 * says plainly when it has nothing to offer.
 */
import { edictEffects } from "./laws.js";
import {
  armiesIn,
  foodNeeded,
  foodProduced,
  garrisonCompanies,
  granaryCapacity,
  realmProvinces,
  round1,
  tradeRoutes,
  upkeepOf,
} from "./state.js";
import { consentOf, ESTATE_WEIGHTS } from "./tick.js";
import { ESTATES, totalCompanies, type GameEvent, type GameState } from "./types.js";

export type ExplainSubject =
  | { kind: "legitimacy" }
  | { kind: "treasury" }
  | { kind: "province"; province: string; aspect: "hunger" | "unrest" }
  | { kind: "army"; army: string };

export interface Explanation {
  /** Short heading, e.g. "Legitimacy 47". */
  title: string;
  /** One sentence saying what the number is. */
  headline: string;
  /** The causes, largest first where there is a magnitude to sort by. */
  causes: Array<{ text: string; weight?: number }>;
  /** Chronicle lines that bear on it. */
  chronicle: string[];
}

const sign = (v: number) => `${v >= 0 ? "+" : ""}${round1(v)}`;

function recent(events: GameEvent[], state: GameState, match: (e: GameEvent) => boolean, limit = 4): string[] {
  return events
    .filter((e) => e.season >= state.season - 3 && match(e))
    .slice(-limit)
    .map((e) => e.text);
}

export function explain(state: GameState, events: GameEvent[], subject: ExplainSubject): Explanation {
  switch (subject.kind) {
    case "legitimacy":
      return explainLegitimacy(state, events);
    case "treasury":
      return explainTreasury(state, events);
    case "province":
      return explainProvince(state, events, subject.province, subject.aspect);
    case "army":
      return explainArmy(state, events, subject.army);
  }
}

function explainLegitimacy(state: GameState, events: GameEvent[]): Explanation {
  const realm = state.realms[state.playerRealm]!;
  const causes: Array<{ text: string; weight?: number }> = [];
  for (const estate of ESTATES) {
    const v = realm.estates[estate];
    causes.push({ text: `${estate} at ${Math.round(v)} contribute ${round1(v * ESTATE_WEIGHTS[estate])} of the ${consentOf(realm.estates)}`, weight: Math.abs(55 - v) });
  }
  const tax = realm.laws.taxRate;
  if (tax > 0.3) causes.push({ text: `the tax of ${Math.round(tax * 100)}% costs the peasants ${sign((0.3 - tax) * 25)} and the burghers ${sign((0.3 - tax) * 15)} a season`, weight: (tax - 0.3) * 100 });
  if (tax < 0.3) causes.push({ text: `the light tax of ${Math.round(tax * 100)}% wins the peasants ${sign((0.3 - tax) * 25)} a season`, weight: (0.3 - tax) * 100 });
  if (realm.infamy > 5) causes.push({ text: `infamy ${Math.round(realm.infamy)} sours the clergy by ${sign(-realm.infamy / 20)} a season`, weight: realm.infamy });
  const atWarWith = state.wars.filter(([a, b]) => a === realm.id || b === realm.id).map(([a, b]) => state.realms[a === realm.id ? b : a]?.name ?? "");
  if (atWarWith.length) causes.push({ text: `war with ${atWarWith.join(", ")} costs the peasants 0.8 and the burghers 0.5 a season, and pleases the nobles`, weight: 20 });
  if (realm.treasury < 0) causes.push({ text: `an empty treasury costs the burghers 3 and the nobles 2 a season`, weight: 40 });
  const shrines = realmProvinces(state, realm.id).reduce((n, p) => n + p.buildings.shrine, 0);
  if (shrines) causes.push({ text: `${shrines} shrine${shrines > 1 ? "s" : ""} please the clergy by ${sign(Math.min(3, shrines * 0.6))} a season`, weight: shrines * 5 });
  const markets = realmProvinces(state, realm.id).reduce((n, p) => n + p.buildings.market, 0);
  if (markets) causes.push({ text: `${markets} market${markets > 1 ? "s" : ""} and ${realm.ledger.routes} trade route${realm.ledger.routes === 1 ? "" : "s"} please the burghers`, weight: markets * 4 });
  causes.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return {
    title: `Legitimacy ${Math.round(realm.legitimacy)}`,
    headline: `Legitimacy is the estates' weighted consent: ${ESTATES.map((e) => `${e} ×${ESTATE_WEIGHTS[e]}`).join(", ")}. Below 15 the estates depose the Regent; the majority needs 40.`,
    causes,
    chronicle: recent(events, state, (e) => ["legitimacy", "crisis", "revolt", "law", "court"].includes(e.kind) && e.realms.includes(realm.id)),
  };
}

function explainTreasury(state: GameState, events: GameEvent[]): Explanation {
  const realm = state.realms[state.playerRealm]!;
  const l = realm.ledger;
  const causes: Array<{ text: string; weight?: number }> = [
    { text: `taxes brought ${round1(l.taxIncome)}`, weight: l.taxIncome },
    { text: `trade brought ${round1(l.tradeIncome)} over ${l.routes} route${l.routes === 1 ? "" : "s"} (${round1(l.routeIncome)} of it from the routes themselves)`, weight: l.tradeIncome },
    { text: `mines and forests brought ${round1(l.resourceIncome)}`, weight: l.resourceIncome },
    { text: `army upkeep took ${round1(l.upkeep)}`, weight: l.upkeep },
    { text: `building took ${round1(l.buildSpend)}`, weight: l.buildSpend },
    { text: `mustering took ${round1(l.musterSpend)}`, weight: l.musterSpend },
    { text: `the grain dole took ${round1(l.doleSpend)}`, weight: l.doleSpend },
  ].filter((c) => (c.weight ?? 0) !== 0);
  if (l.tributeNet) causes.push({ text: `tribute ${sign(l.tributeNet)}`, weight: Math.abs(l.tributeNet) });
  causes.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const armies = Object.values(state.armies).filter((a) => a.realm === realm.id);
  const worst = [...armies].sort((a, b) => upkeepOf(state, b) - upkeepOf(state, a))[0];
  if (worst) causes.push({ text: `the costliest army is ${worst.name} at ${round1(upkeepOf(state, worst))} a season${state.provinces[worst.province]!.owner !== realm.id ? " (abroad, and so half again as dear)" : ""}` });
  const forecastSeasons = l.net < 0 ? Math.max(0, Math.floor(realm.treasury / -l.net)) : null;
  return {
    title: `Treasury ${Math.round(realm.treasury)}`,
    headline: `Last season closed ${sign(l.net)}.${forecastSeasons !== null ? ` At this rate the treasury runs out in ${forecastSeasons} season${forecastSeasons === 1 ? "" : "s"}.` : ""}`,
    causes,
    chronicle: recent(events, state, (e) => ["economy", "trade", "build", "muster", "treaty"].includes(e.kind) && e.realms.includes(realm.id)),
  };
}

function explainProvince(state: GameState, events: GameEvent[], id: string, aspect: "hunger" | "unrest"): Explanation {
  const p = state.provinces[id];
  if (!p) return { title: id, headline: `No province ${id}.`, causes: [], chronicle: [] };
  const realm = state.realms[p.owner];
  const causes: Array<{ text: string; weight?: number }> = [];
  if (aspect === "hunger") {
    const produced = foodProduced(p);
    const needed = foodNeeded(p);
    causes.push({ text: `${p.population.toFixed(1)}k people need ${round1(needed)} rations`, weight: needed });
    causes.push({ text: `fertility ${p.fertility} on ${p.terrain} with ${p.buildings.farm} farm${p.buildings.farm === 1 ? "" : "s"} yields ${round1(produced)}`, weight: produced });
    if (p.resources.includes("grain")) causes.push({ text: "its own grain adds a tenth" });
    causes.push({ text: `the granary holds ${round1(p.granary)} of ${granaryCapacity(p)}`, weight: p.granary });
    if (realm) causes.push({ text: `food is pooled across ${realm.name}: last season the realm produced ${round1(realm.ledger.foodProduced)} against ${round1(realm.ledger.foodConsumed)} needed` });
    if (p.famineStreak) causes.push({ text: `${p.famineStreak} season${p.famineStreak > 1 ? "s" : ""} of famine in a row`, weight: 50 });
    if (realm && realm.laws.edicts.length) {
      const fx = edictEffects(state, p, realm.laws.edicts);
      if (fx.grainDole) causes.push({ text: "an edict grants this province the grain dole" });
    }
    return {
      title: `${p.name}: bread ${(needed > 0 ? produced / needed : 2).toFixed(2)} of need`,
      headline: `A province feeds itself first; the shortfall draws on the granary, then on the realm's pool and the grain dole, then the people starve.`,
      causes: causes.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)),
      chronicle: recent(events, state, (e) => e.province === p.id && ["famine", "growth", "law", "crisis"].includes(e.kind)),
    };
  }
  causes.push({ text: `unrest stands at ${Math.round(p.unrest)}; at 80 the province rises in revolt`, weight: p.unrest });
  if (realm) causes.push({ text: `the tax of ${Math.round(realm.laws.taxRate * 100)}% ${realm.laws.taxRate > 0.3 ? "adds to it" : "eases it"}`, weight: Math.abs(realm.laws.taxRate - 0.3) * 100 });
  if (realm && realm.laws.conscription > 0.4) causes.push({ text: `conscription at ${realm.laws.conscription} presses the young men`, weight: realm.laws.conscription * 20 });
  if (foodNeeded(p) > 0 && foodProduced(p) / foodNeeded(p) < 1) causes.push({ text: "hunger: a province short of bread grows restless", weight: 40 });
  if (p.buildings.shrine) causes.push({ text: `${p.buildings.shrine} shrine calms it`, weight: 10 });
  const garrison = garrisonCompanies(state, p);
  if (garrison) causes.push({ text: `${garrison} compan${garrison === 1 ? "y" : "ies"} of the owner stand here`, weight: garrison });
  const foreign = armiesIn(state, p.id).filter((a) => a.realm !== p.owner);
  if (foreign.length) causes.push({ text: `${foreign.length} foreign army on its soil`, weight: 60 });
  if (realm && realm.laws.edicts.length) {
    const fx = edictEffects(state, p, realm.laws.edicts);
    if (fx.curfew) causes.push({ text: "a curfew edict holds it down by 8 a season", weight: 30 });
    if (fx.taxFactor < 1) causes.push({ text: `an edict relieves its tax to ${Math.round(fx.taxFactor * 100)}%`, weight: 20 });
  }
  return {
    title: `${p.name}: unrest ${Math.round(p.unrest)}`,
    headline: `Unrest rises with taxes, hunger, conscription and occupation, and falls with shrines, garrisons, curfews and time.`,
    causes: causes.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)),
    chronicle: recent(events, state, (e) => e.province === p.id && ["unrest", "revolt", "capture", "law", "crisis", "famine"].includes(e.kind)),
  };
}

function explainArmy(state: GameState, events: GameEvent[], id: string): Explanation {
  const a = state.armies[id];
  if (!a) return { title: id, headline: `No army ${id}.`, causes: [], chronicle: [] };
  const p = state.provinces[a.province]!;
  const causes: Array<{ text: string; weight?: number }> = [
    { text: `${totalCompanies(a.units)} companies: levy ${a.units.levy}, regular ${a.units.regular}, cavalry ${a.units.cavalry}, siege ${a.units.siege}` },
    { text: `morale ${a.morale}; it recovers 3 a season and falls with every reverse` },
    { text: `${p.name} is ${p.terrain}${p.buildings.fort ? ` behind walls of level ${p.buildings.fort}` : " and open"}, held by ${state.realms[p.owner]?.name ?? p.owner}` },
    { text: `upkeep ${round1(upkeepOf(state, a))} a season${p.owner !== a.realm ? " — abroad, and so half again as dear" : ""}` },
  ];
  if (a.besieging) causes.push({ text: `it is besieging ${p.name}; the walls have ${Math.ceil(p.fortHp)} left` });
  if (a.moveTo) causes.push({ text: `it is ordered to ${state.provinces[a.moveTo]?.name ?? a.moveTo} and will march at resolution` });
  const marches = recent(events, state, (e) => e.kind === "march" && e.data?.["army"] === a.id, 3);
  return {
    title: `${a.name} in ${p.name}`,
    headline: `Armies move one province a season and may only enter their own, neutral, enemy or allied land.`,
    causes,
    chronicle: [...marches, ...recent(events, state, (e) => e.province === p.id && ["battle", "siege", "capture"].includes(e.kind), 3)],
  };
}

/** The province's own contribution to the realm's trade, for the "why" of a market. */
export function marketRoutes(state: GameState, provinceId: string): number {
  const p = state.provinces[provinceId];
  if (!p || !(p.owner in state.realms)) return 0;
  return tradeRoutes(state, p.owner).filter((r) => r.from === provinceId).length;
}
