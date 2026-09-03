/**
 * A deterministic steward policy. It plays a realm when its sovereign agent
 * is absent and the Regent chooses to proceed without it, and it gives tests
 * a way to simulate many seasons without a model in the loop.
 */
import { validateOrder } from "./orders.js";
import { createRng } from "./rng.js";
import { armiesIn, armyStrength, atWar, foodNeeded, foodProduced, hasClaim, realmArmies, realmProvinces, realmStrength, TERRAIN_DEFENCE, treatyBetween } from "./state.js";
import { NEUTRAL, REBELS, type GameState, type Order, type RealmId } from "./types.js";

/** Breadth-first step from `from` through own provinces to one satisfying `goal`. */
function nextStepToward(state: GameState, realmId: RealmId, from: string, goal: (p: GameState["provinces"][string]) => boolean): string | null {
  const queue: Array<{ id: string; first: string | null }> = [{ id: from, first: null }];
  const seen = new Set([from]);
  while (queue.length) {
    const { id, first } = queue.shift()!;
    const p = state.provinces[id]!;
    if (id !== from && goal(p)) return first;
    for (const n of p.neighbors) {
      const np = state.provinces[n]!;
      if (seen.has(n) || np.owner !== realmId) continue;
      seen.add(n);
      queue.push({ id: n, first: first ?? n });
    }
  }
  return null;
}

/** 0 = cautious, 1 = warlike; read off the realm's character line. */
export function temperamentOf(character: string): number {
  if (/martial|horse-lords|ambitious/.test(character)) return 1;
  if (/pious|old/.test(character)) return 0.5;
  return 0.15;
}

export function autoOrders(state: GameState, realmId: RealmId): Order[] {
  const realm = state.realms[realmId];
  if (!realm || realm.eliminated) return [];
  const rng = createRng(`${state.seed}:auto:${realmId}:${state.season}`);
  const orders: Order[] = [];
  let budget = realm.treasury;
  const push = (o: Order, cost = 0): boolean => {
    if (validateOrder(state, realmId, o) !== null || cost > budget) return false;
    orders.push(o);
    budget -= cost;
    return true;
  };
  const owned = realmProvinces(state, realmId);
  const enemies = Object.keys(state.realms).filter((r) => atWar(state, realmId, r));

  // Respond to proposals.
  for (const p of state.proposals) {
    if (p.status !== "pending" || p.to !== realmId) continue;
    const regard = realm.relations[p.from] ?? 0;
    const losing = realmStrength(state, realmId) < realmStrength(state, p.from) * 0.8;
    let accept = false;
    if (p.kind === "peace") {
      const demanded = (p.terms.demandedProvinces ?? []).length > 0 || (p.terms.tribute ?? 0) < 0;
      const winning = realmStrength(state, realmId) > realmStrength(state, p.from) * 1.3;
      accept = losing || (!demanded && !winning && (regard > -30 || rng.chance(0.35)));
    }
    else if (p.kind === "trade") accept = regard > -30;
    else if (p.kind === "non_aggression") accept = regard > -20;
    else if (p.kind === "alliance") accept = regard > 30;
    else if (p.kind === "tribute") accept = (p.terms.tribute ?? 0) < 0 || losing;
    push({ kind: "respond", proposalId: p.id, accept, message: accept ? "Agreed." : "We must decline." });
  }

  // Food first: farms where hungry.
  for (const p of owned.sort((a, b) => foodProduced(a) / Math.max(1, foodNeeded(a)) - foodProduced(b) / Math.max(1, foodNeeded(b)))) {
    if (foodProduced(p) / Math.max(1, foodNeeded(p)) < 1.1) push({ kind: "build", province: p.id, building: "farm" }, 8 * (1 + 0.5 * p.buildings.farm));
  }
  // Then prosperity.
  if (budget > 40) {
    const rich = owned.filter((p) => p.development >= 2).sort((a, b) => b.development - a.development)[0];
    if (rich) push({ kind: "build", province: rich.id, building: "market" }, 12 * (1 + 0.5 * rich.buildings.market));
  }
  if (budget > 40) {
    const mineable = owned.find((p) => p.resources.some((r) => r === "gold" || r === "iron" || r === "salt") && p.buildings.mine < 2);
    if (mineable) push({ kind: "build", province: mineable.id, building: "mine" }, 15 * (1 + 0.5 * mineable.buildings.mine));
  }
  // Unrest.
  for (const p of owned) if (p.unrest > 55 && budget > 25) push({ kind: "build", province: p.id, building: "shrine" }, 10);

  // Military: keep the capital held; muster when threatened or at war.
  const threatened = owned.some((p) => p.neighbors.some((n) => armiesIn(state, n).some((a) => atWar(state, realmId, a.realm))));
  const rebelsAtHome = owned.some((p) => armiesIn(state, p.id).some((a) => a.realm === REBELS));
  const myStrength = realmStrength(state, realmId);
  const enemyStrength = enemies.reduce((s, e) => s + realmStrength(state, e), 0);
  const temperament = temperamentOf(realm.character);
  const underArmed = myStrength < owned.length * (3 + temperament * 3);
  if ((threatened || rebelsAtHome || (enemies.length > 0 && myStrength < enemyStrength * 1.2) || (underArmed && budget > 45)) && budget > 15) {
    const cap = state.provinces[realm.capital]!;
    const unit = cap.buildings.barracks || cap.capitalOf === realmId ? "regular" : "levy";
    const companies = Math.max(1, Math.min(4, Math.floor(budget / (unit === "regular" ? 5 : 2)) - 1));
    push({ kind: "muster", province: cap.id, unit, companies }, (unit === "regular" ? 5 : 2) * companies);
  }
  // Move armies: defend, then attack.
  for (const a of realmArmies(state, realmId)) {
    const here = state.provinces[a.province]!;
    const rebelHere = armiesIn(state, here.id).some((x) => x.realm === REBELS);
    if (rebelHere) continue; // fight where we stand
    const troubled = owned.find((p) => p.id !== here.id && here.neighbors.includes(p.id) && armiesIn(state, p.id).some((x) => x.realm !== realmId && (x.realm === REBELS || atWar(state, realmId, x.realm))));
    if (troubled) {
      push({ kind: "move", army: a.id, to: troubled.id });
      continue;
    }
    if (enemies.length > 0 && myStrength > enemyStrength * 1.05) {
      const targets = here.neighbors
        .map((n) => state.provinces[n]!)
        .filter((p) => enemies.includes(p.owner))
        .map((p) => ({ p, defence: armiesIn(state, p.id).reduce((s, x) => s + armyStrength(x, p.terrain), 0) * TERRAIN_DEFENCE[p.terrain] * (1 + 0.25 * p.buildings.fort) }))
        .sort((x, y) => x.defence - y.defence);
      const target = targets[0];
      if (target && armyStrength(a, target.p.terrain) > target.defence * 1.1) {
        push({ kind: "move", army: a.id, to: target.p.id });
        continue;
      }
      if (!target && here.owner === realmId) {
        // March toward the front: nearest own province that touches the enemy.
        const step = nextStepToward(state, realmId, here.id, (p) => p.neighbors.some((n) => enemies.includes(state.provinces[n]!.owner)));
        if (step) {
          push({ kind: "move", army: a.id, to: step });
          continue;
        }
      }
    }
    // Defend: step toward own provinces where enemies stand or mass at the border.
    if (enemies.length > 0 && here.owner === realmId) {
      const step = nextStepToward(state, realmId, here.id, (p) => armiesIn(state, p.id).some((x) => x.realm !== realmId && atWar(state, realmId, x.realm)) || p.neighbors.some((n) => armiesIn(state, n).some((x) => enemies.includes(x.realm))));
      if (step && myStrength <= enemyStrength * 1.05) {
        push({ kind: "move", army: a.id, to: step });
        continue;
      }
    }
    // Otherwise drift home to the capital if abroad and idle.
    if (here.owner !== realmId && !a.besieging) {
      const home = here.neighbors.find((n) => state.provinces[n]!.owner === realmId);
      if (home) push({ kind: "move", army: a.id, to: home });
    }
  }

  // Diplomacy: seek trade with friendly neighbours, peace when losing, war when strong and wronged.
  for (const other of Object.values(state.realms)) {
    if (other.id === realmId || other.eliminated) continue;
    const regard = realm.relations[other.id] ?? 0;
    const alreadyAsked = state.proposals.some((p) => p.status === "pending" && p.from === realmId && p.to === other.id);
    if (alreadyAsked) continue;
    if (atWar(state, realmId, other.id)) {
      if (realmStrength(state, realmId) < realmStrength(state, other.id) * 0.7 || rng.chance(0.15)) push({ kind: "propose", proposal: { to: other.id, kind: "peace", terms: { seasons: 8 }, message: "Let the swords rest; we propose a peace on present borders." } });
      continue;
    }
    if (regard > 0 && !treatyBetween(state, realmId, other.id, "trade") && rng.chance(0.4 - temperament * 0.25)) push({ kind: "propose", proposal: { to: other.id, kind: "trade", terms: {}, message: "Our merchants would profit from open roads between us." } });
    else if (regard > 25 && !treatyBetween(state, realmId, other.id, "non_aggression") && rng.chance(0.3)) push({ kind: "propose", proposal: { to: other.id, kind: "non_aggression", terms: { seasons: 12 }, message: "Let neither of us draw steel on the other for twelve seasons." } });
  }
  if (enemies.length === 0 && realm.infamy < 20 && !threatened && state.season >= 4) {
    const ratioNeeded = 1.5 - temperament * 0.4;
    const regardLimit = -25 + temperament * 30;
    const prey = Object.values(state.realms)
      .filter((o) => o.id !== realmId && !o.eliminated && hasClaim(state, realmId, o.id) && (realm.relations[o.id] ?? 0) < regardLimit && !treatyBetween(state, realmId, o.id))
      .filter((o) => {
        const distracted = Object.keys(state.realms).some((x) => x !== realmId && atWar(state, o.id, x));
        return realmStrength(state, realmId) > realmStrength(state, o.id) * (distracted ? ratioNeeded * 0.8 : ratioNeeded);
      })
      .sort((a, b) => realmStrength(state, a.id) - realmStrength(state, b.id));
    if (prey.length > 0 && rng.chance(0.2 + temperament * 0.3)) push({ kind: "declare_war", target: prey[0]!.id });
  }
  // Colonize a cheap free neighbour when rich.
  if (budget > 60) {
    for (const p of owned) {
      const free = p.neighbors.map((n) => state.provinces[n]!).find((n) => n.owner === NEUTRAL);
      if (free && push({ kind: "colonize", province: free.id, from: p.id }, 10 + free.population * 1.5)) break;
    }
  }
  return orders;
}
