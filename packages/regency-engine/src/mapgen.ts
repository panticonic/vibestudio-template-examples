/**
 * Deterministic world generation: a hex board with a noise-shaped landmass,
 * provinces grown from seeds, terrain and resources from elevation/moisture,
 * and realms placed apart from one another with historical claims.
 */
import { hexKey, hexNeighbors, offsetToAxial, hexDistance, type Axial } from "./hex.js";
import { createRng, type Rng } from "./rng.js";
import { provinceName, realmName, REALM_CHARACTERS, REALM_COLORS, PLAYER_COLOR } from "./names.js";
import { generateCourt } from "./court.js";
import { generateCrises } from "./crises.js";
import { adjustRelation } from "./tick.js";
import { realmProvinces, realmStrength } from "./state.js";
import {
  emptyBuildings,
  emptyUnits,
  NEUTRAL,
  type Army,
  type GameState,
  type Laws,
  type Province,
  type Realm,
  type RealmId,
  type Resource,
  type Scenario,
  type Terrain,
} from "./types.js";

export interface WorldOptions {
  seed: string;
  /** Name of the player's realm. */
  realmName?: string;
  /** Number of rival realms, 1..5. */
  rivals?: number;
  cols?: number;
  rows?: number;
  /** Target number of provinces. */
  provinces?: number;
  startYear?: number;
  /** Seasons until the heir's majority. */
  regencySeasons?: number;
  /** "long" (default): forty seasons from spring. "winter": twelve seasons opening in crisis. */
  scenario?: Scenario;
  /** The Regent's own name, for the chronicle and the heir's verdict. */
  regentName?: string;
}

interface Cell {
  key: string;
  axial: Axial;
  elevation: number;
  moisture: number;
  land: boolean;
  province: string | null;
}

/** Cheap value noise built from a seeded lattice, smoothed once. */
function noiseField(rng: Rng, cols: number, rows: number, scale: number): (c: number, r: number) => number {
  const lw = Math.ceil(cols / scale) + 2;
  const lh = Math.ceil(rows / scale) + 2;
  const lattice: number[] = [];
  for (let i = 0; i < lw * lh; i++) lattice.push(rng.next());
  const at = (x: number, y: number) => lattice[Math.max(0, Math.min(lh - 1, y)) * lw + Math.max(0, Math.min(lw - 1, x))]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (c, r) => {
    const x = c / scale;
    const y = r / scale;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

export function defaultLaws(): Laws {
  return { taxRate: 0.3, conscription: 0.3, granaryReserve: 0.5, edicts: [] };
}

export function generateWorld(options: WorldOptions): GameState {
  const cols = options.cols ?? 26;
  const rows = options.rows ?? 18;
  const targetProvinces = options.provinces ?? 32;
  const rivals = Math.max(1, Math.min(5, options.rivals ?? 3));
  const rng = createRng(`${options.seed}:world`);

  // 1. Cells and landmass.
  const elevationNoise = noiseField(rng, cols, rows, 4.5);
  const detailNoise = noiseField(rng, cols, rows, 2);
  const moistureNoise = noiseField(rng, cols, rows, 5);
  const cells = new Map<string, Cell>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const axial = offsetToAxial(c, r);
      const nx = (c / (cols - 1)) * 2 - 1;
      const ny = (r / (rows - 1)) * 2 - 1;
      const edge = Math.max(Math.abs(nx), Math.abs(ny));
      const radial = 1 - Math.pow(edge, 3);
      const elevation = elevationNoise(c, r) * 0.7 + detailNoise(c, r) * 0.3;
      const shaped = elevation * 0.75 + radial * 0.45 - 0.35;
      cells.set(hexKey(axial), {
        key: hexKey(axial),
        axial,
        elevation: shaped,
        moisture: moistureNoise(c, r),
        land: shaped > 0.2,
        province: null,
      });
    }
  }
  // Keep only the largest connected landmass.
  const landKeys = [...cells.values()].filter((c) => c.land).map((c) => c.key);
  const seen = new Set<string>();
  let largest: string[] = [];
  for (const start of landKeys) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const key = stack.pop()!;
      component.push(key);
      for (const n of hexNeighbors(cells.get(key)!.axial)) {
        const nk = hexKey(n);
        const cell = cells.get(nk);
        if (cell && cell.land && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const keep = new Set(largest);
  for (const cell of cells.values()) if (cell.land && !keep.has(cell.key)) cell.land = false;
  const land = [...cells.values()].filter((c) => c.land);

  // 2. Province seeds spread apart, then grown by breadth-first flood.
  const provinceCount = Math.max(8, Math.min(targetProvinces, Math.floor(land.length / 5)));
  const seeds: Cell[] = [];
  const shuffled = rng.shuffle(land);
  const minSeedDistance = Math.max(2, Math.floor(Math.sqrt(land.length / provinceCount)));
  for (const cell of shuffled) {
    if (seeds.length >= provinceCount) break;
    if (seeds.every((s) => hexDistance(s.axial, cell.axial) >= minSeedDistance)) seeds.push(cell);
  }
  for (const cell of shuffled) {
    if (seeds.length >= provinceCount) break;
    if (!seeds.includes(cell)) seeds.push(cell);
  }
  const provinceIds = seeds.map((_, i) => `p${i + 1}`);
  const frontier: Array<{ cell: Cell; province: string }> = [];
  seeds.forEach((cell, i) => {
    cell.province = provinceIds[i]!;
    frontier.push({ cell, province: provinceIds[i]! });
  });
  // Randomised multi-source growth gives organic borders.
  while (frontier.length) {
    const idx = rng.int(Math.min(frontier.length, 6));
    const { cell, province } = frontier.splice(idx, 1)[0]!;
    for (const n of rng.shuffle(hexNeighbors(cell.axial))) {
      const next = cells.get(hexKey(n));
      if (next && next.land && next.province === null) {
        next.province = province;
        frontier.push({ cell: next, province });
      }
    }
  }

  // 3. Province attributes.
  const usedNames = new Set<string>();
  const provinces: Record<string, Province> = {};
  const cellsByProvince = new Map<string, Cell[]>();
  for (const cell of land) {
    const list = cellsByProvince.get(cell.province!) ?? [];
    list.push(cell);
    cellsByProvince.set(cell.province!, list);
  }
  for (const id of provinceIds) {
    const pcells = cellsByProvince.get(id) ?? [];
    if (pcells.length === 0) continue;
    const avgElevation = pcells.reduce((a, c) => a + c.elevation, 0) / pcells.length;
    const avgMoisture = pcells.reduce((a, c) => a + c.moisture, 0) / pcells.length;
    let terrain: Terrain;
    if (avgElevation > 0.56) terrain = "mountains";
    else if (avgElevation > 0.44) terrain = "hills";
    else if (avgMoisture > 0.66) terrain = avgElevation < 0.3 ? "marsh" : "forest";
    else if (avgMoisture > 0.52 && rng.chance(0.4)) terrain = "forest";
    else terrain = "plains";
    const coastal = pcells.some((c) => hexNeighbors(c.axial).some((n) => {
      const nc = cells.get(hexKey(n));
      return !nc || !nc.land;
    }));
    const fertilityBase = { plains: 4, hills: 2, forest: 2, mountains: 1, marsh: 2 }[terrain];
    const fertility = Math.max(1, Math.min(5, fertilityBase + (avgMoisture > 0.5 ? 1 : 0) - (rng.chance(0.2) ? 1 : 0)));
    const resources: Resource[] = [];
    const roll = rng.next();
    if (terrain === "mountains" && roll < 0.8) resources.push(rng.chance(0.3) ? "gold" : "iron");
    else if (terrain === "hills" && roll < 0.6) resources.push(rng.chance(0.5) ? "iron" : "wine");
    else if (terrain === "forest") resources.push("timber");
    else if (terrain === "plains" && roll < 0.5) resources.push(rng.chance(0.6) ? "grain" : "horses");
    else if (terrain === "marsh" && roll < 0.5) resources.push("salt");
    if (coastal && rng.chance(0.35) && !resources.includes("salt")) resources.push("salt");
    // Centre: the cell nearest the centroid.
    const cx = pcells.reduce((a, c) => a + c.axial.q, 0) / pcells.length;
    const cy = pcells.reduce((a, c) => a + c.axial.r, 0) / pcells.length;
    let centre = pcells[0]!;
    let best = Infinity;
    for (const c of pcells) {
      const d = (c.axial.q - cx) ** 2 + (c.axial.r - cy) ** 2;
      if (d < best) {
        best = d;
        centre = c;
      }
    }
    provinces[id] = {
      id,
      name: provinceName(rng, usedNames),
      terrain,
      coastal,
      cells: pcells.map((c) => c.axial),
      centre: centre.axial,
      neighbors: [],
      owner: NEUTRAL,
      population: Math.round((fertility * 3 + pcells.length * 1.5 + rng.int(6)) * 10) / 10,
      fertility,
      development: Math.max(1, Math.min(4, Math.round(fertility / 2 + (coastal ? 1 : 0) + rng.int(2)))),
      resources,
      buildings: emptyBuildings(),
      unrest: 10 + rng.int(15),
      granary: 5,
      fortHp: 0,
      capitalOf: null,
      famineStreak: 0,
      claims: [],
    };
  }
  // Adjacency.
  for (const cell of land) {
    for (const n of hexNeighbors(cell.axial)) {
      const nc = cells.get(hexKey(n));
      if (nc && nc.land && nc.province !== cell.province) {
        const a = provinces[cell.province!];
        const b = provinces[nc.province!];
        if (a && b && !a.neighbors.includes(b.id)) a.neighbors.push(b.id);
      }
    }
  }
  for (const p of Object.values(provinces)) p.neighbors.sort();

  // 4. Realms: capitals placed far apart, each realm gets its capital plus
  //    the nearest unowned neighbours, the rest stays neutral.
  const realmCount = rivals + 1;
  const ids = Object.keys(provinces);
  const capitals: string[] = [];
  const candidates = rng.shuffle(ids.filter((id) => provinces[id]!.terrain !== "mountains" && provinces[id]!.neighbors.length >= 2));
  const distBetween = (a: string, b: string) => hexDistance(provinces[a]!.centre, provinces[b]!.centre);
  for (let need = realmCount; need > 0 && capitals.length < realmCount; ) {
    let bestId: string | null = null;
    let bestScore = -1;
    for (const id of candidates) {
      if (capitals.includes(id)) continue;
      const score = capitals.length === 0 ? provinces[id]!.fertility + rng.next() : Math.min(...capitals.map((c) => distBetween(c, id)));
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (!bestId) break;
    capitals.push(bestId);
  }
  const usedRealmNames = new Set<string>();
  const realms: Record<string, Realm> = {};
  const realmIds: RealmId[] = [];
  const characters = rng.shuffle(REALM_CHARACTERS);
  const colors = rng.shuffle(REALM_COLORS);
  capitals.forEach((capital, i) => {
    const isPlayer = i === 0;
    const id = isPlayer ? "regency" : `r${i}`;
    const named = isPlayer
      ? { name: options.realmName?.trim() || realmName(rng, usedRealmNames).name, adjective: "" }
      : realmName(rng, usedRealmNames);
    if (isPlayer) usedRealmNames.add(named.name);
    realmIds.push(id);
    realms[id] = {
      id,
      name: named.name,
      adjective: named.adjective || named.name,
      color: isPlayer ? PLAYER_COLOR : colors[(i - 1) % colors.length]!,
      sovereign: isPlayer ? "regent" : "agent",
      character: isPlayer ? "a realm ruled by a Regent for an heir not yet of age" : characters[(i - 1) % characters.length]!,
      treasury: 60,
      legitimacy: isPlayer ? 60 : 100,
      prestige: 10,
      infamy: 0,
      capital,
      laws: defaultLaws(),
      relations: {},
      eliminated: false,
      turnEnded: false,
      estates: { peasants: 55, burghers: 55, clergy: 55, nobles: 55 },
      ledger: {
        season: 0,
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
      },
    };
    const cap = provinces[capital]!;
    cap.owner = id;
    cap.capitalOf = id;
    cap.development = Math.max(cap.development, 5);
    cap.population += 8;
    cap.buildings.fort = 1;
    cap.fortHp = 10;
    cap.buildings.market = 1;
    cap.buildings.farm = 1;
    cap.unrest = 5;
  });
  // Grow each realm to a starting size of 3–4 provinces, round robin.
  const startSize = 3 + (ids.length >= realmCount * 5 ? 1 : 0);
  for (let round = 1; round < startSize; round++) {
    for (const rid of realmIds) {
      const owned = ids.filter((id) => provinces[id]!.owner === rid);
      const options = new Set<string>();
      for (const id of owned) for (const n of provinces[id]!.neighbors) if (provinces[n]!.owner === NEUTRAL) options.add(n);
      const choice = [...options].sort((a, b) => provinces[b]!.fertility - provinces[a]!.fertility || a.localeCompare(b))[0];
      if (choice) provinces[choice]!.owner = rid;
    }
  }
  // Claims: every realm claims neutral provinces bordering it, plus one
  // province of each neighbouring realm (the seeds of future wars).
  for (const rid of realmIds) {
    const owned = ids.filter((id) => provinces[id]!.owner === rid);
    for (const id of owned) {
      for (const n of provinces[id]!.neighbors) {
        const p = provinces[n]!;
        if (p.owner === NEUTRAL && !p.claims.includes(rid)) p.claims.push(rid);
      }
    }
    for (const other of realmIds) {
      if (other === rid) continue;
      const border = ids.filter((id) => provinces[id]!.owner === other && provinces[id]!.neighbors.some((n) => provinces[n]!.owner === rid) && provinces[id]!.capitalOf === null);
      if (border.length > 0) {
        const target = border.sort()[rng.int(border.length)]!;
        if (!provinces[target]!.claims.includes(rid)) provinces[target]!.claims.push(rid);
      }
    }
  }
  // Relations start mildly wary, worse between neighbours with claims.
  for (const a of realmIds) {
    for (const b of realmIds) {
      if (a === b) continue;
      const claimsOnB = ids.filter((id) => provinces[id]!.owner === b && provinces[id]!.claims.includes(a)).length;
      realms[a]!.relations[b] = 10 - claimsOnB * 15 + rng.int(11) - 5;
    }
  }

  // 5. Starting armies: one garrison per capital.
  const armies: Record<string, Army> = {};
  let nextId = 1;
  for (const rid of realmIds) {
    const armyId = `a${nextId++}`;
    armies[armyId] = {
      id: armyId,
      name: `${realms[rid]!.name} Household Guard`,
      realm: rid,
      province: realms[rid]!.capital,
      units: { ...emptyUnits(), regular: 3, levy: 2 },
      morale: 80,
      moveTo: null,
      besieging: false,
    };
  }

  // 6. Rivers: from wet highlands down to the sea. A river blesses the
  //    provinces it crosses with an extra measure of fertility.
  const rivers: Axial[][] = [];
  const riverCells = new Set<string>();
  const sources = land
    .filter((c) => c.elevation > 0.42 && c.moisture > 0.45)
    .sort((a, b) => b.elevation - a.elevation);
  for (const source of sources) {
    if (rivers.length >= 6) break;
    if (rivers.some((r) => r.some((h) => hexDistance(h, source.axial) < 4))) continue;
    const path: Axial[] = [source.axial];
    const visited = new Set([source.key]);
    let current = source;
    let reachedSea = false;
    for (let step = 0; step < 40; step++) {
      let next: Cell | null = null;
      for (const n of hexNeighbors(current.axial)) {
        const nc = cells.get(hexKey(n));
        if (!nc || visited.has(nc.key)) continue;
        if (!next || nc.elevation < next.elevation) next = nc;
      }
      if (!next) break;
      visited.add(next.key);
      path.push(next.axial);
      if (!next.land) {
        reachedSea = true;
        break;
      }
      if (riverCells.has(next.key)) {
        // Joins an existing river: follow it the rest of the way to the sea.
        const parent = rivers.find((r) => r.some((h) => hexKey(h) === next!.key));
        if (parent) {
          const at = parent.findIndex((h) => hexKey(h) === next!.key);
          path.push(...parent.slice(at + 1));
        }
        reachedSea = true;
        break;
      }
      current = next;
    }
    if (reachedSea && path.length >= 3) {
      rivers.push(path);
      for (const h of path) riverCells.add(hexKey(h));
    }
  }
  for (const p of Object.values(provinces)) {
    if (p.cells.some((c) => riverCells.has(hexKey(c)))) p.fertility = Math.min(5, p.fertility + 1);
  }

  const seaCells = [...cells.values()].filter((c) => !c.land).map((c) => c.key);
  const player = realms["regency"]!;
  const scenario: Scenario = options.scenario ?? "long";
  const startSeason = scenario === "winter" ? 3 : 0;
  const regencySeasons = options.regencySeasons ?? (scenario === "winter" ? 12 : 40);
  const { court, heir } = generateCourt(createRng(`${options.seed}:court`), realmIds, "regency");
  for (const r of Object.values(realms)) r.estates = { peasants: 55, burghers: 55, clergy: 55, nobles: 55 };
  player.legitimacy = 55;
  const state: GameState = {
    version: 1,
    seed: options.seed,
    title: `The Regency of ${player.name}`,
    season: startSeason,
    startYear: options.startYear ?? 1201,
    majoritySeason: startSeason + regencySeasons,
    phase: "orders",
    playerRealm: "regency",
    realms,
    provinces,
    armies,
    wars: [],
    treaties: [],
    proposals: [],
    council: [],
    map: { cols, rows, seaCells, rivers },
    outcome: null,
    deficitStreak: 0,
    nextId,
    scenario,
    court,
    heir,
    regent: { name: options.regentName?.trim() || "the Regent", reputation: 50 },
    crises: [],
    digest: [],
  };
  const forced: string[] = [];
  if (scenario === "winter") {
    // Open in crisis: empty granaries, a hungry capital, a claimant abroad,
    // a wavering border lord, and the strongest claimant neighbour at war.
    for (const p of realmProvinces(state, "regency")) {
      p.granary = 0;
      p.population = Math.round(p.population * 1.2 * 10) / 10;
    }
    player.treasury = 25;
    const aggressor = realmIds
      .filter((r) => r !== "regency" && Object.values(provinces).some((p) => p.owner === "regency" && p.claims.includes(r)))
      .sort((a, b) => realmStrength(state, b) - realmStrength(state, a))[0];
    if (aggressor) {
      state.wars.push([aggressor, "regency"]);
      adjustRelation(state, aggressor, "regency", -40);
      adjustRelation(state, "regency", aggressor, -40);
      const border = realmProvinces(state, aggressor).find((p) => p.neighbors.some((n) => provinces[n]!.owner === "regency"));
      if (border) {
        const id = `a${state.nextId++}`;
        armies[id] = { id, name: `${realms[aggressor]!.name} Vanguard`, realm: aggressor, province: border.id, units: { ...emptyUnits(), regular: 4, levy: 3 }, morale: 85, moveTo: null, besieging: false };
      }
    }
    forced.push("claimant", "defection");
  } else {
    // The long Regency opens with one low-stakes matter, so the very first
    // thing the Regent does is decide something rather than stare at a map.
    forced.push("guild");
  }
  state.crises = generateCrises(state, createRng(`${options.seed}:crises:${state.season}`), forced);
  if (state.crises.length === 0) state.crises = generateCrises(state, createRng(`${options.seed}:crises:fallback`), ["tutor"]);
  return state;
}
