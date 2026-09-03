/**
 * Order validation. The Durable Object validates at submission so agents get
 * immediate, specific feedback; resolution validates again against the state
 * as it stands when the season closes.
 */
import { validateEdict } from "./laws.js";
import {
  atWar,
  BUILDING_COST,
  BUILDING_MAX,
  hasAccessTo,
  isRealm,
  mayEnter,
  treatyBetween,
  UNIT_COST,
} from "./state.js";
import { BUILDINGS, NEUTRAL, UNITS, type GameState, type Order, type RealmId } from "./types.js";

export type OrderKind = Order["kind"];

export const ORDER_KINDS: readonly OrderKind[] = [
  "build",
  "muster",
  "move",
  "merge",
  "disband",
  "set_tax",
  "set_conscription",
  "set_granary_reserve",
  "enact_edict",
  "repeal_edict",
  "declare_war",
  "propose",
  "respond",
  "withdraw",
  "cede_province",
  "colonize",
];

/** Returns null when the order is legal for `realm`, else the reason. */
export function validateOrder(state: GameState, realm: RealmId, order: Order): string | null {
  const r = state.realms[realm];
  if (!r) return `unknown realm ${realm}`;
  if (r.eliminated) return `${r.name} has been eliminated`;
  if (state.phase === "finished") return "the game is over";
  switch (order.kind) {
    case "build": {
      const p = state.provinces[order.province];
      if (!p) return `unknown province ${order.province}`;
      if (p.owner !== realm) return `${p.name} is not yours`;
      if (!BUILDINGS.includes(order.building)) return `unknown building ${String(order.building)}`;
      if (p.buildings[order.building] >= BUILDING_MAX[order.building]) return `${p.name} already has the maximum ${order.building} level`;
      if (order.building === "mine" && !p.resources.some((x) => x === "iron" || x === "gold" || x === "salt")) return `${p.name} has nothing to mine (needs iron, gold or salt)`;
      if (order.building === "market" && p.development < 2) return `${p.name} is too undeveloped for a market`;
      return null;
    }
    case "muster": {
      const p = state.provinces[order.province];
      if (!p) return `unknown province ${order.province}`;
      if (p.owner !== realm) return `${p.name} is not yours`;
      if (!UNITS.includes(order.unit)) return `unknown unit ${String(order.unit)}`;
      if (!Number.isInteger(order.companies) || order.companies < 1 || order.companies > 10) return "companies must be 1..10";
      if (p.population < 3 + order.companies * 0.5) return `${p.name} lacks the people to raise ${order.companies} companies`;
      if (order.unit === "regular" && p.buildings.barracks === 0 && p.capitalOf !== realm) return `regulars need barracks or the capital (${p.name} has neither)`;
      if (order.unit === "cavalry" && !hasAccessTo(state, realm, "horses")) return "cavalry needs horses: a province of your own or a trade partner's";
      if (order.unit === "siege" && !(hasAccessTo(state, realm, "timber") && hasAccessTo(state, realm, "iron"))) return "siege engines need both timber and iron, owned or traded for";
      return null;
    }
    case "move": {
      const a = state.armies[order.army];
      if (!a) return `unknown army ${order.army}`;
      if (a.realm !== realm) return `${a.name} is not yours`;
      const from = state.provinces[a.province]!;
      const to = state.provinces[order.to];
      if (!to) return `unknown province ${order.to}`;
      if (!from.neighbors.includes(to.id)) return `${to.name} is not adjacent to ${from.name}`;
      if (!mayEnter(state, realm, to)) return `${to.name} belongs to ${state.realms[to.owner]?.name ?? to.owner}; you are neither at war nor allied`;
      return null;
    }
    case "merge": {
      const a = state.armies[order.army];
      const b = state.armies[order.into];
      if (!a || !b) return "unknown army";
      if (a.realm !== realm || b.realm !== realm) return "both armies must be yours";
      if (a.province !== b.province) return "armies must stand in the same province to merge";
      if (a.id === b.id) return "an army cannot merge with itself";
      return null;
    }
    case "disband": {
      const a = state.armies[order.army];
      if (!a) return `unknown army ${order.army}`;
      if (a.realm !== realm) return `${a.name} is not yours`;
      return null;
    }
    case "set_tax":
      if (!(typeof order.taxRate === "number" && order.taxRate >= 0.1 && order.taxRate <= 0.6)) return "taxRate must be within 0.1..0.6";
      return null;
    case "set_conscription":
      if (!(typeof order.level === "number" && order.level >= 0 && order.level <= 1)) return "level must be within 0..1";
      return null;
    case "set_granary_reserve":
      if (!(typeof order.share === "number" && order.share >= 0 && order.share <= 1)) return "share must be within 0..1";
      return null;
    case "enact_edict": {
      const problem = validateEdict(order.edict);
      if (problem) return `invalid edict: ${problem}`;
      if (r.laws.edicts.length >= 8) return "a realm may hold at most 8 edicts; repeal one first";
      return null;
    }
    case "repeal_edict":
      if (!r.laws.edicts.some((e) => e.id === order.edictId)) return `no edict ${order.edictId}`;
      return null;
    case "declare_war": {
      if (!isRealm(state, order.target) || order.target === realm) return `unknown realm ${order.target}`;
      if (state.realms[order.target]!.eliminated) return "that realm no longer exists";
      if (atWar(state, realm, order.target)) return "you are already at war";
      return null;
    }
    case "propose": {
      const p = order.proposal;
      if (!p || typeof p !== "object") return "proposal required";
      if (!isRealm(state, p.to) || p.to === realm) return `unknown realm ${String(p.to)}`;
      if (state.realms[p.to]!.eliminated) return "that realm no longer exists";
      if (!["non_aggression", "alliance", "trade", "tribute", "peace"].includes(p.kind)) return `unknown treaty kind ${String(p.kind)}`;
      if (p.kind === "peace" && !atWar(state, realm, p.to)) return "you are not at war; propose non_aggression instead";
      if (p.kind !== "peace" && atWar(state, realm, p.to)) return "make peace before other treaties";
      if (p.kind !== "peace" && treatyBetween(state, realm, p.to, p.kind)) return `a ${p.kind} treaty already exists`;
      if (p.kind === "alliance" && !treatyBetween(state, realm, p.to, "non_aggression") && !treatyBetween(state, realm, p.to, "trade")) return "alliances follow a non-aggression or trade treaty";
      const terms = p.terms ?? {};
      if (terms.tribute !== undefined && !(typeof terms.tribute === "number" && Math.abs(terms.tribute) <= 50)) return "tribute must be within -50..50";
      if (terms.seasons !== undefined && terms.seasons !== null && !(Number.isInteger(terms.seasons) && terms.seasons >= 1 && terms.seasons <= 40)) return "seasons must be 1..40 or null";
      for (const id of terms.cededProvinces ?? []) {
        const prov = state.provinces[id];
        if (!prov || prov.owner !== realm) return `you cannot cede ${id}`;
        if (prov.capitalOf === realm) return "a capital cannot be ceded";
      }
      for (const id of terms.demandedProvinces ?? []) {
        const prov = state.provinces[id];
        if (!prov || prov.owner !== p.to) return `${state.realms[p.to]!.name} does not hold ${id}`;
        if (prov.capitalOf === p.to) return "a capital cannot be demanded";
      }
      if (typeof p.message !== "string" || p.message.length > 600) return "message must be a string of at most 600 characters";
      return null;
    }
    case "respond": {
      const prop = state.proposals.find((x) => x.id === order.proposalId);
      if (!prop) return `no proposal ${order.proposalId}`;
      if (prop.to !== realm) return "that proposal is not addressed to you";
      if (prop.status !== "pending") return `proposal is ${prop.status}`;
      return null;
    }
    case "withdraw": {
      const prop = state.proposals.find((x) => x.id === order.proposalId);
      if (!prop) return `no proposal ${order.proposalId}`;
      if (prop.from !== realm) return "that proposal is not yours";
      if (prop.status !== "pending") return `proposal is ${prop.status}`;
      return null;
    }
    case "cede_province": {
      const p = state.provinces[order.province];
      if (!p) return `unknown province ${order.province}`;
      if (p.owner !== realm) return `${p.name} is not yours`;
      if (p.capitalOf === realm) return "a capital cannot be ceded";
      if (!isRealm(state, order.to) || order.to === realm) return `unknown realm ${order.to}`;
      return null;
    }
    case "colonize": {
      const p = state.provinces[order.province];
      const from = state.provinces[order.from];
      if (!p) return `unknown province ${order.province}`;
      if (!from) return `unknown province ${order.from}`;
      if (from.owner !== realm) return `${from.name} is not yours`;
      if (p.owner !== NEUTRAL) return `${p.name} is not neutral`;
      if (!from.neighbors.includes(p.id)) return `${p.name} is not adjacent to ${from.name}`;
      if (r.treasury < colonizeCost(state, p.id)) return `colonizing ${p.name} costs ${colonizeCost(state, p.id)} gold; treasury is ${Math.floor(r.treasury)}`;
      return null;
    }
    default:
      return `unknown order kind ${String((order as { kind?: unknown }).kind)}`;
  }
}

export function colonizeCost(state: GameState, province: string): number {
  const p = state.provinces[province]!;
  return Math.round(10 + p.population * 1.5);
}

export function orderCost(state: GameState, realm: RealmId, order: Order): number {
  switch (order.kind) {
    case "build":
      return BUILDING_COST[order.building] * (1 + 0.5 * state.provinces[order.province]!.buildings[order.building]);
    case "muster": {
      const law = state.realms[realm]!.laws;
      const levyDiscount = order.unit === "levy" ? 1 - 0.3 * law.conscription : 1;
      return UNIT_COST[order.unit] * order.companies * levyDiscount;
    }
    case "colonize":
      return colonizeCost(state, order.province);
    default:
      return 0;
  }
}

export function describeOrder(state: GameState, order: Order): string {
  const pn = (id: string) => state.provinces[id]?.name ?? id;
  const rn = (id: string) => state.realms[id]?.name ?? id;
  switch (order.kind) {
    case "build":
      return `build ${order.building} in ${pn(order.province)}`;
    case "muster":
      return `muster ${order.companies} ${order.unit} in ${pn(order.province)}`;
    case "move":
      return `march ${state.armies[order.army]?.name ?? order.army} to ${pn(order.to)}`;
    case "merge":
      return `merge ${order.army} into ${order.into}`;
    case "disband":
      return `disband ${state.armies[order.army]?.name ?? order.army}`;
    case "set_tax":
      return `set tax rate to ${Math.round(order.taxRate * 100)}%`;
    case "set_conscription":
      return `set conscription to ${order.level}`;
    case "set_granary_reserve":
      return `set granary reserve to ${Math.round(order.share * 100)}%`;
    case "enact_edict":
      return `enact edict “${order.edict.title}”`;
    case "repeal_edict":
      return `repeal edict ${order.edictId}`;
    case "declare_war":
      return `declare war on ${rn(order.target)}`;
    case "propose":
      return `propose ${order.proposal.kind.replace("_", "-")} to ${rn(order.proposal.to)}`;
    case "respond":
      return `${order.accept ? "accept" : "reject"} proposal ${order.proposalId}`;
    case "withdraw":
      return `withdraw proposal ${order.proposalId}`;
    case "cede_province":
      return `cede ${pn(order.province)} to ${rn(order.to)}`;
    case "colonize":
      return `colonize ${pn(order.province)} from ${pn(order.from)}`;
  }
}

/** Whether a legal order needs the Regent's seal when issued by a minister. */
export function requiresSeal(order: Order): boolean {
  switch (order.kind) {
    case "declare_war":
    case "enact_edict":
    case "repeal_edict":
    case "cede_province":
      return true;
    case "propose":
      return order.proposal.kind !== "trade";
    case "respond":
      return order.accept;
    case "set_tax":
      return true;
    default:
      return false;
  }
}

/** Which council portfolio may issue which order kinds. */
export const PORTFOLIOS: Record<string, readonly OrderKind[]> = {
  chancellor: ["set_tax", "set_conscription", "set_granary_reserve", "enact_edict", "repeal_edict"],
  treasurer: ["build", "colonize", "set_granary_reserve"],
  marshal: ["muster", "move", "merge", "disband", "declare_war"],
  envoy: ["propose", "respond", "withdraw", "cede_province", "declare_war"],
  ambassador: ["propose", "respond", "withdraw"],
  steward: ORDER_KINDS,
  sovereign: ORDER_KINDS,
  regent: ORDER_KINDS,
  protector: ORDER_KINDS,
  forecast: ORDER_KINDS,
};

export function allowedInPortfolio(actor: string, kind: OrderKind): boolean {
  const allowed = PORTFOLIOS[actor];
  return allowed ? allowed.includes(kind) : false;
}
