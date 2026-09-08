import { runInNewContext } from "node:vm";
import { it, expect } from "vitest";
import { initialWorld, createWorldAPI, type Campaign } from "@workspace/adventure-engine";
import { simulationSource } from "./evaluate.js";
const campaign: Campaign = {
  id: "test",
  title: "Test",
  subtitle: "",
  intro: "Begin",
  artDirection: "ink",
  playerId: "player",
  story: { premise: "", arc: [], commitments: [] },
  entities: [
    { id: "room", name: "Room", kind: "place", description: "", components: {} },
    {
      id: "player",
      name: "You",
      kind: "person",
      description: "",
      location: "room",
      components: {},
    },
    {
      id: "clock",
      name: "Clock",
      kind: "object",
      description: "",
      location: "room",
      components: {},
    },
  ],
  behaviors: [
    {
      id: "clockwork",
      entityId: "clock",
      trigger: "wind",
      state: { turns: 0 },
      code: 'state.turns++; world.patch(self.id,{description:"Running"}); world.emit("The clock wakes.");',
    },
  ],
};
async function run(code: string) {
  const world = initialWorld(campaign),
    scope: any = {};
  await runInNewContext(
    `(async()=>{${simulationSource(world, "player", code)}})()`,
    { scope, structuredClone },
    { timeout: 100 }
  );
  return JSON.parse(scope.output);
}
it("runs bespoke behavior through the same finite-eval source as production", async () => {
  const result = await run('world.act("clock","wind"); return world.inspect("clock").description');
  expect(result.result).toBe("Running");
  expect(createWorldAPI(result.world, "player").inspect("clock").actions).toContain("wind");
  expect(result.world.behaviors[0].state.turns).toBe(1);
  expect(result.world.tick).toBe(1);
});
it("keeps engine state outside the player code lexical scope", async () => {
  await expect(run("state.entities=[]")).rejects.toThrow("state is not defined");
  expect((await run("return typeof world.patch")).result).toBe("undefined");
});
it("rejects code that escapes a function body", () => {
  expect(() =>
    simulationSource(initialWorld(campaign), "player", "}; const stolen=1; async function b(){")
  ).toThrow();
});

import { deadLetterOffice, missingCountry, wanderingHouse } from "@workspace/adventure-campaigns";
async function runCampaign(campaign: Campaign, code: string) {
  const world = initialWorld(campaign),
    scope: any = {};
  await runInNewContext(
    `(async()=>{${simulationSource(world, world.playerId, code)}})()`,
    { scope, structuredClone },
    { timeout: 100 }
  );
  return JSON.parse(scope.output);
}
it("executes the postal cabinet and ferry release as causal authored behaviors", async () => {
  const result = await runCampaign(
    deadLetterOffice,
    'world.move("customs");world.open("sorting-cabinet");world.give("mara-letter","sorting-cabinet");world.take("permit");world.move("landing");world.move("quay");world.give("permit","tomas");return world.observe();'
  );
  expect(result.world.entities.find((e: any) => e.id === "ferry").components.locked).toBe(false);
  expect(result.world.entities.find((e: any) => e.id === "mara-letter").location).toBe(
    "sorting-cabinet"
  );
  expect(result.world.relations.some((r: any) => r.kind === "postal-route")).toBe(true);
  expect(result.world.relations.some((r: any) => r.kind === "promised-passage")).toBe(true);
});
it("offers asylum without inventing a refugees consent", async () => {
  const result = await runCampaign(
    missingCountry,
    'world.act("guest-book","Offer asylum",{guestId:"ada"});return world.relations();'
  );
  const offer = result.world.relations.find((r: any) => r.kind === "offered-asylum");
  expect(offer.to).toBe("ada");
  expect(offer.data.accepted).toBe(false);
});
it("repairs the houses mechanism using carried ceramic and brings it to rest", async () => {
  const result = await runCampaign(
    wanderingHouse,
    'world.move("conservatory");world.take("teacup");world.move("lobby");world.move("engine-room");world.act("escapement","Fit a replacement bearing",{itemId:"teacup"});world.move("lobby");world.act("arrival-bell","Ring to stop the house");return world.observe();'
  );
  expect(result.world.entities.find((e: any) => e.id === "escapement").components.working).toBe(
    true
  );
  expect(result.world.entities.find((e: any) => e.id === "teacup").location).toBe("escapement");
  expect(result.world.entities.find((e: any) => e.id === "lobby").components.moving).toBe(false);
  expect(result.world.entities.find((e: any) => e.id === "route-table").components.moving).toBe(
    false
  );
});

it("moves the hotel between real stops, closes transit routes, and preserves cabins and revisited places", async () => {
  const c = structuredClone(wanderingHouse);
  for (const place of c.entities.filter((e) => ["outside", "saltglass"].includes(e.id)))
    place.components.frontier = false;
  c.entities.push({
    id: "cabin-note",
    name: "A note left in the cabin",
    kind: "object",
    description: "A pencilled promise.",
    location: "guest-room",
    components: { readable: "Still here when you return.", portable: true },
  });
  const step = async (world: ReturnType<typeof initialWorld>, actorId: string, code: string) => {
    const scope: any = {};
    await runInNewContext(
      `(async()=>{${simulationSource(world, actorId, code)}})()`,
      { scope, structuredClone },
      { timeout: 100 }
    );
    return JSON.parse(scope.output);
  };
  let world = initialWorld(c);
  await expect(step(world, "guest", 'world.move("outside")')).rejects.toThrow("no known route");
  world = (
    await step(
      world,
      "guest",
      'world.move("conservatory");world.take("teacup");world.move("lobby");world.move("engine-room");world.act("escapement","Fit a replacement bearing",{itemId:"teacup"});world.move("lobby");world.act("arrival-bell","Ring to stop the house");'
    )
  ).world;
  expect(world.entities.find((e: any) => e.id === "house")!.location).toBe("outside");
  world = (
    await step(
      world,
      "guest",
      'world.act("route-table","Choose a destination",{destination:"saltglass"});return world.observe();'
    )
  ).world;
  expect(world.entities.find((e: any) => e.id === "lobby")!.components.exits!["Front steps"]).toBe(
    "outside"
  );
  world = (await step(world, "guest", 'world.act("route-table","Turn the route key");')).world;
  expect(
    world.entities.find((e: any) => e.id === "outside")!.components.exits!["Hotel steps"]
  ).toBeUndefined();
  await expect(step(world, "guest", 'world.move("outside")')).rejects.toThrow("no known route");
  world = (
    await step(
      world,
      "guest",
      'world.act("arrival-bell","Ring to stop the house");world.move("saltglass");world.move("lobby");world.act("route-table","Choose a destination",{destination:"outside"});world.act("route-table","Turn the route key");world.act("arrival-bell","Ring to stop the house");world.move("outside");world.move("lobby");world.move("guest-room");return world.read("cabin-note");'
    )
  ).world;
  expect(world.entities.find((e: any) => e.id === "house")!.location).toBe("outside");
  expect(
    world.entities.find((e: any) => e.id === "saltglass")!.components.exits!["Hotel steps"]
  ).toBeUndefined();
  expect(
    world.entities.find((e: any) => e.id === "outside")!.components.exits!["Hotel steps"]
  ).toBe("lobby");
  expect(world.entities.find((e: any) => e.id === "cabin-note")!.location).toBe("guest-room");
  expect(world.entities.find((e: any) => e.id === "teacup")!.location).toBe("escapement");
  expect(world.entities.filter((e: any) => e.id === "outside")).toHaveLength(1);
  // Giving the route key to a resident never authorizes leaving the player ashore.
  world = (
    await step(
      world,
      "guest",
      'world.move("lobby");world.give("route-key","porter");world.move("outside");'
    )
  ).world;
  await expect(
    step(world, "porter", 'world.act("route-table","Turn the route key")')
  ).rejects.toThrow("still ashore");
  expect(world.entities.find((e: any) => e.id === "lobby")!.components.exits!["Front steps"]).toBe(
    "outside"
  );
});
