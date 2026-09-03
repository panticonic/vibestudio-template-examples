/** Read-only helpers over the world model, shared by rules, reports and AI. */
import {
  NEUTRAL,
  REBELS,
  totalCompanies,
  type Army,
  type GameState,
  type Province,
  type ProvinceId,
  type RealmId,
  type Treaty,
  type TreatyKind,
  type UnitCounts,
} from "./types.js";

export function allocId(state: GameState, prefix: string): string {
  const id = `${prefix}${state.nextId}`;
  state.nextId += 1;
  return id;
}

export function isRealm(state: GameState, id: RealmId): boolean {
  return id in state.realms;
}

export function realmProvinces(state: GameState, realm: RealmId): Province[] {
  return Object.values(state.provinces).filter((p) => p.owner === realm);
}

export function realmArmies(state: GameState, realm: RealmId): Army[] {
  return Object.values(state.armies).filter((a) => a.realm === realm);
}

export function armiesIn(state: GameState, province: ProvinceId): Army[] {
  return Object.values(state.armies).filter((a) => a.province === province);
}

export function atWar(state: GameState, a: RealmId, b: RealmId): boolean {
  if (a === b) return false;
  if (a === REBELS || b === REBELS) return true;
  if (a === NEUTRAL || b === NEUTRAL) return false;
  return state.wars.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function treatyBetween(state: GameState, a: RealmId, b: RealmId, kind?: TreatyKind): Treaty | undefined {
  return state.treaties.find(
    (t) =>
      ((t.parties[0] === a && t.parties[1] === b) || (t.parties[0] === b && t.parties[1] === a)) &&
      (kind === undefined || t.kind === kind),
  );
}

export function allied(state: GameState, a: RealmId, b: RealmId): boolean {
  return treatyBetween(state, a, b, "alliance") !== undefined;
}

/** Whether armies of `realm` may stand in `province`. */
export function mayEnter(state: GameState, realm: RealmId, province: Province): boolean {
  if (province.owner === realm) return true;
  if (province.owner === NEUTRAL) return true;
  if (atWar(state, realm, province.owner)) return true;
  return allied(state, realm, province.owner);
}

export function isBorderProvince(state: GameState, p: Province): boolean {
  return p.neighbors.some((n) => state.provinces[n]!.owner !== p.owner);
}

export function garrisonCompanies(state: GameState, p: Province): number {
  return armiesIn(state, p.id)
    .filter((a) => a.realm === p.owner)
    .reduce((sum, a) => sum + totalCompanies(a.units), 0);
}

export function hasClaim(state: GameState, realm: RealmId, target: RealmId): boolean {
  return Object.values(state.provinces).some((p) => p.owner === target && p.claims.includes(realm));
}

export function hasResource(state: GameState, realm: RealmId, resource: Province["resources"][number]): boolean {
  return realmProvinces(state, realm).some((p) => p.resources.includes(resource));
}

/** Own the resource, or trade with a realm that does. Scarcity is what ambassadors bargain over. */
export function hasAccessTo(state: GameState, realm: RealmId, resource: Province["resources"][number]): boolean {
  if (hasResource(state, realm, resource)) return true;
  return state.treaties.some((t) => t.kind === "trade" && t.parties.includes(realm) && hasResource(state, t.parties[0] === realm ? t.parties[1] : t.parties[0], resource));
}

export interface TradeRoute {
  from: ProvinceId;
  to: ProvinceId;
  realm: RealmId;
  kind: "road" | "sea";
}

/**
 * Trade as geography: each market reaches foreign markets within four steps
 * over land not held by an enemy, and each port reaches every port of a
 * realm not at war with us. War blockades; peace opens roads.
 */
export function tradeRoutes(state: GameState, realm: RealmId): TradeRoute[] {
  const routes: TradeRoute[] = [];
  const markets = realmProvinces(state, realm).filter((p) => p.buildings.market > 0);
  const foreignMarket = (p: Province) => p.owner !== realm && p.owner in state.realms && !atWar(state, realm, p.owner) && p.buildings.market > 0;
  const seen = new Set<string>();
  for (const m of markets) {
    const queue: Array<{ id: ProvinceId; depth: number }> = [{ id: m.id, depth: 0 }];
    const visited = new Set([m.id]);
    while (queue.length) {
      const { id, depth } = queue.shift()!;
      const p = state.provinces[id]!;
      if (id !== m.id && foreignMarket(p)) {
        const key = `${m.id}>${p.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          routes.push({ from: m.id, to: p.id, realm: p.owner, kind: "road" });
        }
      }
      if (depth >= 4) continue;
      for (const n of p.neighbors) {
        const np = state.provinces[n]!;
        if (visited.has(n)) continue;
        if (np.owner !== NEUTRAL && np.owner !== realm && atWar(state, realm, np.owner)) continue;
        if (np.owner === REBELS) continue;
        visited.add(n);
        queue.push({ id: n, depth: depth + 1 + (np.buildings.road ? 0 : 0.5) });
      }
    }
    if (m.coastal) {
      for (const port of Object.values(state.provinces)) {
        if (!port.coastal || !foreignMarket(port)) continue;
        const key = `${m.id}>${port.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push({ from: m.id, to: port.id, realm: port.owner, kind: "sea" });
      }
    }
  }
  return routes;
}

export function livingRealms(state: GameState): RealmId[] {
  return Object.values(state.realms)
    .filter((r) => !r.eliminated)
    .map((r) => r.id);
}

export function landProvinceCount(state: GameState): number {
  return Object.keys(state.provinces).length;
}

export const TERRAIN_FOOD: Record<Province["terrain"], number> = {
  plains: 1.2,
  hills: 0.9,
  forest: 0.9,
  mountains: 0.6,
  marsh: 0.8,
};

export const TERRAIN_DEFENCE: Record<Province["terrain"], number> = {
  plains: 1,
  hills: 1.2,
  forest: 1.15,
  mountains: 1.4,
  marsh: 1.1,
};

export const BUILDING_COST: Record<Province["buildings"] extends Record<infer K, number> ? K : never, number> = {
  farm: 8,
  market: 12,
  fort: 20,
  road: 6,
  mine: 15,
  granary: 10,
  shrine: 10,
  barracks: 15,
};

export const BUILDING_MAX: Record<keyof Province["buildings"], number> = {
  farm: 3,
  market: 2,
  fort: 3,
  road: 1,
  mine: 2,
  granary: 2,
  shrine: 1,
  barracks: 1,
};

export const UNIT_COST: Record<keyof UnitCounts, number> = { levy: 2, regular: 5, cavalry: 8, siege: 10 };
export const UNIT_UPKEEP: Record<keyof UnitCounts, number> = { levy: 0.25, regular: 0.5, cavalry: 0.8, siege: 1 };
export const UNIT_STRENGTH: Record<keyof UnitCounts, number> = { levy: 1, regular: 2, cavalry: 3, siege: 0.5 };

/** Food produced by one province this season, thousands of rations. */
export function foodProduced(p: Province): number {
  const farmBonus = 1 + 0.35 * p.buildings.farm;
  const grain = p.resources.includes("grain") ? 1.1 : 1;
  return p.fertility * 1.6 * TERRAIN_FOOD[p.terrain] * farmBonus * grain * Math.sqrt(Math.max(0, p.population)) + 3 * p.buildings.farm;
}

export function foodNeeded(p: Province): number {
  return Math.max(0, p.population);
}

export function foodRatio(p: Province): number {
  const need = foodNeeded(p);
  return need <= 0 ? 2 : foodProduced(p) / need;
}

/** Population a province can feed and house before growth stalls. */
export function carryingCapacity(p: Province): number {
  return p.fertility * 8 + p.cells.length * 3 + p.buildings.farm * 6 + p.development * 2;
}

export function granaryCapacity(p: Province): number {
  return 5 + 15 * p.buildings.granary;
}

/** Combat value of an army before terrain and fort modifiers. */
export function armyStrength(army: Army, terrain: Province["terrain"]): number {
  const cavalryMod = terrain === "plains" ? 1 : terrain === "hills" ? 0.8 : 0.6;
  const raw =
    army.units.levy * UNIT_STRENGTH.levy +
    army.units.regular * UNIT_STRENGTH.regular +
    army.units.cavalry * UNIT_STRENGTH.cavalry * cavalryMod +
    army.units.siege * UNIT_STRENGTH.siege;
  const moraleMod = 0.5 + army.morale / 100;
  return raw * moraleMod;
}

export function siegeStrength(army: Army): number {
  return 1 + army.units.siege * 4 + army.units.regular * 0.5 + army.units.levy * 0.25;
}

export function realmStrength(state: GameState, realm: RealmId): number {
  return realmArmies(state, realm).reduce((s, a) => s + armyStrength(a, "plains"), 0);
}

export function upkeepOf(state: GameState, army: Army): number {
  const base =
    army.units.levy * UNIT_UPKEEP.levy +
    army.units.regular * UNIT_UPKEEP.regular +
    army.units.cavalry * UNIT_UPKEEP.cavalry +
    army.units.siege * UNIT_UPKEEP.siege;
  const abroad = state.provinces[army.province]!.owner !== army.realm;
  return base * (abroad ? 1.5 : 1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
