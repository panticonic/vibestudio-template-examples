import { describe, expect, it } from "vitest";
import { generateWorld } from "./mapgen.js";
import { autoOrders } from "./fallback.js";
import { resolveSeason } from "./tick.js";
import { validateOrder } from "./orders.js";
import { validateEdict, EXAMPLE_EDICT } from "./laws.js";
import { realmProvinces, realmArmies, atWar } from "./state.js";
import { realmReport, mapOverview } from "./report.js";
import { hexKey } from "./hex.js";
import { NEUTRAL, type GameState, type SubmittedOrder } from "./types.js";
import { tradeRoutes, hasAccessTo } from "./state.js";
import { consentOf } from "./tick.js";
import { explain } from "./explain.js";
import { BROKEN_PROMISE_INFAMY, BROKEN_PROMISE_REGARD, describePromiseCheck, settlePromises, validatePromiseCheck } from "./promises.js";
import type { RegentPromise } from "./types.js";

function world(seed = "test-seed"): GameState {
  return generateWorld({ seed, rivals: 3, realmName: "Aster" });
}

function submit(state: GameState, realm: string, orders: ReturnType<typeof autoOrders>, actor = "sovereign"): SubmittedOrder[] {
  return orders.map((order, i) => ({ id: `${realm}-${state.season}-${i}`, realm, actor, season: state.season, order }));
}

describe("world generation", () => {
  it("is deterministic for a seed and produces a connected, owned world", () => {
    const a = world();
    const b = world();
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(Object.keys(a.realms)).toHaveLength(4);
    expect(a.playerRealm).toBe("regency");
    expect(a.realms["regency"]!.name).toBe("Aster");
    const provinces = Object.values(a.provinces);
    expect(provinces.length).toBeGreaterThanOrEqual(8);
    for (const p of provinces) {
      expect(p.neighbors.length).toBeGreaterThan(0);
      for (const n of p.neighbors) expect(a.provinces[n]!.neighbors).toContain(p.id);
      expect(p.cells.length).toBeGreaterThan(0);
    }
    // No cell belongs to two provinces and none overlaps the sea.
    const seen = new Set<string>();
    const sea = new Set(a.map.seaCells);
    for (const p of provinces) {
      for (const c of p.cells) {
        const key = hexKey(c);
        expect(seen.has(key)).toBe(false);
        expect(sea.has(key)).toBe(false);
        seen.add(key);
      }
    }
    for (const r of Object.values(a.realms)) {
      expect(realmProvinces(a, r.id).length).toBeGreaterThanOrEqual(3);
      expect(a.provinces[r.capital]!.capitalOf).toBe(r.id);
      expect(realmArmies(a, r.id)).toHaveLength(1);
    }
  });

  it("draws rivers to the sea and seats a court", () => {
    const s = world();
    expect(s.map.rivers.length).toBeGreaterThan(0);
    for (const river of s.map.rivers) {
      expect(river.length).toBeGreaterThanOrEqual(3);
    }
    for (const role of ["herald", "chancellor", "treasurer", "marshal", "envoy"]) {
      expect(s.court[role]?.name).toBeTruthy();
      expect(s.court[role]?.standing).toBe(50);
    }
    expect(s.court["sovereign:r1"]?.name).toBeTruthy();
    expect(s.heir.name).toBeTruthy();
    expect(s.realms["regency"]!.legitimacy).toBe(consentOf(s.realms["regency"]!.estates));
  });

  it("opens the winter scenario in crisis", () => {
    const s = generateWorld({ seed: "cold", rivals: 3, scenario: "winter" });
    expect(s.season).toBe(3);
    expect(s.majoritySeason).toBe(15);
    expect(s.wars.length).toBe(1);
    expect(s.crises.filter((c) => c.chosen === null).map((c) => c.kind)).toEqual(expect.arrayContaining(["claimant", "defection"]));
    expect(realmProvinces(s, "regency").every((p) => p.granary === 0)).toBe(true);
  });

  it("varies with the seed", () => {
    expect(JSON.stringify(world("a"))).not.toEqual(JSON.stringify(world("b")));
  });
});

describe("orders", () => {
  it("rejects illegal orders with reasons", () => {
    const s = world();
    const other = Object.values(s.provinces).find((p) => p.owner !== "regency")!;
    expect(validateOrder(s, "regency", { kind: "build", province: other.id, building: "farm" })).toMatch(/not yours/);
    expect(validateOrder(s, "regency", { kind: "set_tax", taxRate: 0.9 })).toMatch(/0.1..0.6/);
    expect(validateOrder(s, "regency", { kind: "declare_war", target: "regency" })).toMatch(/unknown realm/);
    const army = realmArmies(s, "regency")[0]!;
    const far = Object.values(s.provinces).find((p) => !s.provinces[army.province]!.neighbors.includes(p.id) && p.id !== army.province)!;
    expect(validateOrder(s, "regency", { kind: "move", army: army.id, to: far.id })).toMatch(/not adjacent/);
  });

  it("validates edicts strictly", () => {
    expect(validateEdict(EXAMPLE_EDICT)).toBeNull();
    expect(validateEdict({ title: "x", when: [{ field: "moon", op: ">", value: 1 }], then: [{ kind: "curfew" }] })).toMatch(/unknown condition field/);
    expect(validateEdict({ title: "x", when: [{ field: "unrest", op: ">", value: 1 }], then: [{ kind: "tax_relief", factor: 3 }] })).toMatch(/factor/);
  });
});

describe("season resolution", () => {
  it("applies builds, spends gold and logs events", () => {
    const s = world();
    const cap = s.provinces[s.realms["regency"]!.capital]!;
    const before = s.realms["regency"]!.treasury;
    const { state, events, rejected } = resolveSeason(s, submit(s, "regency", [{ kind: "build", province: cap.id, building: "farm" }], "treasurer"));
    expect(rejected).toHaveLength(0);
    expect(state.provinces[cap.id]!.buildings.farm).toBe(cap.buildings.farm + 1);
    expect(state.realms["regency"]!.ledger.buildSpend).toBeGreaterThan(0);
    expect(state.season).toBe(1);
    expect(events.some((e) => e.kind === "build")).toBe(true);
    // Income arrives, so a single farm should not bankrupt the realm.
    expect(state.realms["regency"]!.treasury).toBeGreaterThan(before - 20);
  });

  it("resolves war declarations, marches and captures", () => {
    let s = world();
    // Pick a rival that shares a border with the Regency.
    const enemy = Object.keys(s.realms).find((r) => r !== "regency" && realmProvinces(s, "regency").some((p) => p.neighbors.some((n) => s.provinces[n]!.owner === r)))!;
    expect(enemy).toBeDefined();
    // Give the Regency an overwhelming army adjacent to an enemy province.
    const army = realmArmies(s, "regency")[0]!;
    army.units.regular = 30;
    const start = s.provinces[army.province]!;
    let target = start.neighbors.map((n) => s.provinces[n]!).find((p) => p.owner === enemy);
    if (!target) {
      // Teleport the army to a border province of ours for the test.
      const border = realmProvinces(s, "regency").find((p) => p.neighbors.some((n) => s.provinces[n]!.owner === enemy))!;
      army.province = border.id;
      target = border.neighbors.map((n) => s.provinces[n]!).find((p) => p.owner === enemy)!;
    }
    const r1 = resolveSeason(s, submit(s, "regency", [{ kind: "declare_war", target: enemy }]));
    s = r1.state;
    expect(atWar(s, "regency", enemy)).toBe(true);
    const r2 = resolveSeason(s, submit(s, "regency", [{ kind: "move", army: army.id, to: target.id }]));
    s = r2.state;
    expect(s.armies[army.id]!.province).toBe(target.id);
    // With no walls the province falls at once; with walls a siege begins.
    if (target.buildings.fort === 0) expect(s.provinces[target.id]!.owner).toBe("regency");
    else expect(r2.events.some((e) => e.kind === "siege" || e.kind === "capture")).toBe(true);
  });

  it("signs treaties through proposals", () => {
    let s = world();
    const other = Object.keys(s.realms).find((r) => r !== "regency")!;
    const r1 = resolveSeason(s, submit(s, "regency", [{ kind: "propose", proposal: { to: other, kind: "trade", terms: {}, message: "Open roads?" } }], "envoy"));
    s = r1.state;
    const proposal = s.proposals.find((p) => p.from === "regency")!;
    expect(proposal.status).toBe("pending");
    const r2 = resolveSeason(s, submit(s, other, [{ kind: "respond", proposalId: proposal.id, accept: true }]));
    s = r2.state;
    expect(s.treaties.some((t) => t.kind === "trade" && t.parties.includes("regency") && t.parties.includes(other))).toBe(true);
  });

  it("simulates forty seasons under the steward policy without breaking invariants", () => {
    let s = world("long-run");
    const startProvinces = Object.keys(s.provinces).length;
    for (let i = 0; i < 40 && s.phase !== "finished"; i++) {
      const orders: SubmittedOrder[] = [];
      for (const realm of Object.keys(s.realms)) orders.push(...submit(s, realm, autoOrders(s, realm)));
      const result = resolveSeason(s, orders);
      s = result.state;
      expect(Object.keys(s.provinces)).toHaveLength(startProvinces);
      for (const p of Object.values(s.provinces)) {
        expect(p.population).toBeGreaterThan(0);
        expect(p.unrest).toBeGreaterThanOrEqual(0);
        expect(p.unrest).toBeLessThanOrEqual(100);
        expect(p.owner === NEUTRAL || p.owner === "rebels" || p.owner in s.realms).toBe(true);
      }
      for (const a of Object.values(s.armies)) expect(s.provinces[a.province]).toBeDefined();
      for (const r of Object.values(s.realms)) expect(Number.isFinite(r.treasury)).toBe(true);
    }
    expect(s.season).toBeGreaterThan(0);
    expect(realmReport(s, "regency")).toContain("Provinces");
    expect(mapOverview(s)).toContain("Wars:");
  });

  it("resolves crises with their chosen or default option and teaches the heir", () => {
    let s = world("crisis-seed");
    s.crises = [];
    const r = resolveSeason(s, [], { forcedCrises: ["harvest"] });
    s = r.state;
    const harvest = s.crises.find((c) => c.kind === "harvest" && c.chosen === null)!;
    expect(harvest).toBeDefined();
    expect(harvest.options.map((o) => o.id)).toContain("sell");
    const gold = s.realms["regency"]!.treasury;
    harvest.chosen = "sell";
    harvest.decidedBy = "regent";
    const r2 = resolveSeason(s, []);
    expect(r2.events.some((e) => e.kind === "crisis" && e.text.includes("Sell the surplus"))).toBe(true);
    expect(r2.state.heir.traits.greedy).toBeGreaterThan(s.heir.traits.greedy);
    // +30 gold on top of the ordinary season income.
    expect(r2.state.realms["regency"]!.treasury).toBeGreaterThan(gold + 30 - 5);
    // An undecided crisis takes its default.
    const r3 = resolveSeason(r2.state, [], { forcedCrises: ["plague"] });
    const plague = r3.state.crises.find((c) => c.kind === "plague")!;
    const r4 = resolveSeason(r3.state, []);
    expect(r4.state.crises.find((c) => c.id === plague.id)?.decidedBy).toBe("resolved");
    expect(r4.state.crises.find((c) => c.id === plague.id)?.chosen).toBe("ignore");
  });

  it("moves the estates and derives legitimacy from their consent", () => {
    let s = world("estates");
    const r = resolveSeason(s, submit(s, "regency", [{ kind: "set_tax", taxRate: 0.6 }], "chancellor"));
    s = r.state;
    const after = resolveSeason(s, []).state;
    expect(after.realms["regency"]!.estates.peasants).toBeLessThan(s.realms["regency"]!.estates.peasants);
    expect(after.realms["regency"]!.legitimacy).toBe(consentOf(after.realms["regency"]!.estates));
    expect(after.heir.traits.greedy).toBeGreaterThan(0);
    expect(after.digest.length).toBeGreaterThan(0);
    expect(after.digest[after.digest.length - 1]).toContain("Treasury");
  });

  it("opens trade routes between markets at peace and blockades them in war", () => {
    let s = world("trade");
    const other = Object.keys(s.realms).find((r) => r !== "regency" && realmProvinces(s, "regency").some((p) => p.neighbors.some((n) => s.provinces[n]!.owner === r)))!;
    const routes = tradeRoutes(s, "regency");
    expect(routes.some((r) => r.realm === other)).toBe(true);
    s.wars.push(["regency", other]);
    expect(tradeRoutes(s, "regency").some((r) => r.realm === other)).toBe(false);
    // Access to a resource through a trade treaty.
    const horsesOwner = Object.values(s.provinces).find((p) => p.resources.includes("horses") && p.owner !== "regency" && p.owner in s.realms);
    if (horsesOwner) {
      s.wars = [];
      const had = hasAccessTo(s, "regency", "horses");
      s.treaties.push({ id: "t-test", kind: "trade", parties: ["regency", horsesOwner.owner], signed: 0, seasonsLeft: null });
      expect(hasAccessTo(s, "regency", "horses") || had).toBe(true);
    }
  });

  it("ends the game at the heir's majority", () => {
    let s = generateWorld({ seed: "short", rivals: 2, regencySeasons: 2 });
    s = resolveSeason(s, []).state;
    expect(s.outcome).toBeNull();
    s = resolveSeason(s, []).state;
    expect(s.phase).toBe("finished");
    expect(s.outcome?.kind).toBe("victory");
    expect(s.outcome?.title).toBe("The Heir's Majority");
    expect(s.outcome?.verdict).toContain("of age");
  });

  it("declares defeat when the capital falls", () => {
    const s = world();
    const enemy = Object.keys(s.realms).find((r) => r !== "regency")!;
    s.provinces[s.realms["regency"]!.capital]!.owner = enemy;
    const r = resolveSeason(s, []);
    expect(r.state.outcome?.kind).toBe("defeat");
    expect(r.state.outcome?.title).toBe("The capital has fallen");
  });
});

describe("explaining a number", () => {
  it("walks the ledger and the estates for legitimacy and treasury", () => {
    const s = world("explain");
    const r = resolveSeason(s, submit(s, "regency", [{ kind: "set_tax", taxRate: 0.55 }], "chancellor"));
    const leg = explain(r.state, r.events, { kind: "legitimacy" });
    expect(leg.title).toContain("Legitimacy");
    expect(leg.causes.some((c) => c.text.includes("peasants"))).toBe(true);
    expect(leg.causes.some((c) => c.text.includes("tax of 55%"))).toBe(true);
    const tre = explain(r.state, r.events, { kind: "treasury" });
    expect(tre.headline).toMatch(/Last season closed/);
    expect(tre.causes.some((c) => c.text.includes("taxes brought"))).toBe(true);
  });

  it("explains a province's bread and unrest, and an army's position", () => {
    const s = world("explain2");
    const cap = s.realms["regency"]!.capital;
    const hunger = explain(s, [], { kind: "province", province: cap, aspect: "hunger" });
    expect(hunger.causes.some((c) => c.text.includes("rations"))).toBe(true);
    const unrest = explain(s, [], { kind: "province", province: cap, aspect: "unrest" });
    expect(unrest.causes.some((c) => c.text.includes("unrest stands at"))).toBe(true);
    const army = Object.values(s.armies).find((a) => a.realm === "regency")!;
    const ex = explain(s, [], { kind: "army", army: army.id });
    expect(ex.title).toContain(army.name);
    expect(ex.causes.some((c) => c.text.includes("morale"))).toBe(true);
    expect(explain(s, [], { kind: "army", army: "nope" }).headline).toContain("No army");
  });
});

describe("the Regent's promises", () => {
  it("settles structured promises and charges infamy for a broken word", () => {
    const s = world("promise");
    const other = Object.keys(s.realms).find((r) => r !== "regency")!;
    const problem = validatePromiseCheck(s, { kind: "no_war", with: other, seasons: 2 });
    expect(problem).toBeNull();
    expect(validatePromiseCheck(s, { kind: "no_war", with: "nowhere", seasons: 2 })).toContain("unknown realm");
    const promises: RegentPromise[] = [
      { id: "pr1", to: other, text: "We shall not march on you.", check: { kind: "no_war", with: other, seasons: 2 }, season: 0, status: "pending", settled: null, recordedBy: "envoy" },
      { id: "pr2", to: other, text: "A treaty of trade before the year is out.", check: { kind: "treaty", with: other, treatyKind: "trade" }, season: 0, status: "pending", settled: null, recordedBy: "envoy" },
    ];
    // Still pending while nothing has happened.
    expect(settlePromises(s, promises)).toHaveLength(0);
    // The treaty is signed: kept.
    s.treaties.push({ id: "t1", kind: "trade", parties: ["regency", other], signed: 0, seasonsLeft: null });
    expect(settlePromises(s, promises).map((p) => p.status)).toEqual(["kept"]);
    // War: the other promise breaks, and it costs infamy and regard.
    const infamyBefore = s.realms["regency"]!.infamy;
    const regardBefore = s.realms[other]!.relations["regency"] ?? 0;
    s.wars.push(["regency", other]);
    const changed = settlePromises(s, promises);
    expect(changed.map((p) => p.status)).toEqual(["broken"]);
    expect(s.realms["regency"]!.infamy).toBe(infamyBefore + BROKEN_PROMISE_INFAMY);
    expect(s.realms[other]!.relations["regency"]).toBe(regardBefore - BROKEN_PROMISE_REGARD);
    expect(describePromiseCheck(s, promises[1]!.check)).toContain("trade");
  });
});

describe("the opening matter", () => {
  it("puts one matter before the Regent at season 0 of the long Regency", () => {
    const s = world("opening");
    expect(s.crises.filter((c) => c.chosen === null).length).toBeGreaterThan(0);
    expect(s.season).toBe(0);
  });
});
