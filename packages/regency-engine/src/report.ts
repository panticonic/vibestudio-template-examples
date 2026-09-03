/**
 * Markdown reports for agents. These are the "eyes" of ministers and
 * sovereigns: compact, numeric, and honest about what is and is not known.
 */
import { colonizeCost } from "./orders.js";
import { crisisSummary } from "./crises.js";
import { dominantTraits, heirAge, moodOf } from "./court.js";
import { armiesIn, atWar, foodNeeded, foodProduced, garrisonCompanies, isBorderProvince, realmArmies, realmProvinces, realmStrength, round1 } from "./state.js";
import { NEUTRAL, REBELS, seasonLabel, totalCompanies, type GameEvent, type GameState, type Province, type RealmId } from "./types.js";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function realmLabel(state: GameState, id: RealmId): string {
  if (id === NEUTRAL) return "free folk";
  if (id === REBELS) return "rebels";
  return state.realms[id]?.name ?? id;
}

export function provinceLine(state: GameState, p: Province): string {
  const food = foodNeeded(p) > 0 ? foodProduced(p) / foodNeeded(p) : 2;
  const buildings = Object.entries(p.buildings)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => (n > 1 ? `${k}×${n}` : k))
    .join(", ");
  const armies = armiesIn(state, p.id)
    .map((a) => `${a.name} [${a.id}] ${totalCompanies(a.units)}c${a.realm !== p.owner ? ` (${realmLabel(state, a.realm)})` : ""}`)
    .join("; ");
  return [
    `- **${p.name}** [${p.id}] ${p.terrain}${p.coastal ? ", coastal" : ""}${p.capitalOf ? ", capital" : ""}${isBorderProvince(state, p) ? ", border" : ""}`,
    `pop ${p.population}k, dev ${p.development}, fert ${p.fertility}, food ${food.toFixed(2)}, unrest ${Math.round(p.unrest)}, granary ${round1(p.granary)}`,
    p.resources.length ? `res ${p.resources.join("/")}` : "",
    buildings ? `built ${buildings}` : "",
    p.buildings.fort ? `walls ${Math.ceil(p.fortHp)}/${p.buildings.fort * 10}` : "",
    p.claims.length ? `claims: ${p.claims.map((c) => realmLabel(state, c)).join(", ")}` : "",
    armies ? `armies: ${armies}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function realmReport(state: GameState, realmId: RealmId): string {
  const r = state.realms[realmId];
  if (!r) return `No realm ${realmId}.`;
  const owned = realmProvinces(state, realmId).sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  lines.push(`# ${r.name} — ${seasonLabel(state)} (season ${state.season + 1}, ${state.phase})`);
  lines.push(`Treasury **${round1(r.treasury)}** gold · last season net ${r.ledger.net >= 0 ? "+" : ""}${r.ledger.net} (tax ${round1(r.ledger.taxIncome)}, trade ${round1(r.ledger.tradeIncome)} via ${r.ledger.routes} routes, resources ${round1(r.ledger.resourceIncome)}, tribute ${round1(r.ledger.tributeNet)}, upkeep −${round1(r.ledger.upkeep)}, building −${round1(r.ledger.buildSpend)}, muster −${round1(r.ledger.musterSpend)}, dole −${round1(r.ledger.doleSpend)})`);
  lines.push(`Food last season ${round1(r.ledger.foodProduced)} produced / ${round1(r.ledger.foodConsumed)} needed · prestige ${Math.round(r.prestige)} · infamy ${Math.round(r.infamy)}${r.sovereign === "regent" ? ` · **legitimacy ${Math.round(r.legitimacy)}**` : ""}`);
  lines.push(`Laws: tax ${pct(r.laws.taxRate)}, conscription ${r.laws.conscription}, granary reserve ${pct(r.laws.granaryReserve)}; ${r.laws.edicts.length} edict(s)${r.laws.edicts.length ? ": " + r.laws.edicts.map((e) => `“${e.title}” [${e.id}]`).join(", ") : ""}`);
  lines.push(`Estates: ${(["peasants", "burghers", "clergy", "nobles"] as const).map((e) => `${e} ${Math.round(r.estates[e])}`).join(", ")}${r.sovereign === "regent" ? " (legitimacy is their weighted consent; below 15 the Regent is deposed)" : ""}`);
  if (state.playerRealm === realmId) {
    const seasonsLeft = state.majoritySeason - state.season;
    lines.push(`The heir ${state.heir.name} is ${heirAge(state)} and comes of age in ${seasonsLeft} season(s)${dominantTraits(state.heir).length ? `; the child is growing ${dominantTraits(state.heir).join(" and ")}` : ""}${state.heir.tutor ? `; tutored by the ${state.heir.tutor}` : ""}. Win by reaching the majority with legitimacy ≥ 40, by holding 55% of all provinces, or by alliance with every surviving realm. The Regent's reputation stands at ${Math.round(state.regent.reputation)}.`);
    const pending = state.crises.filter((c) => c.chosen === null);
    if (pending.length) {
      lines.push("");
      lines.push("## Matters awaiting the Regent's decision");
      for (const c of pending) lines.push(crisisSummary(state, c));
    }
    lines.push("");
    lines.push("## The court");
    for (const role of ["herald", "chancellor", "treasurer", "marshal", "envoy"]) {
      const c = state.court[role];
      if (c) lines.push(`- ${c.name} of house ${c.house}, ${role}: ${moodOf(c.standing)} (standing ${Math.round(c.standing)}), ${c.temperament}${c.rival ? `; resents the ${c.rival}` : ""}`);
    }
  }
  lines.push("");
  lines.push(`## Provinces (${owned.length})`);
  for (const p of owned) lines.push(provinceLine(state, p));
  lines.push("");
  const armies = realmArmies(state, realmId);
  lines.push(`## Armies (${armies.length}, strength ${Math.round(realmStrength(state, realmId))})`);
  for (const a of armies) {
    const p = state.provinces[a.province]!;
    lines.push(`- **${a.name}** [${a.id}] in ${p.name} [${p.id}]${p.owner !== realmId ? ` (${realmLabel(state, p.owner)} soil)` : ""}: levy ${a.units.levy}, regular ${a.units.regular}, cavalry ${a.units.cavalry}, siege ${a.units.siege}; morale ${a.morale}${a.besieging ? "; besieging" : ""}${a.moveTo ? `; ordered to ${state.provinces[a.moveTo]!.name}` : ""}. Can march to: ${p.neighbors.map((n) => `${state.provinces[n]!.name} [${n}]`).join(", ")}`);
  }
  lines.push("");
  lines.push("## Diplomacy");
  for (const other of Object.values(state.realms)) {
    if (other.id === realmId) continue;
    const war = atWar(state, realmId, other.id);
    const treaties = state.treaties.filter((t) => t.parties.includes(realmId) && t.parties.includes(other.id)).map((t) => t.kind.replace("_", "-") + (t.seasonsLeft !== null ? ` (${t.seasonsLeft} seasons)` : ""));
    lines.push(`- **${other.name}** [${other.id}]${other.eliminated ? " (eliminated)" : ""}: ${war ? "**AT WAR**" : "at peace"}; our regard ${r.relations[other.id] ?? 0}, theirs ${other.relations[realmId] ?? 0}; ${treaties.length ? treaties.join(", ") : "no treaties"}; ${realmProvinces(state, other.id).length} provinces, strength ${Math.round(realmStrength(state, other.id))}, prestige ${Math.round(other.prestige)}, infamy ${Math.round(other.infamy)}`);
  }
  const pending = state.proposals.filter((p) => p.status === "pending" && (p.from === realmId || p.to === realmId));
  if (pending.length) {
    lines.push("");
    lines.push("## Pending proposals");
    for (const p of pending) lines.push(`- [${p.id}] ${p.from === realmId ? "to" : "from"} ${realmLabel(state, p.from === realmId ? p.to : p.from)}: ${p.kind.replace("_", "-")} ${JSON.stringify(p.terms)} — “${p.message}” (season ${p.season + 1})`);
  }
  const neutrals = Object.values(state.provinces).filter((p) => p.owner === NEUTRAL && p.neighbors.some((n) => state.provinces[n]!.owner === realmId));
  if (neutrals.length) {
    lines.push("");
    lines.push("## Free provinces on our border");
    for (const p of neutrals) lines.push(`- ${p.name} [${p.id}] pop ${p.population}k, militia ~${Math.round(p.population * 0.15)}, colonize for ${colonizeCost(state, p.id)} gold${p.claims.includes(realmId) ? " (we hold a claim)" : ""}`);
  }
  if (state.outcome) lines.push(`\n**${state.outcome.kind.toUpperCase()}: ${state.outcome.title}.** ${state.outcome.reason}${state.outcome.verdict ? `\n\n${state.outcome.verdict}` : ""}`);
  if (state.digest.length) lines.push(`\n## Last season in brief\n${state.digest[state.digest.length - 1]}`);
  return lines.join("\n");
}

export function provinceReport(state: GameState, provinceId: string): string {
  const p = state.provinces[provinceId];
  if (!p) return `No province ${provinceId}.`;
  const lines = [
    `# ${p.name} [${p.id}] — held by ${realmLabel(state, p.owner)}`,
    provinceLine(state, p),
    `Neighbours: ${p.neighbors.map((n) => `${state.provinces[n]!.name} [${n}] (${realmLabel(state, state.provinces[n]!.owner)})`).join(", ")}`,
    `Garrison: ${garrisonCompanies(state, p)} companies. Famine streak: ${p.famineStreak}.`,
  ];
  return lines.join("\n");
}

export function mapOverview(state: GameState): string {
  const lines = [`# The known world — ${seasonLabel(state)}`];
  for (const r of Object.values(state.realms)) {
    const owned = realmProvinces(state, r.id);
    lines.push(`- **${r.name}** [${r.id}] (${r.sovereign === "regent" ? "the Regency" : r.character})${r.eliminated ? " — eliminated" : ""}: ${owned.length} provinces (${owned.map((p) => p.name).join(", ")}), capital ${state.provinces[r.capital]?.name}, strength ${Math.round(realmStrength(state, r.id))}, prestige ${Math.round(r.prestige)}`);
  }
  const wars = state.wars.map(([a, b]) => `${realmLabel(state, a)} vs ${realmLabel(state, b)}`);
  lines.push(`Wars: ${wars.length ? wars.join("; ") : "none"}`);
  lines.push(`Treaties: ${state.treaties.length ? state.treaties.map((t) => `${t.kind.replace("_", "-")} ${realmLabel(state, t.parties[0])}–${realmLabel(state, t.parties[1])}`).join("; ") : "none"}`);
  const free = Object.values(state.provinces).filter((p) => p.owner === NEUTRAL);
  lines.push(`Free provinces: ${free.length} (${free.map((p) => `${p.name} [${p.id}]`).join(", ")})`);
  return lines.join("\n");
}

export function chronicle(events: GameEvent[], state: GameState, realm?: RealmId, limit = 40): string {
  const relevant = events.filter((e) => !realm || e.realms.length === 0 || e.realms.includes(realm) || e.kind === "season" || e.kind === "war" || e.kind === "treaty" || e.kind === "capture" || e.kind === "elimination");
  const tail = relevant.slice(-limit);
  if (tail.length === 0) return "Nothing has been recorded yet.";
  return tail.map((e) => `- [${seasonLabel({ season: e.season, startYear: state.startYear })}] ${e.kind}: ${e.text}`).join("\n");
}

/** Short, human-readable line for a treaty kind, used in prompts. */
export const TREATY_GUIDE = [
  "non_aggression: neither party may declare war on the other while it stands (breaking it costs infamy and legitimacy).",
  "trade: +1.5 gold per market per season for both; needs no seal.",
  "alliance: follows a non-aggression or trade treaty; allied armies may pass through each other's provinces; attacking an ally's partner angers everyone.",
  "tribute: gold per season from one party to the other for a fixed number of seasons.",
  "peace: ends a war; may include cededProvinces (given by the proposer) or demandedProvinces (taken from the other side) and a tribute.",
].join("\n");
