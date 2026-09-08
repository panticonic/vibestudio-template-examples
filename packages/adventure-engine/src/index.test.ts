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
      components: { memory: ["private"], knowledge: ["secret"], goals: ["leave"] },
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
      "You said: Who posted this?"
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
    (api as any).schedule({ id: "bell", at: 2, entityId: "box", trigger: "ring" });
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
    w.behaviors.push({ id: "remote-bell", entityId: "road", trigger: "tick", code: "", state: {} });
    const ticking = createWorldAPI(w, "player", false, {
      "remote-bell": (api: any) => api.emit("The far bell rings."),
    });
    ticking.wait(1);
    expect(ticking.observe().events.some((e) => e.text === "The far bell rings.")).toBe(false);
    expect(clerk.observe().events.some((e) => e.text === "The far bell rings.")).toBe(true);
  });
  it("rejects broken references and containment cycles", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "box")!.location = "letter";
    expect(() => validateWorld(w)).toThrow("cycle");
  });
});
