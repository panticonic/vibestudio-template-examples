/**
 * Season resolution. Pure: (state, orders) → (state', events, rejected).
 * Order of operations matters and is fixed:
 *   1. laws and diplomacy responses   5. movement and battles
 *   2. spending (build, muster…)      6. sieges and captures
 *   3. war declarations                7. economy and population
 *   4. edicts                          8. bookkeeping, victory
 */
import { edictEffects } from "./laws.js";
import { bumpStanding, bumpTrait, heirVerdict, moodOf } from "./court.js";
import { generateCrises, resolvedOption, describeEffects } from "./crises.js";
import { describeOrder, orderCost, validateOrder, colonizeCost } from "./orders.js";
import { createRng, type Rng } from "./rng.js";
import {
  allocId,
  armiesIn,
  armyStrength,
  atWar,
  clamp,
  foodNeeded,
  foodProduced,
  granaryCapacity,
  carryingCapacity,
  hasClaim,
  landProvinceCount,
  livingRealms,
  realmArmies,
  realmProvinces,
  round1,
  siegeStrength,
  TERRAIN_DEFENCE,
  tradeRoutes,
  treatyBetween,
  upkeepOf,
  UNIT_COST,
} from "./state.js";
import {
  emptyUnits,
  ESTATES,
  NEUTRAL,
  REBELS,
  seasonLabel,
  totalCompanies,
  type Army,
  type Crisis,
  type Estate,
  type GameEvent,
  type GameState,
  type Order,
  type Province,
  type Realm,
  type RealmId,
  type SubmittedOrder,
  type Treaty,
  type UnitKind,
} from "./types.js";

export interface RejectedOrder {
  order: SubmittedOrder;
  reason: string;
}

export interface ResolutionResult {
  state: GameState;
  events: GameEvent[];
  rejected: RejectedOrder[];
}

export interface ResolutionExtras {
  /** Orders the Regent vetoed this season; they shape the heir without taking effect. */
  vetoed?: Order[];
  /** Crisis kinds to force at the start of the next season. */
  forcedCrises?: string[];
}

const PROPOSAL_TTL_SEASONS = 4;

/** Legitimacy is the weighted consent of the estates. */
export function consentOf(estates: Realm["estates"]): number {
  return Math.round(estates.peasants * 0.35 + estates.burghers * 0.25 + estates.clergy * 0.2 + estates.nobles * 0.2);
}

/** Adjust estate satisfaction for a realm; the player's legitimacy follows. */
export function consent(state: GameState, realm: RealmId, deltas: Partial<Record<Estate, number>> | number): void {
  const r = state.realms[realm];
  if (!r) return;
  for (const estate of ESTATES) {
    const d = typeof deltas === "number" ? deltas : (deltas[estate] ?? 0);
    if (d) r.estates[estate] = clamp(round1(r.estates[estate] + d), 0, 100);
  }
  if (realm === state.playerRealm) r.legitimacy = consentOf(r.estates);
}

export function resolveSeason(input: GameState, orders: SubmittedOrder[], extras: ResolutionExtras = {}): ResolutionResult {
  const state: GameState = structuredClone(input);
  const events: GameEvent[] = [];
  const rejected: RejectedOrder[] = [];
  const rng = createRng(`${state.seed}:season:${state.season}`);
  const before = {
    treasury: state.realms[state.playerRealm]!.treasury,
    legitimacy: state.realms[state.playerRealm]!.legitimacy,
    provinces: realmProvinces(state, state.playerRealm).length,
    unrest: avgUnrest(state, state.playerRealm),
    standing: Object.fromEntries(Object.entries(state.court).map(([k, v]) => [k, v.standing])) as Record<string, number>,
  };
  let legitimacyFloor = 0;
  const log = (kind: GameEvent["kind"], text: string, realms: RealmId[], extra: Partial<GameEvent> = {}) => {
    events.push({ season: state.season, kind, text, realms, ...extra });
  };
  const label = seasonLabel(state);
  const rn = (id: RealmId) => state.realms[id]?.name ?? (id === NEUTRAL ? "the free folk" : id === REBELS ? "rebels" : id);

  for (const r of Object.values(state.realms)) {
    r.ledger = {
      season: state.season,
      taxIncome: 0,
      tradeIncome: 0,
      resourceIncome: 0,
      tributeNet: 0,
      routeIncome: 0,
      routes: 0,
      upkeep: 0,
      buildSpend: 0,
      musterSpend: 0,
      doleSpend: 0,
      foodProduced: 0,
      foodConsumed: 0,
      net: 0,
    };
  }

  // ── 0. The Regent's decisions on this season's crises ────────────────────
  for (const c of state.crises) {
    if (c.season !== state.season || c.decidedBy === "resolved") continue;
    if (c.chosen === null) {
      c.chosen = c.defaultOption;
      c.decidedBy = c.decidedBy ?? "default";
    }
    const option = resolvedOption(c);
    for (const fx of option.effects) {
      switch (fx.kind) {
        case "treasury":
          state.realms[c.realm]!.treasury = round1(state.realms[c.realm]!.treasury + fx.amount);
          break;
        case "estate":
          consent(state, c.realm, { [fx.estate]: fx.amount });
          break;
        case "estates":
          consent(state, c.realm, fx.amount);
          break;
        case "unrest":
          for (const p of fx.province === "all" ? realmProvinces(state, c.realm) : [state.provinces[fx.province]!].filter(Boolean)) p.unrest = clamp(p.unrest + fx.amount, 0, 100);
          break;
        case "population": {
          const p = state.provinces[fx.province];
          if (p) p.population = round1(Math.max(1, p.population * fx.factor));
          break;
        }
        case "heir":
          if (c.realm === state.playerRealm) bumpTrait(state, fx.trait, fx.amount);
          break;
        case "reputation":
          if (c.realm === state.playerRealm) state.regent.reputation = clamp(state.regent.reputation + fx.amount, 0, 100);
          break;
        case "relation":
          adjustRelation(state, fx.realm, c.realm, fx.amount);
          adjustRelation(state, c.realm, fx.realm, fx.amount / 2);
          break;
        case "army": {
          const p = state.provinces[fx.province];
          if (p) addUnits(state, state.realms[c.realm]!, p, fx.unit, fx.companies);
          break;
        }
        case "province_to": {
          const p = state.provinces[fx.province];
          if (p && p.owner !== fx.realm) transferProvince(state, p, fx.realm, log, rn);
          break;
        }
        case "war":
          if (!atWar(state, c.realm, fx.realm)) declareWar(state, state.realms[fx.realm]!, state.realms[c.realm]!, log);
          break;
        case "prestige":
          state.realms[c.realm]!.prestige = Math.max(0, state.realms[c.realm]!.prestige + fx.amount);
          break;
        case "infamy":
          state.realms[c.realm]!.infamy = clamp(state.realms[c.realm]!.infamy + fx.amount, 0, 100);
          break;
        case "granary":
          for (const p of fx.province === "all" ? realmProvinces(state, c.realm) : [state.provinces[fx.province]!].filter(Boolean)) p.granary = round1(Math.min(granaryCapacity(p) + fx.amount, p.granary + fx.amount));
          break;
        case "standing":
          bumpStanding(state, fx.role, fx.amount);
          break;
        case "tutor":
          state.heir.tutor = fx.role;
          break;
        case "fertility": {
          const p = state.provinces[fx.province];
          if (p) p.fertility = clamp(p.fertility + fx.amount, 1, 5);
          break;
        }
        case "disband_rebels":
          for (const a of armiesIn(state, fx.province)) if (a.realm === REBELS) delete state.armies[a.id];
          break;
        case "legitimacy_floor":
          legitimacyFloor = Math.max(legitimacyFloor, fx.amount);
          break;
      }
    }
    c.decidedBy = "resolved";
    log("crisis", `${c.title}: the Regent chose “${option.label}”${c.chosen === c.defaultOption && option.id === c.defaultOption ? "" : ""} — ${describeEffects(state, option.effects)}.`, [c.realm], { province: c.province, data: { crisisId: c.id, option: option.id } });
  }
  // Vetoes teach the heir too.
  for (const o of extras.vetoed ?? []) {
    if (o.kind === "declare_war") bumpTrait(state, "cautious", 1);
    if (o.kind === "set_tax" && o.taxRate > 0.4) bumpTrait(state, "just", 0.5);
  }

  // ── 1–3. Orders ───────────────────────────────────────────────────────────
  const phaseOf = (o: Order): number => {
    switch (o.kind) {
      case "set_tax":
      case "set_conscription":
      case "set_granary_reserve":
      case "enact_edict":
      case "repeal_edict":
      case "respond":
      case "withdraw":
      case "propose":
      case "cede_province":
        return 1;
      case "build":
      case "muster":
      case "colonize":
      case "merge":
      case "disband":
        return 2;
      case "declare_war":
        return 3;
      case "move":
        return 4;
    }
  };
  const ordered = [...orders].sort((a, b) => phaseOf(a.order) - phaseOf(b.order) || a.id.localeCompare(b.id));
  for (const submitted of ordered) {
    const realm = state.realms[submitted.realm];
    if (!realm) {
      rejected.push({ order: submitted, reason: `unknown realm ${submitted.realm}` });
      continue;
    }
    const problem = validateOrder(state, submitted.realm, submitted.order);
    if (problem) {
      rejected.push({ order: submitted, reason: problem });
      continue;
    }
    const cost = orderCost(state, submitted.realm, submitted.order);
    if (cost > 0 && realm.treasury < cost) {
      rejected.push({ order: submitted, reason: `${describeOrder(state, submitted.order)} costs ${round1(cost)} gold; treasury is ${round1(realm.treasury)}` });
      continue;
    }
    applyOrder(state, realm, submitted, cost, log, rn);
    if (submitted.realm === state.playerRealm) teachHeir(state, submitted.order);
  }

  // Expire stale proposals.
  for (const p of state.proposals) {
    if (p.status === "pending" && state.season - p.season >= PROPOSAL_TTL_SEASONS) {
      p.status = "expired";
      log("proposal", `${rn(p.from)}'s ${p.kind.replace("_", "-")} proposal to ${rn(p.to)} lapsed unanswered.`, [p.from, p.to]);
    }
  }

  // ── 4. Edicts (per province effects computed before economy) ──────────────
  const effects = new Map<string, ReturnType<typeof edictEffects>>();
  for (const p of Object.values(state.provinces)) {
    const realm = state.realms[p.owner];
    if (!realm) continue;
    const fx = edictEffects(state, p, realm.laws.edicts);
    effects.set(p.id, fx);
    for (const building of fx.publicWorks) {
      const order: Order = { kind: "build", province: p.id, building };
      if (validateOrder(state, realm.id, order) === null) {
        const cost = orderCost(state, realm.id, order);
        if (realm.treasury >= cost + 10) {
          realm.treasury -= cost;
          realm.ledger.buildSpend += cost;
          p.buildings[building] += 1;
          if (building === "fort") p.fortHp = p.buildings.fort * 10;
          log("law", `Under edict, ${p.name} raised a ${building}.`, [realm.id], { province: p.id });
        }
      }
    }
    if (fx.garrisonLevy > 0) {
      const present = armiesIn(state, p.id).filter((a) => a.realm === realm.id);
      const have = present.reduce((s, a) => s + a.units.levy, 0);
      const want = fx.garrisonLevy - have;
      if (want > 0 && p.population >= 3 + want * 0.5) {
        const cost = UNIT_COST.levy * want;
        if (realm.treasury >= cost + 5) {
          realm.treasury -= cost;
          realm.ledger.musterSpend += cost;
          addUnits(state, realm, p, "levy", want);
          log("law", `Under edict, ${p.name} raised ${want} levy compan${want === 1 ? "y" : "ies"}.`, [realm.id], { province: p.id });
        }
      }
    }
  }

  // ── 5. Movement ───────────────────────────────────────────────────────────
  const origins = new Map<string, string>();
  for (const a of Object.values(state.armies)) {
    if (!a.moveTo) continue;
    const to = state.provinces[a.moveTo];
    const from = state.provinces[a.province]!;
    a.moveTo = null;
    if (!to || !from.neighbors.includes(to.id)) continue;
    origins.set(a.id, a.province);
    a.province = to.id;
    a.besieging = false;
    log("march", `${a.name} marched from ${from.name} to ${to.name}.`, [a.realm], { province: to.id, data: { army: a.id, realm: a.realm, from: from.id, to: to.id } });
  }

  // ── 5b. Battles ───────────────────────────────────────────────────────────
  for (const p of Object.values(state.provinces)) {
    resolveBattlesIn(state, p, rng, origins, log, rn);
  }

  // ── 6. Sieges, captures, neutral militias ─────────────────────────────────
  for (const p of Object.values(state.provinces)) {
    const present = armiesIn(state, p.id);
    if (present.length === 0) continue;
    const hostile = present.filter((a) => a.realm !== p.owner && (p.owner === NEUTRAL || atWar(state, a.realm, p.owner)));
    if (hostile.length === 0) continue;
    const defenders = present.filter((a) => a.realm === p.owner);
    if (defenders.length > 0) continue; // battle was indecisive; no siege this season
    // Neutral militia resists once; rebels holding a province they rose in
    // deliver it to independence.
    const attackerRealm = hostile[0]!.realm;
    if (p.owner === NEUTRAL) {
      if (attackerRealm === REBELS) continue;
      const militia = p.population * 0.15 + p.buildings.fort * 3;
      const force = hostile.reduce((s, a) => s + armyStrength(a, p.terrain), 0);
      if (force > militia) {
        captureProvince(state, p, attackerRealm, "seized", log, rn);
      } else {
        log("battle", `${p.name}'s militia turned back ${rn(attackerRealm)}'s ${hostile.map((a) => a.name).join(", ")}.`, [attackerRealm], { province: p.id });
        for (const a of hostile) a.morale = clamp(a.morale - 10, 10, 100);
      }
      continue;
    }
    if (p.buildings.fort === 0 || p.fortHp <= 0) {
      if (attackerRealm === REBELS) {
        const former = p.owner;
        p.owner = NEUTRAL;
        p.capitalOf = null;
        p.unrest = 30;
        for (const a of hostile) delete state.armies[a.id];
        log("revolt", `${p.name} threw off ${rn(former)}'s rule and declared itself free.`, [former], { province: p.id });
        onProvinceLost(state, former, p, log, rn);
      } else {
        captureProvince(state, p, attackerRealm, "captured", log, rn);
      }
      continue;
    }
    const power = hostile.reduce((s, a) => s + siegeStrength(a), 0);
    p.fortHp = Math.max(0, p.fortHp - power);
    for (const a of hostile) a.besieging = true;
    if (p.fortHp <= 0) {
      p.buildings.fort = Math.max(0, p.buildings.fort - 1);
      p.fortHp = p.buildings.fort * 10;
      if (attackerRealm === REBELS) {
        const former = p.owner;
        p.owner = NEUTRAL;
        p.capitalOf = null;
        for (const a of hostile) delete state.armies[a.id];
        log("revolt", `The walls of ${p.name} fell to the rebels; the province is free of ${rn(former)}.`, [former], { province: p.id });
        onProvinceLost(state, former, p, log, rn);
      } else {
        captureProvince(state, p, attackerRealm, "stormed", log, rn);
      }
    } else {
      log("siege", `${rn(attackerRealm)} besieges ${p.name}; the walls hold (${Math.ceil(p.fortHp)} left).`, [attackerRealm, p.owner], { province: p.id });
    }
  }
  // Fort repair when not besieged.
  for (const p of Object.values(state.provinces)) {
    const besieged = armiesIn(state, p.id).some((a) => a.besieging);
    if (!besieged && p.buildings.fort > 0 && p.fortHp < p.buildings.fort * 10) p.fortHp = Math.min(p.buildings.fort * 10, p.fortHp + 3);
  }

  // ── 7. Economy and population per realm ───────────────────────────────────
  for (const realm of Object.values(state.realms)) {
    if (realm.eliminated) continue;
    runEconomy(state, realm, effects, log, rn);
  }
  // Tribute transfers.
  for (const t of state.treaties) {
    if (t.kind !== "tribute" || !t.tribute) continue;
    const payer = state.realms[t.parties[0]]!;
    const payee = state.realms[t.parties[1]]!;
    if (payer.treasury >= t.tribute) {
      payer.treasury -= t.tribute;
      payee.treasury += t.tribute;
      payer.ledger.tributeNet -= t.tribute;
      payee.ledger.tributeNet += t.tribute;
    } else {
      t.seasonsLeft = 0;
      payer.infamy = clamp(payer.infamy + 15, 0, 100);
      adjustRelation(state, payee.id, payer.id, -25);
      log("treaty", `${payer.name} defaulted on its tribute to ${payee.name}.`, [payer.id, payee.id]);
    }
  }
  for (const realm of Object.values(state.realms)) realm.ledger.net = round1(realm.ledger.taxIncome + realm.ledger.tradeIncome + realm.ledger.resourceIncome + realm.ledger.tributeNet - realm.ledger.upkeep - realm.ledger.buildSpend - realm.ledger.musterSpend - realm.ledger.doleSpend);

  // ── 8. Bookkeeping ────────────────────────────────────────────────────────
  // Treaties with a term run down; expired ones are removed.
  state.treaties = state.treaties.filter((t) => {
    if (t.seasonsLeft === null) return true;
    t.seasonsLeft -= 1;
    if (t.seasonsLeft <= 0) {
      log("treaty", `The ${t.kind.replace("_", "-")} between ${rn(t.parties[0])} and ${rn(t.parties[1])} has run its course.`, [...t.parties]);
      return false;
    }
    return true;
  });
  // Relations drift, infamy decays, prestige accrues.
  const living = livingRealms(state);
  for (const a of living) {
    const ra = state.realms[a]!;
    ra.infamy = clamp(ra.infamy - 2, 0, 100);
    if (state.season % 4 === 3) ra.prestige += realmProvinces(state, a).length;
    ra.prestige = Math.max(0, ra.prestige - ra.infamy / 10);
    for (const b of living) {
      if (a === b) continue;
      let delta = 0;
      if (atWar(state, a, b)) delta -= 3;
      if (treatyBetween(state, a, b, "alliance")) delta += 2;
      if (treatyBetween(state, a, b, "trade")) delta += 1;
      if (treatyBetween(state, a, b, "non_aggression")) delta += 1;
      if (hasClaim(state, a, b)) delta -= 1;
      delta -= state.realms[b]!.infamy / 25;
      // Drift toward neutral.
      const current = ra.relations[b] ?? 0;
      delta += current > 0 ? -0.5 : current < 0 ? 0.5 : 0;
      ra.relations[b] = clamp(round1(current + delta), -100, 100);
    }
  }
  // Eliminations.
  for (const realm of Object.values(state.realms)) {
    if (realm.eliminated) continue;
    if (realmProvinces(state, realm.id).length === 0) {
      realm.eliminated = true;
      for (const a of realmArmies(state, realm.id)) delete state.armies[a.id];
      state.wars = state.wars.filter(([x, y]) => x !== realm.id && y !== realm.id);
      state.treaties = state.treaties.filter((t) => !t.parties.includes(realm.id));
      for (const p of state.proposals) if (p.status === "pending" && (p.from === realm.id || p.to === realm.id)) p.status = "expired";
      log("elimination", `${realm.name} has passed from the map.`, [realm.id]);
    }
  }
  // Estates: the slow politics of consent, for every realm.
  for (const realm of Object.values(state.realms)) {
    if (realm.eliminated) continue;
    const owned = realmProvinces(state, realm.id);
    const deltas: Record<Estate, number> = { peasants: 0, burghers: 0, clergy: 0, nobles: 0 };
    const tax = realm.laws.taxRate;
    deltas.peasants += (0.3 - tax) * 25;
    deltas.burghers += (0.3 - tax) * 15;
    if (realm.laws.conscription > 0.5) deltas.peasants -= (realm.laws.conscription - 0.5) * 6;
    const shrines = owned.reduce((n, p) => n + p.buildings.shrine, 0);
    const markets = owned.reduce((n, p) => n + p.buildings.market, 0);
    deltas.clergy += Math.min(3, shrines * 0.6) - realm.infamy / 20;
    deltas.burghers += Math.min(3, markets * 0.5) + Math.min(2, realm.ledger.routes * 0.2);
    const atWarNow = state.wars.some(([a, b]) => a === realm.id || b === realm.id);
    if (atWarNow) {
      deltas.nobles += 0.5;
      deltas.peasants -= 0.8;
      deltas.burghers -= 0.5;
    }
    if (realm.treasury < 0) {
      deltas.burghers -= 3;
      deltas.nobles -= 2;
    }
    const curfews = owned.filter((p) => realm.laws.edicts.some((e) => e.then.some((a) => a.kind === "curfew"))).length;
    if (curfews) deltas.burghers -= 1;
    if (realm.id === state.playerRealm && realm.ledger.doleSpend > 0) deltas.peasants += 1.5;
    // Drift toward an indifferent 55.
    for (const estate of ESTATES) {
      const v = realm.estates[estate];
      deltas[estate] += v > 55 ? -0.6 : v < 55 ? 0.8 : 0;
    }
    consent(state, realm.id, deltas);
  }
  const player = state.realms[state.playerRealm]!;
  if (!player.eliminated) {
    const famine = realmProvinces(state, player.id).filter((p) => p.famineStreak > 0).length;
    if (famine === 0 && player.treasury >= 0) state.regent.reputation = clamp(state.regent.reputation + 0.5, 0, 100);
    if (player.treasury < 0) {
      state.deficitStreak += 1;
      log("legitimacy", `The treasury is empty (${round1(player.treasury)} gold). The burghers and the nobles grumble.`, [player.id]);
    } else state.deficitStreak = 0;
    player.legitimacy = Math.max(consentOf(player.estates), legitimacyFloor);
    // Ministers' standing follows their causes.
    const net = player.ledger.net;
    bumpStanding(state, "treasurer", net > 0 ? 1 : -2);
    const unrestNow = avgUnrest(state, player.id);
    bumpStanding(state, "chancellor", unrestNow < before.unrest ? 1 : unrestNow > before.unrest + 3 ? -1 : 0);
    const atWarNow = state.wars.some(([a, b]) => a === player.id || b === player.id);
    if (atWarNow) {
      if (state.court["marshal"]?.ambition === "glory") bumpStanding(state, "marshal", 1);
      if (state.court["envoy"]?.ambition === "peace") bumpStanding(state, "envoy", -1);
    }
    for (const c of Object.values(state.court)) {
      if (!["chancellor", "treasurer", "marshal", "envoy", "herald"].includes(c.role)) continue;
      c.standing = clamp(round1(c.standing + (c.standing > 50 ? -0.5 : c.standing < 50 ? 0.5 : 0)), 0, 100);
      const beforeStanding = before.standing[c.role] ?? 50;
      const was = moodOf(beforeStanding);
      const now = moodOf(c.standing);
      if (was !== now) log("court", `${c.name}, the ${c.role}, is now ${now} (standing ${Math.round(c.standing)}).`, [player.id], { data: { role: c.role, standing: c.standing } });
    }
  }

  // Reset turn flags and advance.
  for (const realm of Object.values(state.realms)) realm.turnEnded = false;
  for (const a of Object.values(state.armies)) a.morale = clamp(a.morale + 3, 10, 100);
  log("season", `${label} has passed.`, living);
  state.season += 1;
  state.phase = "orders";

  // The digest: what changed and why, in a paragraph.
  const after = state.realms[state.playerRealm]!;
  const digestParts: string[] = [`${label}.`];
  const dTreasury = round1(after.treasury - before.treasury);
  digestParts.push(`Treasury ${dTreasury >= 0 ? "rose" : "fell"} by ${Math.abs(dTreasury)} to ${round1(after.treasury)} (tax ${round1(after.ledger.taxIncome)}, trade ${round1(after.ledger.tradeIncome)} of which ${after.ledger.routes} routes ${round1(after.ledger.routeIncome)}, upkeep ${round1(after.ledger.upkeep)}).`);
  const dLeg = after.legitimacy - before.legitimacy;
  if (dLeg !== 0) digestParts.push(`Legitimacy ${dLeg > 0 ? "rose" : "fell"} to ${after.legitimacy} (${ESTATES.map((e) => `${e} ${Math.round(after.estates[e])}`).join(", ")}).`);
  const provNow = realmProvinces(state, state.playerRealm).length;
  if (provNow !== before.provinces) digestParts.push(`The realm now holds ${provNow} provinces (${provNow > before.provinces ? "+" : ""}${provNow - before.provinces}).`);
  const battles = events.filter((e) => e.kind === "battle" && e.realms.includes(state.playerRealm)).length;
  const captures = events.filter((e) => e.kind === "capture" && e.realms.includes(state.playerRealm)).length;
  const famines = events.filter((e) => e.kind === "famine" && e.realms.includes(state.playerRealm)).length;
  const treaties = events.filter((e) => e.kind === "treaty" && e.realms.includes(state.playerRealm)).length;
  const bits: string[] = [];
  if (battles) bits.push(`${battles} battle${battles > 1 ? "s" : ""}`);
  if (captures) bits.push(`${captures} province${captures > 1 ? "s" : ""} changed hands`);
  if (famines) bits.push(`hunger in ${famines} province${famines > 1 ? "s" : ""}`);
  if (treaties) bits.push(`${treaties} treat${treaties > 1 ? "ies" : "y"} signed`);
  if (bits.length) digestParts.push(`Of note: ${bits.join(", ")}.`);
  const decided = events.filter((e) => e.kind === "crisis").map((e) => e.text);
  if (decided.length) digestParts.push(decided.join(" "));
  state.digest = [...state.digest.slice(-11), digestParts.join(" ")];

  // Victory / defeat.
  const outcome = checkOutcome(state);
  if (outcome) {
    outcome.verdict = heirVerdict(state, outcome.kind, outcome.title);
    state.heir.verdict = outcome.verdict;
    state.outcome = outcome;
    state.phase = "finished";
    log(outcome.kind, `${outcome.title}: ${outcome.reason}`, [state.playerRealm]);
  } else {
    // New matters for the Regent's attention.
    const fresh = generateCrises(state, createRng(`${state.seed}:crises:${state.season}`), extras.forcedCrises ?? []);
    for (const c of fresh) {
      state.crises.push(c);
      log("crisis", `A matter for the Regent: ${c.title}.`, [c.realm], { province: c.province, data: { crisisId: c.id, pending: true } });
    }
    state.crises = state.crises.filter((c) => c.chosen === null || state.season - c.season < 12);
  }
  return { state, events, rejected };
}

function avgUnrest(state: GameState, realm: RealmId): number {
  const owned = realmProvinces(state, realm);
  return owned.length ? owned.reduce((s, p) => s + p.unrest, 0) / owned.length : 0;
}

/** What the heir learns from watching the Regent's sealed orders. */
function teachHeir(state: GameState, order: Order): void {
  switch (order.kind) {
    case "declare_war":
      bumpTrait(state, "bold", 1);
      break;
    case "propose":
      if (order.proposal.kind === "peace" || order.proposal.kind === "non_aggression") bumpTrait(state, "cautious", 0.5);
      break;
    case "enact_edict":
      if (order.edict.then.some((a) => a.kind === "tax_relief" || a.kind === "grain_dole")) bumpTrait(state, "just", 1);
      if (order.edict.then.some((a) => a.kind === "curfew")) bumpTrait(state, "bold", 0.5);
      break;
    case "set_tax":
      if (order.taxRate > 0.4) bumpTrait(state, "greedy", 1);
      else if (order.taxRate < 0.25) bumpTrait(state, "just", 0.5);
      break;
    case "build":
      if (order.building === "shrine") bumpTrait(state, "pious", 0.5);
      if (order.building === "market") bumpTrait(state, "greedy", 0.25);
      break;
    case "muster":
      bumpTrait(state, "bold", 0.25);
      break;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type Log = (kind: GameEvent["kind"], text: string, realms: RealmId[], extra?: Partial<GameEvent>) => void;
type Name = (id: RealmId) => string;

function applyOrder(state: GameState, realm: Realm, submitted: SubmittedOrder, cost: number, log: Log, rn: Name): void {
  const o = submitted.order;
  const who = submitted.actor === "sovereign" || submitted.actor === "regent" ? realm.name : `${realm.name}'s ${submitted.actor}`;
  switch (o.kind) {
    case "build": {
      const p = state.provinces[o.province]!;
      realm.treasury -= cost;
      realm.ledger.buildSpend += cost;
      p.buildings[o.building] += 1;
      if (o.building === "fort") p.fortHp = p.buildings.fort * 10;
      if (o.building === "market" || o.building === "road") p.development = Math.min(10, p.development + 0.5);
      log("build", `${who} raised a ${o.building} in ${p.name} (level ${p.buildings[o.building]}).`, [realm.id], { province: p.id });
      return;
    }
    case "muster": {
      const p = state.provinces[o.province]!;
      realm.treasury -= cost;
      realm.ledger.musterSpend += cost;
      p.population = round1(p.population - o.companies * (o.unit === "levy" ? 0.5 : 0.3));
      p.unrest = clamp(p.unrest + o.companies * 3 * realm.laws.conscription, 0, 100);
      addUnits(state, realm, p, o.unit, o.companies);
      log("muster", `${who} mustered ${o.companies} ${o.unit} compan${o.companies === 1 ? "y" : "ies"} in ${p.name}.`, [realm.id], { province: p.id });
      return;
    }
    case "move": {
      state.armies[o.army]!.moveTo = o.to;
      return;
    }
    case "merge": {
      const a = state.armies[o.army]!;
      const b = state.armies[o.into]!;
      for (const k of Object.keys(a.units) as UnitKind[]) b.units[k] += a.units[k];
      b.morale = Math.round((a.morale + b.morale) / 2);
      delete state.armies[a.id];
      log("muster", `${a.name} joined ${b.name}.`, [realm.id], { province: b.province });
      return;
    }
    case "disband": {
      const a = state.armies[o.army]!;
      const p = state.provinces[a.province]!;
      if (p.owner === realm.id) p.population = round1(p.population + totalCompanies(a.units) * 0.4);
      delete state.armies[a.id];
      log("muster", `${a.name} was disbanded in ${p.name}.`, [realm.id], { province: p.id });
      return;
    }
    case "set_tax":
      realm.laws.taxRate = o.taxRate;
      log("law", `${who} set the tax rate to ${Math.round(o.taxRate * 100)}%.`, [realm.id]);
      return;
    case "set_conscription":
      realm.laws.conscription = o.level;
      log("law", `${who} set conscription to ${o.level}.`, [realm.id]);
      return;
    case "set_granary_reserve":
      realm.laws.granaryReserve = o.share;
      log("law", `${who} ordered ${Math.round(o.share * 100)}% of surplus grain into the granaries.`, [realm.id]);
      return;
    case "enact_edict": {
      const edict = { ...o.edict, id: o.edict.id || allocId(state, "e"), enacted: state.season, author: submitted.actor };
      realm.laws.edicts = realm.laws.edicts.filter((e) => e.id !== edict.id);
      realm.laws.edicts.push(edict);
      log("law", `${who} enacted the edict “${edict.title}”.`, [realm.id], { data: { edictId: edict.id } });
      return;
    }
    case "repeal_edict": {
      const edict = realm.laws.edicts.find((e) => e.id === o.edictId)!;
      realm.laws.edicts = realm.laws.edicts.filter((e) => e.id !== o.edictId);
      log("law", `${who} repealed “${edict.title}”.`, [realm.id]);
      return;
    }
    case "declare_war": {
      declareWar(state, realm, state.realms[o.target]!, log);
      return;
    }
    case "propose": {
      const id = allocId(state, "d");
      state.proposals.push({ id, from: realm.id, to: o.proposal.to, kind: o.proposal.kind, terms: o.proposal.terms ?? {}, message: o.proposal.message, season: state.season, status: "pending" });
      log("proposal", `${realm.name} proposed a ${o.proposal.kind.replace("_", "-")} treaty to ${rn(o.proposal.to)} (${id}).`, [realm.id, o.proposal.to], { data: { proposalId: id } });
      return;
    }
    case "respond": {
      const prop = state.proposals.find((x) => x.id === o.proposalId)!;
      if (!o.accept) {
        prop.status = "rejected";
        adjustRelation(state, prop.from, prop.to, -5);
        log("proposal", `${realm.name} declined ${rn(prop.from)}'s ${prop.kind.replace("_", "-")} proposal${o.message ? `: “${o.message}”` : "."}`, [prop.from, prop.to]);
        return;
      }
      prop.status = "accepted";
      signTreaty(state, prop.from, prop.to, prop.kind, prop.terms, log, rn);
      return;
    }
    case "withdraw": {
      const prop = state.proposals.find((x) => x.id === o.proposalId)!;
      prop.status = "withdrawn";
      log("proposal", `${realm.name} withdrew its ${prop.kind.replace("_", "-")} proposal to ${rn(prop.to)}.`, [prop.from, prop.to]);
      return;
    }
    case "cede_province": {
      const p = state.provinces[o.province]!;
      transferProvince(state, p, o.to, log, rn);
      adjustRelation(state, o.to, realm.id, 20);
      log("treaty", `${realm.name} ceded ${p.name} to ${rn(o.to)}.`, [realm.id, o.to], { province: p.id });
      return;
    }
    case "colonize": {
      const p = state.provinces[o.province]!;
      const from = state.provinces[o.from]!;
      realm.treasury -= colonizeCost(state, p.id);
      realm.ledger.buildSpend += colonizeCost(state, p.id);
      from.population = round1(Math.max(1, from.population - 2));
      p.population = round1(p.population + 2);
      p.owner = realm.id;
      p.unrest = 25;
      p.claims = p.claims.filter((c) => c !== realm.id);
      if (state.playerRealm === realm.id) consent(state, realm.id, { nobles: 1, burghers: 1 });
      log("colonize", `${who} brought ${p.name} into the realm by charter and coin.`, [realm.id], { province: p.id });
      return;
    }
  }
}

function addUnits(state: GameState, realm: Realm, p: Province, unit: UnitKind, companies: number): void {
  const existing = armiesIn(state, p.id).find((a) => a.realm === realm.id);
  if (existing) {
    existing.units[unit] += companies;
    return;
  }
  const id = allocId(state, "a");
  const army: Army = { id, name: `Army of ${p.name}`, realm: realm.id, province: p.id, units: { ...emptyUnits(), [unit]: companies }, morale: 70, moveTo: null, besieging: false };
  state.armies[id] = army;
}

function declareWar(state: GameState, aggressor: Realm, target: Realm, log: Log): void {
  const broken = state.treaties.filter((t) => t.parties.includes(aggressor.id) && t.parties.includes(target.id));
  state.treaties = state.treaties.filter((t) => !broken.includes(t));
  state.wars.push([aggressor.id, target.id]);
  const claim = hasClaim(state, aggressor.id, target.id);
  let infamy = claim ? 0 : 10;
  if (broken.length > 0) infamy += 20;
  aggressor.infamy = clamp(aggressor.infamy + infamy, 0, 100);
  adjustRelation(state, aggressor.id, target.id, -40);
  adjustRelation(state, target.id, aggressor.id, -40);
  for (const other of livingRealms(state)) {
    if (other === aggressor.id || other === target.id) continue;
    adjustRelation(state, other, aggressor.id, broken.length ? -15 : claim ? -3 : -8);
    if (treatyBetween(state, other, target.id, "alliance")) adjustRelation(state, other, aggressor.id, -20);
  }
  if (aggressor.id === state.playerRealm) {
    consent(state, aggressor.id, claim ? { nobles: 3 } : { clergy: -5, peasants: -2, nobles: 2 });
    if (broken.length) {
      consent(state, aggressor.id, { clergy: -6, burghers: -4 });
      state.regent.reputation = clamp(state.regent.reputation - 3, 0, 100);
    }
    bumpStanding(state, "marshal", 3);
  }
  if (target.id === state.playerRealm) bumpStanding(state, "envoy", -3);
  for (const p of state.proposals) if (p.status === "pending" && ((p.from === aggressor.id && p.to === target.id) || (p.from === target.id && p.to === aggressor.id)) && p.kind !== "peace") p.status = "expired";
  log("war", `${aggressor.name} declared war on ${target.name}${claim ? ", pressing its claim" : " without a claim"}${broken.length ? `, tearing up ${broken.map((t) => t.kind.replace("_", "-")).join(" and ")}` : ""}.`, [aggressor.id, target.id]);
}

function signTreaty(state: GameState, from: RealmId, to: RealmId, kind: Treaty["kind"], terms: { tribute?: number; seasons?: number | null; cededProvinces?: string[]; demandedProvinces?: string[] }, log: Log, rn: Name): void {
  const id = allocId(state, "t");
  const moved: string[] = [];
  for (const pid of terms.cededProvinces ?? []) {
    const p = state.provinces[pid];
    if (p && p.owner === from && p.capitalOf !== from) {
      transferProvince(state, p, to, log, rn);
      moved.push(p.name);
    }
  }
  for (const pid of terms.demandedProvinces ?? []) {
    const p = state.provinces[pid];
    if (p && p.owner === to && p.capitalOf !== to) {
      transferProvince(state, p, from, log, rn);
      moved.push(p.name);
    }
  }
  const tribute = terms.tribute ?? 0;
  const parties: [RealmId, RealmId] = tribute < 0 ? [to, from] : [from, to];
  if (kind === "peace") {
    state.wars = state.wars.filter(([x, y]) => !((x === from && y === to) || (x === to && y === from)));
    // Armies standing on the other's soil go home.
    for (const a of Object.values(state.armies)) {
      const p = state.provinces[a.province]!;
      if ((a.realm === from && p.owner === to) || (a.realm === to && p.owner === from)) {
        const home = realmProvinces(state, a.realm).sort((x, y) => (x.capitalOf ? -1 : 0) - (y.capitalOf ? -1 : 0))[0];
        if (home) a.province = home.id;
        a.besieging = false;
      }
    }
    state.treaties.push({ id, kind: "non_aggression", parties: [from, to], signed: state.season, seasonsLeft: terms.seasons ?? 8, cededProvinces: moved.length ? moved : undefined });
    if (state.playerRealm === from || state.playerRealm === to) consent(state, state.playerRealm, 2);
  } else {
    state.treaties = state.treaties.filter((t) => !(t.kind === kind && t.parties.includes(from) && t.parties.includes(to)));
    state.treaties.push({ id, kind, parties, signed: state.season, seasonsLeft: kind === "tribute" ? (terms.seasons ?? 8) : (terms.seasons ?? null), tribute: kind === "tribute" ? Math.abs(tribute) : undefined, cededProvinces: moved.length ? moved : undefined });
  }
  if (kind !== "tribute" && tribute !== 0) {
    state.treaties.push({ id: allocId(state, "t"), kind: "tribute", parties, signed: state.season, seasonsLeft: terms.seasons ?? 8, tribute: Math.abs(tribute) });
  }
  adjustRelation(state, from, to, 15);
  adjustRelation(state, to, from, 15);
  state.realms[from]!.prestige += 2;
  state.realms[to]!.prestige += 2;
  if (from === state.playerRealm || to === state.playerRealm) {
    bumpStanding(state, "envoy", 3);
    state.regent.reputation = clamp(state.regent.reputation + 1, 0, 100);
  }
  log("treaty", `${rn(from)} and ${rn(to)} signed a ${kind.replace("_", "-")} treaty${moved.length ? `; ${moved.join(", ")} changed hands` : ""}${tribute ? `; ${Math.abs(tribute)} gold a season flows to ${rn(parties[1])}` : ""}.`, [from, to], { data: { treatyId: id } });
}

export function adjustRelation(state: GameState, of: RealmId, toward: RealmId, delta: number): void {
  const r = state.realms[of];
  if (!r || !(toward in state.realms)) return;
  r.relations[toward] = clamp(round1((r.relations[toward] ?? 0) + delta), -100, 100);
}

function transferProvince(state: GameState, p: Province, to: RealmId, log: Log, rn: Name): void {
  const from = p.owner;
  p.owner = to;
  p.claims = p.claims.filter((c) => c !== to);
  if (from in state.realms && !p.claims.includes(from)) p.claims.push(from);
  if (p.capitalOf === from) {
    p.capitalOf = null;
    onProvinceLost(state, from, p, log, rn);
  } else if (from in state.realms) {
    onProvinceLost(state, from, p, log, rn);
  }
  if (to === state.playerRealm) consent(state, to, { nobles: 4, burghers: 1 });
}

function captureProvince(state: GameState, p: Province, by: RealmId, verb: string, log: Log, rn: Name): void {
  const former = p.owner;
  p.owner = by;
  p.unrest = clamp(p.unrest + 35, 0, 100);
  p.population = round1(p.population * 0.95);
  p.claims = p.claims.filter((c) => c !== by);
  if (former in state.realms && !p.claims.includes(former)) p.claims.push(former);
  const wasCapital = p.capitalOf === former;
  p.capitalOf = null;
  const realm = state.realms[by]!;
  realm.prestige += 5;
  if (by === state.playerRealm) {
    bumpStanding(state, "marshal", 2);
    consent(state, by, { nobles: 3 });
  }
  for (const a of armiesIn(state, p.id)) {
    a.besieging = false;
    if (a.realm === by) a.morale = clamp(a.morale + 10, 10, 100);
  }
  log("capture", `${realm.name} ${verb} ${p.name}${wasCapital ? `, the capital of ${rn(former)}` : former === NEUTRAL ? "" : ` from ${rn(former)}`}.`, former in state.realms ? [by, former] : [by], { province: p.id });
  if (former in state.realms) onProvinceLost(state, former, p, log, rn);
}

/** Handle a realm losing a province: capital relocation, legitimacy. */
function onProvinceLost(state: GameState, former: RealmId, p: Province, log: Log, _rn: Name): void {
  const realm = state.realms[former];
  if (!realm) return;
  if (former === state.playerRealm) {
    consent(state, former, { nobles: -6, peasants: -1, burghers: -1, clergy: -1 });
    bumpStanding(state, "marshal", -4);
  }
  if (realm.capital === p.id) {
    const remaining = realmProvinces(state, former).sort((a, b) => b.population - a.population);
    if (remaining.length > 0 && former !== state.playerRealm) {
      realm.capital = remaining[0]!.id;
      remaining[0]!.capitalOf = former;
      log("capture", `${realm.name} moved its court to ${remaining[0]!.name}.`, [former], { province: remaining[0]!.id });
    }
  }
}

function resolveBattlesIn(state: GameState, p: Province, rng: Rng, origins: Map<string, string>, log: Log, rn: Name): void {
  const present = armiesIn(state, p.id);
  if (present.length < 2) return;
  // Sides: group armies by realm; two groups fight if hostile.
  const byRealm = new Map<RealmId, Army[]>();
  for (const a of present) byRealm.set(a.realm, [...(byRealm.get(a.realm) ?? []), a]);
  const realms = [...byRealm.keys()];
  for (let i = 0; i < realms.length; i++) {
    for (let j = i + 1; j < realms.length; j++) {
      const ra = realms[i]!;
      const rb = realms[j]!;
      if (!atWar(state, ra, rb)) continue;
      const sideA = (byRealm.get(ra) ?? []).filter((a) => state.armies[a.id]);
      const sideB = (byRealm.get(rb) ?? []).filter((a) => state.armies[a.id]);
      if (sideA.length === 0 || sideB.length === 0) continue;
      const defenderRealm = p.owner === ra ? ra : p.owner === rb ? rb : null;
      const str = (side: Army[], realm: RealmId) => {
        let s = side.reduce((sum, a) => sum + armyStrength(a, p.terrain), 0);
        if (realm === defenderRealm) s *= TERRAIN_DEFENCE[p.terrain] * (1 + 0.25 * p.buildings.fort);
        return s * (0.9 + rng.next() * 0.2);
      };
      const sa = str(sideA, ra);
      const sb = str(sideB, rb);
      const aWins = sa >= sb;
      const winner = aWins ? sideA : sideB;
      const loser = aWins ? sideB : sideA;
      const ratio = Math.min(2.5, Math.max(sa, sb) / Math.max(0.1, Math.min(sa, sb)));
      applyCasualties(winner, 0.12 / ratio);
      applyCasualties(loser, Math.min(0.6, 0.25 * ratio));
      for (const a of winner) a.morale = clamp(a.morale + 10, 10, 100);
      const winnerRealm = aWins ? ra : rb;
      const loserRealm = aWins ? rb : ra;
      if (winnerRealm in state.realms) state.realms[winnerRealm]!.prestige += 3;
      if (winnerRealm === state.playerRealm) {
        bumpStanding(state, "marshal", 3);
        consent(state, winnerRealm, { nobles: 2 });
      }
      if (loserRealm === state.playerRealm) bumpStanding(state, "marshal", -3);
      // Retreat or destruction.
      for (const a of loser) {
        if (totalCompanies(a.units) <= 0) {
          delete state.armies[a.id];
          continue;
        }
        a.morale = clamp(a.morale - 20, 10, 100);
        const origin = origins.get(a.id);
        const retreatTo = origin && state.provinces[origin]!.owner === a.realm ? origin : p.neighbors.find((n) => state.provinces[n]!.owner === a.realm) ?? origin ?? null;
        if (!retreatTo || a.realm === REBELS) {
          delete state.armies[a.id];
          log("battle", `${a.name} was destroyed at ${p.name}.`, [a.realm], { province: p.id });
        } else {
          a.province = retreatTo;
          a.besieging = false;
        }
      }
      for (const a of winner) if (totalCompanies(a.units) <= 0) delete state.armies[a.id];
      log("battle", `Battle of ${p.name}: ${rn(winnerRealm)} (${Math.round(aWins ? sa : sb)}) defeated ${rn(loserRealm)} (${Math.round(aWins ? sb : sa)}).`, [winnerRealm, loserRealm].filter((r) => r in state.realms), { province: p.id, data: { winner: winnerRealm, loser: loserRealm } });
      p.unrest = clamp(p.unrest + 8, 0, 100);
      p.population = round1(p.population * 0.98);
    }
  }
}

function applyCasualties(side: Army[], rate: number): void {
  for (const a of side) {
    for (const k of Object.keys(a.units) as UnitKind[]) {
      const lost = Math.floor(a.units[k] * rate + (a.units[k] > 0 && rate > 0.3 ? 1 : 0));
      a.units[k] = Math.max(0, a.units[k] - lost);
    }
  }
}

function runEconomy(state: GameState, realm: Realm, effects: Map<string, ReturnType<typeof edictEffects>>, log: Log, _rn: Name): void {
  const provinces = realmProvinces(state, realm.id);
  const ledger = realm.ledger;
  // Food: local balance, pooled sharing, granaries, dole, famine.
  const local = new Map<string, number>();
  let surplusTotal = 0;
  let deficitTotal = 0;
  for (const p of provinces) {
    const prod = foodProduced(p);
    const need = foodNeeded(p);
    ledger.foodProduced += prod;
    ledger.foodConsumed += need;
    const bal = prod - need;
    local.set(p.id, bal);
    if (bal > 0) surplusTotal += bal;
    else deficitTotal -= bal;
  }
  const covered = Math.min(surplusTotal, deficitTotal);
  let leftover = surplusTotal - covered;
  const coverage = deficitTotal > 0 ? covered / deficitTotal : 0;
  let famineProvinces = 0;
  for (const p of provinces) {
    const bal = local.get(p.id)!;
    if (bal >= 0) {
      p.famineStreak = 0;
      continue;
    }
    let shortfall = -bal * (1 - coverage);
    // Local granary.
    const fromGranary = Math.min(p.granary, shortfall);
    p.granary -= fromGranary;
    shortfall -= fromGranary;
    // Other granaries.
    if (shortfall > 0) {
      for (const other of provinces) {
        if (shortfall <= 0) break;
        if (other.id === p.id || other.buildings.road === 0 && !other.coastal && !p.coastal) continue;
        const take = Math.min(other.granary * 0.5, shortfall);
        other.granary -= take;
        shortfall -= take;
      }
    }
    // Grain dole under edict.
    const fx = effects.get(p.id);
    if (shortfall > 0 && fx?.grainDole && realm.treasury > 0) {
      const buy = Math.min(shortfall, realm.treasury);
      realm.treasury -= buy;
      ledger.doleSpend += buy;
      shortfall -= buy;
    }
    if (shortfall > 0.5) {
      const s = clamp(shortfall / foodNeeded(p), 0, 1);
      p.population = round1(Math.max(1, p.population - p.population * s * 0.15));
      p.unrest = clamp(p.unrest + 5 + 20 * s, 0, 100);
      p.famineStreak += 1;
      famineProvinces += 1;
      consent(state, realm.id, { peasants: -5, clergy: -1 });
      if (realm.id === state.playerRealm) {
        state.regent.reputation = clamp(state.regent.reputation - 2, 0, 100);
        bumpStanding(state, "treasurer", -2);
      }
      log("famine", `Hunger in ${p.name}: ${Math.round(s * 100)}% short of bread.`, [realm.id], { province: p.id });
    } else p.famineStreak = 0;
  }
  // Leftover surplus: reserve share to granaries, rest sold.
  let toStore = leftover * realm.laws.granaryReserve;
  for (const p of provinces.sort((a, b) => granaryCapacity(b) - b.granary - (granaryCapacity(a) - a.granary))) {
    if (toStore <= 0) break;
    const room = granaryCapacity(p) - p.granary;
    const put = Math.min(room, toStore);
    p.granary = round1(p.granary + put);
    toStore -= put;
  }
  const sold = leftover - (leftover * realm.laws.granaryReserve - toStore);
  const hasMarket = provinces.some((p) => p.buildings.market > 0);
  ledger.tradeIncome += Math.min(20, sold * (hasMarket ? 0.1 : 0.05));
  // Trade as geography: roads and sea lanes to foreign markets not blockaded by war.
  const routes = tradeRoutes(state, realm.id);
  const tradePartners = new Set(state.treaties.filter((t) => t.kind === "trade" && t.parties.includes(realm.id)).map((t) => (t.parties[0] === realm.id ? t.parties[1] : t.parties[0])));
  ledger.routes = routes.length;
  ledger.routeIncome = round1(Math.min(12, routes.length) * 1.2 + routes.filter((r) => tradePartners.has(r.realm)).length * 0.5);
  ledger.tradeIncome += ledger.routeIncome;
  // Taxes, trade, resources, growth and unrest per province.
  const tradeTreaties = tradePartners.size;
  for (const p of provinces) {
    const fx = effects.get(p.id);
    const taxFactor = fx?.taxFactor ?? 1;
    const tax = p.population * (0.12 + p.development * 0.04) * realm.laws.taxRate * taxFactor * (1 - p.unrest / 200);
    ledger.taxIncome += tax;
    if (p.buildings.market > 0) ledger.tradeIncome += p.buildings.market * p.development * 0.4 * (p.coastal ? 1.5 : 1) + 1.5 * tradeTreaties;
    for (const res of p.resources) {
      const mine = p.buildings.mine;
      if (res === "iron") ledger.resourceIncome += mine ? 3 * mine : 0.5;
      else if (res === "gold") ledger.resourceIncome += mine ? 6 * mine : 0.5;
      else if (res === "salt") ledger.resourceIncome += mine ? 2.5 * mine : 0.5;
      else if (res === "timber") ledger.resourceIncome += 1;
      else if (res === "wine") ledger.resourceIncome += p.buildings.market ? 1.5 : 0.5;
    }
    // Population growth.
    const ratio = foodNeeded(p) > 0 ? foodProduced(p) / foodNeeded(p) : 2;
    if (p.famineStreak === 0) {
      const growth = 0.01 + Math.min(0.015, Math.max(0, ratio - 1) * 0.02);
      const room = Math.max(0, 1 - p.population / carryingCapacity(p));
      p.population = round1(p.population * (1 + growth * room));
    }
    // Unrest dynamics.
    let unrestDelta = -5 - 3 * p.buildings.shrine + (realm.laws.taxRate - 0.3) * 40 * taxFactor;
    if (fx?.curfew) unrestDelta -= 8;
    if (armiesIn(state, p.id).some((a) => a.realm !== realm.id)) unrestDelta += 10;
    if (realm.id === state.playerRealm && realm.legitimacy < 30) unrestDelta += 4;
    p.unrest = clamp(round1(p.unrest + unrestDelta), 0, 100);
    if (p.unrest >= 80 && !armiesIn(state, p.id).some((a) => a.realm === REBELS)) {
      const companies = Math.max(1, Math.round(p.population * 0.2));
      const id = allocId(state, "a");
      state.armies[id] = { id, name: `Rebels of ${p.name}`, realm: REBELS, province: p.id, units: { ...emptyUnits(), levy: companies }, morale: 70, moveTo: null, besieging: false };
      p.unrest = 45;
      if (realm.id === state.playerRealm) bumpStanding(state, "chancellor", -4);
      log("revolt", `${p.name} rose in revolt: ${companies} compan${companies === 1 ? "y" : "ies"} of rebels under arms.`, [realm.id], { province: p.id });
    }
    // Development creeps up with markets and roads, down under curfew.
    if (p.buildings.market > 0 && p.unrest < 40 && state.season % 4 === 0) p.development = Math.min(10, round1(p.development + 0.25));
    if (fx?.curfew && state.season % 4 === 0) p.development = Math.max(1, round1(p.development - 0.25));
  }
  // Upkeep.
  for (const a of realmArmies(state, realm.id)) ledger.upkeep += upkeepOf(state, a);
  const income = ledger.taxIncome + ledger.tradeIncome + ledger.resourceIncome - ledger.upkeep;
  realm.treasury = round1(realm.treasury + income);
  if (famineProvinces === 0 && realm.id !== state.playerRealm) realm.prestige += 0.5;
  // Armies unpaid lose morale.
  if (realm.treasury < 0) for (const a of realmArmies(state, realm.id)) a.morale = clamp(a.morale - 8, 10, 100);
}

export type { Crisis };

export function checkOutcome(state: GameState): GameState["outcome"] {
  const player = state.realms[state.playerRealm]!;
  const owned = realmProvinces(state, player.id);
  const season = state.season;
  if (owned.length === 0) return { kind: "defeat", title: "The realm is no more", reason: "Every province has been lost.", season };
  const capital = state.provinces[player.capital]!;
  if (capital.owner !== player.id) return { kind: "defeat", title: "The capital has fallen", reason: `${capital.name} is held by ${state.realms[capital.owner]?.name ?? "rebels"}. The heir has been carried off.`, season };
  if (player.legitimacy < 15) return { kind: "defeat", title: "Deposed by the Estates", reason: "The estates withdrew their consent; the great houses named a new Regent.", season };
  if (state.deficitStreak >= 3 && player.treasury < -30) return { kind: "defeat", title: "Bankrupt", reason: "Three seasons of debt; the moneylenders own the crown.", season };
  const total = landProvinceCount(state);
  if (owned.length >= Math.ceil(total * 0.55)) return { kind: "victory", title: "Hegemony", reason: `${player.name} rules ${owned.length} of ${total} provinces. The continent bends the knee.`, season };
  const others = livingRealms(state).filter((r) => r !== player.id);
  if (others.length > 0 && others.every((r) => treatyBetween(state, player.id, r, "alliance"))) return { kind: "victory", title: "The Great Concord", reason: "Every surviving realm stands in alliance with the Regency.", season };
  if (season >= state.majoritySeason) {
    if (player.legitimacy >= 40) return { kind: "victory", title: "The Heir's Majority", reason: `The heir comes of age and inherits a realm of ${owned.length} provinces with prestige ${Math.round(player.prestige)}.`, season };
    return { kind: "defeat", title: "A Bitter Majority", reason: "The heir comes of age but the Regent is dismissed in disgrace; legitimacy was too low.", season };
  }
  return null;
}
