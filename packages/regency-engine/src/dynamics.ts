import { z } from "zod";
const id = z.string().min(1).max(80),
  amount = z.number().finite().nonnegative();
export const EconomySchema = z
  .object({
    regions: z
      .array(
        z
          .object({
            id,
            name: id,
            x: z.number(),
            y: z.number(),
            population: amount,
            health: z.number().min(0).max(100).default(75),
            housing: amount.default(150),
            unrest: z.number().min(0).max(100).default(10),
            grain: amount,
            yield: amount,
            consumption: amount,
            labour: amount,
            confidence: z.number().min(0).max(100),
            prosperity: z.number().min(0).max(100),
            character: z.string().max(400),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    routes: z
      .array(
        z
          .object({
            id,
            name: id,
            from: id,
            to: id,
            capacity: amount,
            condition: z.number().min(0).max(1),
            subsidy: amount,
            toll: amount,
            workers: amount,
            progress: amount,
            workRequired: amount,
          })
          .strict(),
      )
      .max(40),
    institutions: z
      .array(
        z
          .object({
            id,
            name: id,
            region: id,
            mandate: z.string().max(500),
            workers: amount,
            upkeep: amount,
            influence: z.number().min(0).max(100),
            traits: z.record(
              z.union([z.number().finite(), z.string().max(300), z.boolean()]),
            ),
          })
          .strict(),
      )
      .max(32),
    neighbors: z
      .array(
        z
          .object({
            id,
            name: id,
            relationship: z.number().min(-100).max(100),
            demand: z.string().max(500),
            leverage: z.string().max(400),
            tension: z.number().min(0).max(100).default(20),
            mobilization: amount.default(0),
            tradeCapacity: amount.default(0),
            grainPrice: amount.default(2),
            borderRegion: id.optional(),
            treaty: z.enum(["none", "trade", "nonaggression", "alliance"]).default("none"),
          })
          .strict(),
      )
      .max(12),
    forces: z.array(z.object({
      id, name: id, region: id, strength: amount,
      readiness: z.number().min(0).max(100),
      pay: amount, provision: amount,
      posture: z.enum(["garrison", "patrol", "mobilized"]),
    }).strict()).max(24).default([]),
    factions: z.array(z.object({
      id, name: id, region: id,
      interest: z.enum(["livelihood", "commerce", "security", "autonomy"]),
      influence: z.number().min(0).max(100),
      support: z.number().min(0).max(100),
      grievance: z.string().max(400),
    }).strict()).max(24).default([]),
    debt: amount.default(0),
    interestRate: z.number().min(0).max(1).default(0.015),
    taxRate: z.number().min(0).max(1),
    standingExpense: amount,
    flows: z
      .array(
        z.object({
          route: id,
          amount: amount,
          capacity: amount,
          reason: z.string().max(300),
        }),
      )
      .max(40),
    reports: z.array(z.string().max(400)).max(20),
    accounts: z.object({
      opening: z.number(),
      revenue: amount,
      services: amount,
      works: amount,
      standing: amount,
      closing: z.number(),
    }),
  })
  .strict();
export type Economy = z.infer<typeof EconomySchema>;
export function initialEconomy(): Economy {
  return EconomySchema.parse({
    forces: [
      { id: "march-watch", name: "The March Watch", region: "northwood", strength: 3, readiness: 62, pay: 2, provision: 0.6, posture: "garrison" },
    ],
    factions: [
      { id: "commons", name: "The river commons", region: "eastbank", interest: "livelihood", influence: 40, support: 48, grievance: "The flood stranded our grain; a hungry capital calls us hoarders." },
      { id: "guilds", name: "The chartered houses", region: "harbor", interest: "commerce", influence: 55, support: 60, grievance: "We will risk ships, but not our fortunes on promises that die with a monarch." },
      { id: "marchers", name: "The northern freeholders", region: "northwood", interest: "autonomy", influence: 45, support: 52, grievance: "A foreign toll and a royal levy leave little difference between two masters." },
    ],
    regions: [
      {
        id: "crownlands",
        name: "Crownlands",
        x: 470,
        y: 370,
        population: 120,
        grain: 30,
        yield: 6,
        consumption: 14,
        labour: 8,
        confidence: 62,
        prosperity: 60,
        character:
          "Bakers, clerks and craftspeople depend on grain arriving from the east.",
      },
      {
        id: "eastbank",
        name: "Eastbank",
        x: 870,
        y: 480,
        population: 90,
        grain: 50,
        yield: 24,
        consumption: 10,
        labour: 7,
        confidence: 48,
        prosperity: 44,
        character:
          "Farming villages with grain to sell, cut off by the spring flood.",
      },
      {
        id: "northwood",
        name: "Northwood",
        x: 430,
        y: 285,
        population: 60,
        grain: 22,
        yield: 5,
        consumption: 7,
        labour: 6,
        confidence: 57,
        prosperity: 52,
        character:
          "Woodcutters and carters want contracts that do not surrender their independence.",
      },
      {
        id: "harbor",
        name: "Riverport",
        x: 555,
        y: 550,
        population: 70,
        grain: 25,
        yield: 2,
        consumption: 8,
        labour: 7,
        confidence: 66,
        prosperity: 68,
        character:
          "Merchants can connect the realm to foreign grain, but expect a return.",
      },
    ],
    routes: [
      {
        id: "east-crossing",
        name: "The eastern bridge",
        from: "eastbank",
        to: "crownlands",
        capacity: 22,
        condition: 0.12,
        subsidy: 0,
        toll: 0,
        workers: 0,
        progress: 0,
        workRequired: 24,
      },
      {
        id: "east-ferry",
        name: "The river ferry",
        from: "eastbank",
        to: "harbor",
        capacity: 2,
        condition: 1,
        subsidy: 0,
        toll: 0,
        workers: 0,
        progress: 0,
        workRequired: 0,
      },
      {
        id: "port-road",
        name: "The market road",
        from: "harbor",
        to: "crownlands",
        capacity: 20,
        condition: 1,
        subsidy: 0,
        toll: 0,
        workers: 0,
        progress: 0,
        workRequired: 0,
      },
      {
        id: "timber-road",
        name: "The northern road",
        from: "northwood",
        to: "crownlands",
        capacity: 10,
        condition: 0.8,
        subsidy: 0,
        toll: 1,
        workers: 0,
        progress: 0,
        workRequired: 0,
      },
    ],
    institutions: [
      {
        id: "timber-guild",
        name: "The Northwood guild",
        region: "northwood",
        mandate: "Independent timber and cartage.",
        workers: 1,
        upkeep: 0,
        influence: 35,
        traits: { timber: true },
      },
      {
        id: "river-houses",
        name: "The river houses",
        region: "harbor",
        mandate: "Trade through the port.",
        workers: 1,
        upkeep: 0,
        influence: 45,
        traits: { imports: true },
      },
    ],
    neighbors: [
      {
        id: "rook",
        name: "The Duchy of Rook",
        relationship: -12,
        demand: "Recognition of its toll claim on the northern road.",
        leverage: "It controls the winter grain route beyond Northwood.",
        tension: 38, mobilization: 5, borderRegion: "northwood", tradeCapacity: 8,
      },
    ],
    taxRate: 0.16,
    standingExpense: 24,
    flows: [],
    reports: [
      "Eastern grain is abundant, but the damaged crossing keeps it from the markets that need it.",
    ],
    accounts: {
      opening: 120,
      revenue: 0,
      services: 0,
      works: 0,
      standing: 0,
      closing: 120,
    },
  });
}
/** One month of shared consequences. Self-contained so policy forecasts execute this same function. */
export function settleRealmMonth(
  realm: {
    month: number;
    time: string;
    economy: Economy;
    ledger: Array<{ id: string; amount: number; context: string }>;
  },
  events: string[],
) {
  const e = realm.economy,
    round = (n: number) => Math.round(n * 10) / 10,
    clamp = (n: number) => Math.max(0, Math.min(100, n));
  const treasury = realm.ledger.find((x) => x.id === "treasury")!;
  const opening = treasury.amount,
    reports: string[] = [],
    labour = Object.fromEntries(e.regions.map((r) => [r.id, r.labour]));
  const seasons = [
    0.65, 0.85, 1, 1.15, 1.45, 1.8, 2, 1.5, 0.9, 0.55, 0.3, 0.25,
  ];
  let services = 0,
    works = 0;
  // Readiness has a material price: pay, local food and labour diverted from production.
  for (const force of e.forces) {
    const region = e.regions.find(r => r.id === force.region)!;
    const required = force.strength * force.provision;
    const supplied = Math.min(region.grain, required);
    region.grain = round(region.grain - supplied);
    const deployment = force.posture === "mobilized" ? 1 : force.posture === "patrol" ? .5 : .2;
    labour[region.id] = Math.max(0, labour[region.id]! - force.strength * deployment);
    const pay = force.strength * force.pay;
    services += pay;
    force.readiness = round(clamp(force.readiness + (supplied >= required && opening >= pay ? 2 : -8)));
    if (supplied < required) reports.push(force.name + " is drawing down readiness because local food cannot supply it.");
  }
  // Foreign grain is purchased, never conjured; treaties and escalation affect access.
  for (const neighbor of e.neighbors) {
    const border = e.regions.find(r => r.id === neighbor.borderRegion);
    const deployed = e.forces.filter(f => f.region === neighbor.borderRegion).reduce((n, f) => n + f.strength * f.readiness / 100, 0);
    const mobilized = e.forces.some(f => f.region === neighbor.borderRegion && f.posture === "mobilized");
    neighbor.tension = round(clamp(neighbor.tension + (mobilized ? 4 : -1) + (neighbor.relationship < -40 ? 3 : 0) - (neighbor.treaty === "nonaggression" || neighbor.treaty === "alliance" ? 3 : 0)));
    neighbor.mobilization = round(Math.max(0, neighbor.mobilization + (neighbor.tension > 60 ? 1 : -.2)));
    if (border && neighbor.treaty !== "none" && neighbor.tension < 70) {
      const bought = Math.min(neighbor.tradeCapacity, Math.max(0, border.consumption * 2 - border.grain), Math.max(0, opening - services) / Math.max(.1, neighbor.grainPrice));
      border.grain = round(border.grain + bought);
      services += bought * neighbor.grainPrice;
      if (bought > 0) reports.push(neighbor.name + " supplied " + round(bought) + " grain under treaty; the treasury paid " + round(bought * neighbor.grainPrice) + " crowns.");
    }
    if (border && neighbor.tension > 70 && neighbor.mobilization > deployed) {
      const loss = Math.min(border.grain, (neighbor.mobilization - deployed) * .4);
      border.grain = round(border.grain - loss);
      border.unrest = clamp(border.unrest + 3);
      reports.push(border.name + ": frontier seizures cost " + round(loss) + " grain; the rival's deployed strength exceeds the supplied watch.");
    }
  }
  services += e.debt * e.interestRate;
  for (const office of e.institutions) {
    const used = Math.min(labour[office.region] ?? 0, office.workers);
    labour[office.region] = (labour[office.region] ?? 0) - used;
    services += office.upkeep;
  }
  for (const route of e.routes) {
    services += route.subsidy;
    if (route.workRequired > route.progress && route.workers > 0) {
      const used = Math.min(labour[route.from] ?? 0, route.workers);
      labour[route.from] = (labour[route.from] ?? 0) - used;
      const before = route.progress;
      route.progress = Math.min(route.workRequired, route.progress + used * 2);
      works += used * 2;
      if (used < route.workers)
        reports.push(
          route.name +
            ": only " +
            used +
            " of " +
            route.workers +
            " requested workers were available.",
        );
      if (
        before < route.workRequired &&
        route.progress === route.workRequired
      ) {
        route.condition = 1;
        route.workers = 0;
        reports.push(
          route.name + " reopened after the last span was completed.",
        );
      } else if (used)
        reports.push(
          route.name +
            ": " +
            round((route.progress / route.workRequired) * 100) +
            "% complete; " +
            used +
            " workers taken from local production.",
        );
    }
  }
  for (const r of e.regions) {
    const available = (labour[r.id] ?? 0) / Math.max(1, r.labour);
    r.grain = round(
      r.grain + r.yield * seasons[realm.month % 12]! * (0.6 + 0.4 * available),
    );
  }
  const capacities = e.routes.map((r) =>
    Math.max(0, r.capacity * r.condition + r.subsidy * 2 - r.toll),
  );
  const flows = e.routes.map((r, i) => ({
    route: r.id,
    amount: 0,
    capacity: round(capacities[i]!),
    reason: "",
  }));
  // Repeated clearing permits grain to travel through Riverport into Crownlands.
  for (let pass = 0; pass < 3; pass++)
    for (let i = 0; i < e.routes.length; i++) {
      const route = e.routes[i]!,
        a = e.regions.find((r) => r.id === route.from)!,
        b = e.regions.find((r) => r.id === route.to)!;
      const [from, to] =
        a.grain / Math.max(1, a.consumption) >
        b.grain / Math.max(1, b.consumption)
          ? [a, b]
          : [b, a];
      const cargo = round(
        Math.min(
          Math.max(0, from.grain - from.consumption * 2),
          Math.max(0, to.consumption * 2 - to.grain),
          Math.max(0, capacities[i]! - flows[i]!.amount),
        ),
      );
      from.grain = round(from.grain - cargo);
      to.grain = round(to.grain + cargo);
      flows[i]!.amount = round(flows[i]!.amount + cargo);
      if (cargo)
        flows[i]!.reason =
          from.name +
          " supplied " +
          to.name +
          " through " +
          route.name.toLowerCase() +
          ".";
    }
  // Explain idle capacity in the same terms used by market clearing, before consumption.
  for (let i = 0; i < flows.length; i++) {
    const flow = flows[i]!,
      route = e.routes[i]!;
    if (flow.amount > 0) continue;
    const a = e.regions.find((r) => r.id === route.from)!,
      b = e.regions.find((r) => r.id === route.to)!;
    const stocked =
      a.grain >= a.consumption * 2 && b.grain >= b.consumption * 2;
    flow.reason =
      flow.capacity <= 0
        ? route.name + " had no usable capacity."
        : stocked
          ? route.name +
            ": both markets entered the month with at least two months of food; no restocking was needed."
          : route.name +
            ": no connected market could offer grain beyond its own two-month reserve.";
    if (route.subsidy > 0) reports.push(flow.reason);
  }
  let production = 0;
  for (const r of e.regions) {
    const missing = Math.max(0, r.consumption - r.grain);
    r.grain = round(Math.max(0, r.grain - r.consumption));
    const hunger = missing / Math.max(1, r.consumption);
    const crowding = Math.max(0, r.population / Math.max(1, r.housing) - 1);
    r.health = round(clamp(r.health + (hunger ? -hunger * 10 : 1) - crowding * 3));
    r.unrest = round(clamp(r.unrest + hunger * 12 + crowding * 3 + Math.max(0, e.taxRate - .2) * 10 - (hunger === 0 ? 1 : 0)));
    const trade = flows.reduce(
      (n, f, i) =>
        n +
        (e.routes[i]!.from === r.id || e.routes[i]!.to === r.id ? f.amount : 0),
      0,
    );
    r.prosperity = round(
      clamp(
        r.prosperity +
          Math.min(3, trade * 0.25) -
          missing * 2 -
          (e.taxRate > 0.25 ? (e.taxRate - 0.25) * 20 : 0),
      ),
    );
    r.confidence = round(
      clamp(
        r.confidence +
          (missing ? -missing * 3 : r.grain >= r.consumption ? 1 : -0.5) +
          (trade >= 5 ? 1 : 0) -
          (e.taxRate > 0.25 ? 2 : 0),
      ),
    );
    production += r.population * 0.5 * (r.prosperity / 100);
    if (missing)
      reports.push(
        r.name +
          " lacked " +
          round(missing) +
          " grain this month; confidence fell because meals were missed.",
      );
    else if (trade >= 5)
      reports.push(
        r.name +
          " traded " +
          round(trade) +
          " grain; full stalls are rebuilding confidence.",
      );
  }
  // Internal migration conserves people and moves their food and labour demand with them.
  const departures = e.regions.map(region => ({ region, amount: Math.min(region.population * .02, Math.max(0, region.unrest - 35) * .03) }));
  for (const { region, amount } of departures) {
    const reachable = new Set(e.routes.filter(r => r.condition > .3 && (r.from === region.id || r.to === region.id)).map(r => r.from === region.id ? r.to : r.from));
    const destination = e.regions.filter(r => reachable.has(r.id) && r.unrest < region.unrest && r.housing > r.population).sort((a, b) => a.unrest - b.unrest)[0];
    const moved = destination ? round(Math.min(amount, destination.housing - destination.population)) : 0;
    if (!destination || moved <= 0) continue;
    const food = region.consumption / Math.max(1, region.population) * moved;
    const hands = region.labour / Math.max(1, region.population) * moved;
    region.population -= moved; destination.population += moved;
    region.consumption -= food; destination.consumption += food;
    region.labour -= hands; destination.labour += hands;
    reports.push(region.name + ": " + moved + " households moved to " + destination.name + ", taking their labour and food needs with them.");
  }
  for (const faction of e.factions) {
    const region = e.regions.find(r => r.id === faction.region)!;
    const security = e.forces.filter(f => f.region === region.id).reduce((n, f) => n + f.strength * f.readiness / 100, 0);
    const pressure = e.neighbors.filter(n => n.borderRegion === region.id).reduce((n, x) => n + x.mobilization * x.tension / 100, 0);
    const target = faction.interest === "commerce" ? region.prosperity : faction.interest === "security" ? clamp(60 + security * 5 - pressure * 5) : faction.interest === "autonomy" ? clamp(80 - e.taxRate * 100 - e.forces.filter(f => f.region === region.id && f.posture === "mobilized").length * 15) : region.confidence;
    faction.support = round(clamp(faction.support + (target - faction.support) * .2));
  }
  const revenue = round(
    production * e.taxRate +
      flows.reduce((n, f, i) => n + f.amount * e.routes[i]!.toll * 0.1, 0),
  );
  treasury.amount = round(
    treasury.amount + revenue - services - works - e.standingExpense,
  );
  treasury.context =
    "Received " +
    revenue +
    "; services " +
    round(services) +
    ", works " +
    round(works) +
    ", standing expenses " +
    e.standingExpense +
    ".";
  const grain = realm.ledger.find((x) => x.id === "grain")!,
    trust = realm.ledger.find((x) => x.id === "trust")!;
  grain.amount = round(
    (e.regions.reduce((n, r) => n + r.grain, 0) /
      Math.max(
        1,
        e.regions.reduce((n, r) => n + r.consumption, 0),
      )) *
      4,
  );
  grain.context =
    "Realm-wide reserves; distribution matters as much as the total.";
  trust.amount = round(
    e.regions.reduce((n, r) => n + r.confidence * r.population, 0) /
      e.regions.reduce((n, r) => n + r.population, 0),
  );
  trust.context =
    "Population-weighted confidence, arising from food, market access and taxation.";
  e.accounts = {
    opening,
    revenue,
    services: round(services),
    works: round(works),
    standing: e.standingExpense,
    closing: treasury.amount,
  };
  e.flows = flows;
  e.reports = reports.slice(0, 12);
  realm.month++;
  realm.time =
    [
      "Spring",
      "Spring",
      "Spring",
      "Summer",
      "Summer",
      "Summer",
      "Autumn",
      "Autumn",
      "Autumn",
      "Winter",
      "Winter",
      "Winter",
    ][realm.month % 12] +
    " · month " +
    ((realm.month % 12) + 1) +
    " · year " +
    (Math.floor(realm.month / 12) + 1);
  events.push(...reports);
  if (treasury.amount < 0)
    events.push(
      "The treasury is in arrears. Obligations continue; the council must find funding.",
    );
}
