import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import {
  createWorldAPI,
  initialWorld,
  type Campaign,
  type Entity,
  type World,
} from "@workspace/adventure-engine";
import { sceneSnapshot } from "@workspace/adventure-engine/art";
import {
  deadLetterOffice,
  missingCountry,
  wanderingHouse,
} from "@workspace/adventure-campaigns";
import {
  initialGarden,
  pulseGarden,
  visitResident,
  type Garden,
} from "@workspace/grimoire-engine";
import {
  initialGame,
  settleRealmMonth,
  type World as Realm,
} from "@workspace/regency-engine";
import type {
  AdventureObject,
  AdventureView,
  GardenReadback,
  RealmReadback,
} from "../examples-review/types.js";

const digest = (source: string) =>
  createHash("sha256").update(source).digest("hex");
const readFlag = (value: unknown) =>
  typeof value === "boolean" ? value : null;

function adventureView(id: string, world: World): AdventureView {
  const view = createWorldAPI(world, world.playerId).observe();
  const entity = (item: Entity): AdventureObject => ({
    id: item.id,
    location: item.location ?? null,
    kind: item.kind,
    open: readFlag(item.components.open),
    sealed: readFlag(item.components.sealed),
    locked: readFlag(item.components.locked),
  });
  return {
    id,
    place: view.location.id,
    tick: world.tick,
    entities: [...view.entities, ...view.inventory].map(entity),
    inventory: view.inventory.map((item) => item.id),
    exits: Object.values(view.exits),
    signature: digest(sceneSnapshot(world).signature),
  };
}

function journey(campaign: Campaign) {
  const world = initialWorld(campaign);
  // These are the trusted original Examples campaign behavior bodies. Actions
  // still exercise the same actor-scoped world API used by the game.
  const hooks = Object.fromEntries(
    world.behaviors.map((behavior) => [
      behavior.id,
      runInNewContext(
        `(function(world, state, event, self) {${behavior.code}\n})`,
      ),
    ]),
  );
  return {
    player: createWorldAPI(world, world.playerId, false, hooks),
    at: (id: string) => adventureView(id, world),
  };
}

function adventureSnapshots() {
  const post = journey(deadLetterOffice);
  const landing = post.at("post-landing");
  post.player.open("mara-letter");
  const letterOpened = post.at("post-letter-opened");
  post.player.read("mara-letter");
  const letterRead = post.at("post-letter-read");
  post.player.act("harbour-bell", "Ring the bell");
  post.player.act("harbour-bell", "Ring the bell");
  const lowTide = post.at("post-low-tide");

  const routed = journey(deadLetterOffice);
  routed.player.move("customs");
  const cabinet = routed.at("post-cabinet");
  routed.player.act("sorting-cabinet", "Insert a letter");
  const sorted = routed.at("post-sorted");
  routed.player.take("permit");
  const permit = routed.at("post-permit");
  routed.player.move("landing");
  routed.player.move("quay");
  const ferryLocked = routed.at("post-ferry-locked");
  routed.player.give("permit", "tomas");
  const ferryReleased = routed.at("post-ferry-released");

  const embassy = journey(missingCountry);
  const vestibule = embassy.at("embassy-vestibule");
  embassy.player.read("notice");
  const notice = embassy.at("embassy-notice");
  embassy.player.move("salon");
  const salon = embassy.at("embassy-salon");
  embassy.player.move("vestibule");
  embassy.player.move("square");
  const square = embassy.at("embassy-square");

  const hotel = journey(wanderingHouse);
  const lobby = hotel.at("hotel-lobby");
  hotel.player.move("engine-room");
  const engine = hotel.at("hotel-engine");
  hotel.player.move("lobby");
  hotel.player.move("conservatory");
  const conservatory = hotel.at("hotel-conservatory");
  hotel.player.take("teacup");
  const cupCarried = hotel.at("hotel-cup-carried");

  return {
    landing,
    letterOpened,
    letterRead,
    lowTide,
    cabinet,
    sorted,
    permit,
    ferryLocked,
    ferryReleased,
    vestibule,
    notice,
    salon,
    square,
    lobby,
    engine,
    conservatory,
    cupCarried,
  };
}

function gardenReadback(id: string, garden: Garden): GardenReadback {
  return {
    id,
    day: garden.day,
    phase: garden.phase,
    weather: garden.weather,
    homes: garden.habitats.map(
      ({ id, water, shade, bloom, shelter, traits }) => ({
        id,
        values: Object.entries({
          ...traits,
          water,
          shade,
          bloom,
          shelter,
        }).flatMap(([key, amount]) =>
          typeof amount === "number" ? [{ key, amount }] : [],
        ),
      }),
    ),
    residents: garden.residents.map(
      ({ id, name, home, needs, energy, attachment, settled, lastVisit }) => ({
        id,
        name,
        home,
        needs: Object.entries(needs).map(([key, amount]) => ({ key, amount })),
        energy,
        attachment,
        settled,
        lastVisit,
      }),
    ),
    discoveries: garden.discoveries.map(({ id, title }) => ({ id, title })),
  };
}

function gardenSnapshots() {
  const garden = initialGarden();
  const opening = gardenReadback("garden-opening", garden);
  visitResident(garden, "sol");
  const firstTap = gardenReadback("garden-first-visit", garden);
  visitResident(garden, "sol");
  const repeatedTap = gardenReadback("garden-repeat-visit", garden);
  pulseGarden(garden, []);
  const firstLinger = gardenReadback("garden-first-linger", garden);
  pulseGarden(garden, []);
  visitResident(garden, "sol");
  const nextDay = gardenReadback("garden-next-day", garden);
  for (let phase = 0; phase < 4; phase++) pulseGarden(garden, []);
  visitResident(garden, "sol");
  const recognition = gardenReadback("garden-recognition", garden);

  const sheltered = initialGarden();
  const bank = sheltered.habitats.find((patch) => patch.id === "bank")!;
  Object.assign(bank, { shade: 0.85, shelter: 0.9 });
  const shelterReady = gardenReadback("garden-shelter-ready", sheltered);
  pulseGarden(sheltered, []);
  const relocated = gardenReadback("garden-relocated", sheltered);
  pulseGarden(sheltered, []);
  pulseGarden(sheltered, []);
  const gift = gardenReadback("garden-discovery", sheltered);
  pulseGarden(sheltered, []);
  const rainCycle = gardenReadback("garden-later-cycle", sheltered);
  return {
    opening,
    firstTap,
    repeatedTap,
    firstLinger,
    nextDay,
    recognition,
    shelterReady,
    relocated,
    gift,
    rainCycle,
  };
}

function realmReadback(id: string, world: Realm): RealmReadback {
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

function realmSnapshots() {
  const advance = (months: number, before?: (realm: Realm) => void) => {
    const world = initialGame().world;
    before?.(world);
    for (let index = 0; index < months; index++) settleRealmMonth(world, []);
    return world;
  };
  const ferry = (world: Realm) => {
    world.economy.routes.find((route) => route.id === "east-ferry")!.subsidy =
      5;
  };
  const crossing = (world: Realm) => {
    world.economy.routes.find(
      (route) => route.id === "east-crossing",
    )!.workers = 6;
  };
  return {
    initial: realmReadback("realm-initial", advance(0)),
    ordinaryFirst: realmReadback("realm-ordinary-first", advance(1)),
    ordinaryThird: realmReadback("realm-ordinary-third", advance(3)),
    ferryFirst: realmReadback("realm-ferry-first", advance(1, ferry)),
    ferryThird: realmReadback("realm-ferry-third", advance(3, ferry)),
    worksFirst: realmReadback("realm-works-first", advance(1, crossing)),
    worksSecond: realmReadback("realm-works-second", advance(2, crossing)),
    mobilized: realmReadback(
      "realm-mobilized",
      advance(1, (realm) => {
        realm.economy.forces[0]!.posture = "mobilized";
      }),
    ),
    treaty: realmReadback(
      "realm-treaty",
      advance(1, (realm) => {
        realm.economy.neighbors[0]!.treaty = "nonaggression";
      }),
    ),
    migration: realmReadback(
      "realm-migration",
      advance(1, (realm) => {
        realm.economy.regions[0]!.unrest = 90;
        for (const route of realm.economy.routes) route.condition = 1;
      }),
    ),
    borrowing: realmReadback(
      "realm-borrowing",
      advance(1, (realm) => {
        realm.economy.debt = 55;
      }),
    ),
    arrears: realmReadback(
      "realm-arrears",
      advance(1, (realm) => {
        realm.ledger.find((row) => row.id === "treasury")!.amount = 0;
        realm.economy.standingExpense = 60;
      }),
    ),
  };
}

export function captureExampleObservations() {
  return {
    adventure: adventureSnapshots(),
    garden: gardenSnapshots(),
    realm: realmSnapshots(),
  };
}
