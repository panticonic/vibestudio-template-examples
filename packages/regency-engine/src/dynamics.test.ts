import { describe, it, expect } from "vitest";
import { initialGame, settleRealmMonth } from "./index.js";
function months(
  n: number,
  change?: (realm: ReturnType<typeof initialGame>["world"]) => void,
) {
  const realm = initialGame().world;
  change?.(realm);
  for (let i = 0; i < n; i++) settleRealmMonth(realm, []);
  return realm;
}
describe("a realm with causes", () => {
  it("mobilization raises foreign tension while a nonaggression treaty reduces it", () => {
    const ordinary = months(1);
    const mobilized = months(1, r => { r.economy.forces[0]!.posture = "mobilized"; });
    const treaty = months(1, r => { r.economy.neighbors[0]!.treaty = "nonaggression"; });
    expect(mobilized.economy.neighbors[0]!.tension).toBeGreaterThan(ordinary.economy.neighbors[0]!.tension);
    expect(treaty.economy.neighbors[0]!.tension).toBeLessThan(ordinary.economy.neighbors[0]!.tension);
  });
  it("migration transfers households, labour and consumption without creating them", () => {
    const realm = initialGame().world;
    const source = realm.economy.regions[0]!;
    source.unrest = 90;
    for (const route of realm.economy.routes) route.condition = 1;
    const totals = () => ["population", "labour", "consumption"].map(key => realm.economy.regions.reduce((n,r) => n + r[key as "population" | "labour" | "consumption"],0));
    const before = totals(), population = source.population;
    settleRealmMonth(realm, []);
    expect(source.population).toBeLessThan(population);
    totals().forEach((n,i) => expect(n).toBeCloseTo(before[i]!, 8));
  });
  it("moves conserved grain through connected routes, consumes food and accounts for every crown", () => {
    const realm = months(1);
    const account = realm.economy.accounts;
    expect(account.closing).toBeCloseTo(
      account.opening +
        account.revenue -
        account.services -
        account.works -
        account.standing,
      1,
    );
    expect(realm.economy.regions.every((r) => r.grain >= 0)).toBe(true);
    expect(realm.economy.flows.every((f) => f.amount <= f.capacity + 0.1)).toBe(
      true,
    );
    expect(realm.month).toBe(1);
  });
  it("explains a paid but idle ferry from actual market stocks", () => {
    const realm = months(1, (r) => {
      r.economy.routes.find((x) => x.id === "east-ferry")!.subsidy = 5;
    });
    expect(
      realm.economy.flows.find((f) => f.route === "east-ferry")!.amount,
    ).toBe(0);
    expect(realm.economy.reports.join(" ")).toContain(
      "no restocking was needed",
    );
    expect(realm.economy.accounts.services).toBe(11); // Ferry 5 + three watch companies at 2.
  });
  it("ferry support changes market access and food distribution, rather than awarding trust", () => {
    const without = months(3),
      withFerry = months(3, (r) => {
        r.economy.routes.find((x) => x.id === "east-ferry")!.subsidy = 5;
      });
    const cargo = (r: typeof without) =>
      r.economy.flows.find((f) => f.route === "east-ferry")!.amount;
    expect(cargo(withFerry)).toBeGreaterThan(cargo(without));
    expect(withFerry.economy.accounts.services - without.economy.accounts.services).toBe(5);
    expect(
      withFerry.economy.regions.find((r) => r.id === "harbor")!.grain,
    ).toBeGreaterThan(
      without.economy.regions.find((r) => r.id === "harbor")!.grain,
    );
    expect(withFerry.ledger.find((x) => x.id === "trust")!.amount).not.toBe(
      without.ledger.find((x) => x.id === "trust")!.amount,
    );
  });
  it("bridge works consume available labour and wages and take real time to reopen", () => {
    const first = months(1, (r) => {
      r.economy.routes.find((x) => x.id === "east-crossing")!.workers = 6;
    });
    const bridge = first.economy.routes.find((x) => x.id === "east-crossing")!;
    expect(bridge.progress).toBe(12);
    expect(bridge.condition).toBe(0.12);
    expect(first.economy.accounts.works).toBe(12);
    settleRealmMonth(first, []);
    expect(bridge.condition).toBe(1);
    expect(bridge.workers).toBe(0);
    expect(first.economy.reports.some((x) => x.includes("reopened"))).toBe(
      true,
    );
  });
  it("time progresses one month at a time, including seasons and food needs", () => {
    const winter = months(10);
    expect(winter.time).toContain("Winter");
    expect(
      winter.economy.regions.some(
        (r) =>
          r.confidence !==
          initialGame().world.economy.regions.find((x) => x.id === r.id)!
            .confidence,
      ),
    ).toBe(true);
  });
});
