import { describe, it, expect } from "@workspace/test-runtime";
import { initialWorld, createWorldAPI, validateWorld, type Campaign } from "./index.js";
const campaign: Campaign = {
  id: "test",
  title: "Test",
  subtitle: "",
  intro: "A beginning",
  artDirection: "ink",
  playerId: "player",
  story: { premise: "A mystery", arc: [], commitments: [] },
  entities: [
    {
      id: "hall",
      name: "Hall",
      kind: "place",
      description: "",
      components: { exits: { north: "road" } },
    },
    {
      id: "road",
      name: "Road",
      kind: "place",
      description: "",
      components: { frontier: true, exits: { south: "hall" } },
    },
    {
      id: "player",
      name: "You",
      kind: "person",
      description: "",
      location: "hall",
      components: {},
    },
    {
      id: "clerk",
      name: "Clerk",
      kind: "person",
      description: "",
      location: "hall",
      components: {
        memory: ["private"],
        knowledge: ["secret"],
        goals: ["leave"],
      },
    },
    {
      id: "box",
      name: "Box",
      kind: "object",
      description: "",
      location: "hall",
      components: { container: true, open: false },
    },
    {
      id: "letter",
      name: "Letter",
      kind: "object",
      description: "",
      location: "box",
      components: { portable: true, readable: "A secret", sealed: true },
    },
  ],
};
describe("composable adventure world", () => {
  it("keeps contents and participant knowledge private until observed", () => {
    const w = initialWorld(campaign),
      api = createWorldAPI(w, "player");
    expect(api.observe().entities.map((x) => x.id)).not.toContain("letter");
    expect(api.inspect("clerk").components.knowledge).toBeUndefined();
    expect(() => api.read("letter")).toThrow();
    api.open("box");
    api.take("letter");
    expect(() => api.read("letter")).toThrow("seal");
    api.open("letter");
    expect(api.read("letter")).toBe("A secret");
    expect(w.tick).toBe(3);
  });
  it("keeps sealed contents private in action results and projections detached", () => {
    const w = initialWorld(campaign),
      api = createWorldAPI(w, "player");
    api.open("box");
    expect(api.take("letter").components.readable).toBeUndefined();
    expect(api.give("letter", "clerk").components.readable).toBeUndefined();
    const view = api.observe();
    view.events[0]!.text = "rewritten";
    expect(w.journal[0]!.text).toBe("A beginning");
    const said = api.say("clerk", "Hello");
    said.text = "rewritten";
    expect(w.journal.at(-1)!.text).toBe("You: Hello");
  });
  it("communicates only to present recipients and remembers concrete speech", () => {
    const w = initialWorld(campaign),
      api = createWorldAPI(w, "player");
    api.say("clerk", "Who posted this?");
    expect(w.entities.find((e) => e.id === "clerk")!.components.memory).toContain(
      "The traveller said: Who posted this?"
    );
    expect(api.observe().events.at(-1)?.audience).toEqual(["player", "clerk"]);
  });
  it("requires a builder for the frontier and maintains known routes", () => {
    const w = initialWorld(campaign),
      api = createWorldAPI(w, "player");
    expect(() => api.move("road")).toThrow("FRONTIER");
    w.entities.find((e) => e.id === "road")!.components.frontier = false;
    api.move("road");
    expect(api.observe().location.id).toBe("road");
    expect(() => api.inspect("clerk")).toThrow("perceive");
  });
  it("executes composable stateful behavior and scheduled offscreen events once", () => {
    const w = initialWorld(campaign);
    w.behaviors = [
      { id: "clock", entityId: "box", trigger: "tick", code: "", state: {} },
      { id: "bell", entityId: "box", trigger: "ring", code: "", state: {} },
    ];
    let ticks = 0;
    const api = createWorldAPI(w, "player", true, {
      clock: () => ticks++,
      bell: (world: any) => world.patch("box", { description: "The bell rang" }),
    });
    (api as any).schedule({
      id: "bell",
      at: 2,
      entityId: "box",
      trigger: "ring",
    });
    api.wait(3);
    expect(ticks).toBe(3);
    expect(api.inspect("box").description).toBe("The bell rang");
    expect(w.schedule).toEqual([]);
  });
  it("keeps offscreen actions and scheduled machinery with their actual witnesses", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "clerk")!.location = "road";
    w.entities.find((e) => e.id === "letter")!.location = "road";
    const player = createWorldAPI(w, "player"),
      clerk = createWorldAPI(w, "clerk");
    clerk.take("letter");
    expect(player.observe().events.some((e) => e.text.includes("takes Letter"))).toBe(false);
    w.behaviors.push({
      id: "remote-bell",
      entityId: "road",
      trigger: "tick",
      code: "",
      state: {},
    });
    const ticking = createWorldAPI(w, "player", false, {
      "remote-bell": (api: any) => api.emit("The far bell rings."),
    });
    ticking.wait(1);
    expect(ticking.observe().events.some((e) => e.text === "The far bell rings.")).toBe(false);
    expect(clerk.observe().events.some((e) => e.text === "The far bell rings.")).toBe(true);
  });
  it("shows departures and arrivals to their own witnesses without leaking later remote speech", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "road")!.components.frontier = false;
    w.entities.push({
      id: "visitor",
      name: "Visitor",
      kind: "person",
      location: "road",
      description: "",
      components: {},
    });
    const player = createWorldAPI(w, "player"),
      clerk = createWorldAPI(w, "clerk"),
      visitor = createWorldAPI(w, "visitor");
    player.say("clerk", "See you later");
    const before = w.tick;
    clerk.move("road");
    expect(w.tick).toBe(before + 1);
    expect(player.observe().events.some((e) => e.text === "Clerk leaves Hall")).toBe(true);
    expect(player.observe().events.some((e) => e.text === "Clerk arrives at Road")).toBe(false);
    expect(visitor.observe().events.some((e) => e.text === "Clerk arrives at Road")).toBe(true);
    expect(visitor.observe().events.some((e) => e.text === "Clerk leaves Hall")).toBe(false);
    expect(visitor.observe().events.some((e) => e.text.includes("See you later"))).toBe(false);
    expect(clerk.observe().events.some((e) => e.text === "Clerk leaves Hall")).toBe(false);
    clerk.say("visitor", "A private conversation along the road");
    expect(player.observe().events.some((e) => e.text.includes("private conversation"))).toBe(
      false
    );
  });
  it("supports deposits through a slot without exposing or extracting closed contents", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "box")!.components.insertionSlot = true;
    w.entities.find((e) => e.id === "letter")!.location = "player";
    const api = createWorldAPI(w, "player");
    api.give("letter", "box");
    expect(w.entities.find((e) => e.id === "letter")!.location).toBe("box");
    expect(api.observe().entities.map((e) => e.id)).not.toContain("letter");
    expect(() => api.take("letter")).toThrow("perceive");
    expect(api.inspect("box").components.open).toBe(false);
  });
  it("advertises executable behaviors only and charges composed actions once", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "box")!.actions = ["Imaginary action"];
    w.behaviors.push({
      id: "open-box",
      entityId: "box",
      trigger: "Unlatch",
      code: "",
      state: {},
    });
    const api = createWorldAPI(w, "player", false, {
      "open-box": (world: any) => world.open("box"),
    });
    expect(api.inspect("box").actions).toEqual(["Unlatch"]);
    api.act("box", "Unlatch");
    expect(w.tick).toBe(1);
  });
  it("identifies the player by role in NPC views, memories and speech without leaking knowledge", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "player")!.components.roleName = "The courier";
    const player = createWorldAPI(w, "player"),
      npc = createWorldAPI(w, "clerk");
    player.say("clerk", "Hello");
    expect(npc.inspect("player").name).toBe("The courier");
    expect(npc.recall()).toContain("The courier said: Hello");
    expect(npc.observe().events.at(-1)!.text).toBe("The courier: Hello");
    expect(player.observe().events.at(-1)!.text).toBe("You: Hello");
  });
  it("rejects broken references and containment cycles", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "box")!.location = "letter";
    expect(() => validateWorld(w)).toThrow("cycle");
  });
});
