import type { World as Realm } from "@workspace/regency-engine";
import type { RealmReadback } from "../examples-review/types.js";

export function realmReadback(id: string, world: Realm): RealmReadback {
  const { accounts, debt, routes, regions, flows, neighbors } = world.economy;
  return {
    id,
    month: world.month,
    treasury: world.ledger.find((row) => row.id === "treasury")!.amount,
    debt,
    income: accounts.revenue,
    spending: accounts.services + accounts.works + accounts.standing,
    serviceCost: accounts.services,
    worksCost: accounts.works,
    routes: routes.map(({ id, subsidy, condition, progress, workers }) => {
      const observed = flows.find((flow) => flow.route === id);
      return {
        id,
        subsidy,
        condition,
        progress,
        workers,
        cargo: observed?.amount ?? null,
        capacity: observed?.capacity ?? null,
      };
    }),
    regions: regions.map(({ id, grain, population, confidence }) => ({
      id,
      grain,
      population,
      confidence,
    })),
    borderTension: neighbors[0]?.tension ?? null,
  };
}
