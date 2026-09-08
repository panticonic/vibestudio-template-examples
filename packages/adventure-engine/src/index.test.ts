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
  it("composes unscripted JSON edits, transfers and physical links while preserving private state", () => {
    const w = initialWorld(campaign);
    w.entities.push(
      {
        id: "cloth",
        name: "Cloth",
        kind: "object",
        location: "hall",
        description: "",
        components: { portable: true, opaque: true },
      },
      {
        id: "lamp",
        name: "Lamp",
        kind: "object",
        location: "hall",
        description: "",
        components: { light: true },
      }
    );
    const api = createWorldAPI(w, "player");
    api.setComponent("hall", "decoration", { ribbons: ["blue", "gold"] });
    expect(api.getComponent("hall", "decoration")).toEqual({ ribbons: ["blue", "gold"] });
    const decoration = api.getComponent("hall", "decoration");
    decoration.ribbons.push("red");
    expect(api.getComponent("hall", "decoration").ribbons).toHaveLength(2);
    const opaque = api.observe().entities.find((e) => e.components.opaque)!;
    api.transfer(opaque.id, "player");
    api.transfer(opaque.id, "hall");
    const cover = api.link(opaque.id, "lamp", "covers");
    expect(api.inspect("lamp").components.effectiveLight).toBe(false);
    api.unlink(cover.id);
    expect(api.inspect("lamp").components.effectiveLight).toBe(true);
    const marker = api.link("cloth", "lamp", "points-toward", { angle: 45 });
    expect(marker.data).toEqual({ angle: 45, physical: true });
    expect(() => api.setComponent("clerk", "knowledge", ["Forged knowledge"])).toThrow("mechanism");
    expect(() => api.setComponent("hall", "exits", { shortcut: "road" })).toThrow("mechanism");
    expect(() => api.getComponent("letter", "readable")).toThrow("perceive");
    expect(api.getComponent("clerk", "knowledge")).toBeUndefined();
  });
  it("applies shared capacity and slot geometry to direct transfers and convenience verbs", () => {
    const w = initialWorld(campaign);
    const box = w.entities.find((e) => e.id === "box")!;
    box.components.capacity = 1;
    box.components.insertionSlot = { maxVolume: 0.5 };
    w.entities.find((e) => e.id === "letter")!.location = "player";
    const api = createWorldAPI(w, "player");
    expect(() => api.give("letter", "box")).toThrow("slot");
    api.setComponent("letter", "volume", 0.5);
    api.transfer("letter", "box");
    expect(() => api.take("letter")).toThrow("perceive");
    w.entities.push({
      id: "parcel",
      name: "Parcel",
      kind: "object",
      location: "player",
      description: "",
      components: { portable: true, volume: 0.75 },
    });
    api.open("box");
    expect(() => api.transfer("parcel", "box")).toThrow("capacity");
    expect(w.entities.find((e) => e.id === "parcel")!.location).toBe("player");
    expect(() => api.transfer("box", "box")).toThrow();
  });
  it("lets authored change and link hooks own causal constraints", () => {
    const w = initialWorld(campaign);
    w.behaviors.push(
      { id: "dial", entityId: "box", trigger: "change", code: "", state: {} },
      { id: "attachment", entityId: "box", trigger: "link", code: "", state: {} }
    );
    const api = createWorldAPI(w, "player", false, {
      dial: (world: any, _state: any, event: any) => {
        if (event.key === "angle") world.emit("The dial turns to " + event.value);
      },
      attachment: (_world: any, _state: any, event: any) => {
        if (event.relation.kind === "balances-on")
          throw new Error("The lid cannot bear that weight");
      },
    });
    api.setComponent("box", "angle", 45);
    expect(api.observe().events.some((e) => e.text === "The dial turns to 45")).toBe(true);
    expect(() => api.link("player", "box", "balances-on")).toThrow("weight");
    expect(w.relations).toEqual([]);
    expect(api.inspect("box").actions).toEqual([]);
  });
  it("uses the same lock, seal and opening consequences through components and convenience verbs", () => {
    const w = initialWorld(campaign);
    const box = w.entities.find((e) => e.id === "box")!;
    box.components.locked = true;
    w.behaviors.push({ id: "opened", entityId: "box", trigger: "open", code: "", state: {} });
    let openings = 0;
    const api = createWorldAPI(w, "player", false, { opened: () => openings++ });
    expect(() => api.setComponent("box", "open", true)).toThrow("locked");
    expect(box.components.open).toBe(false);
    expect(w.tick).toBe(0);
    api.setComponent("box", "locked", false);
    api.setComponent("box", "open", true);
    expect(openings).toBe(1);
    expect(w.tick).toBe(2);
    api.setComponent("box", "open", false);
    api.open("box");
    expect(openings).toBe(2);
    expect(w.tick).toBe(4);
    expect(api.inspect("letter").components.readable).toBeUndefined();
    api.setComponent("letter", "open", true);
    expect(api.read("letter")).toBe("A secret");
    expect(w.tick).toBe(5);
  });
  it("rejects invalid capacity and inlet measurements when applying transfers", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "letter")!.location = "player";
    const api = createWorldAPI(w, "player");
    api.open("box");
    for (const capacity of [-1, NaN, null]) {
      api.setComponent("box", "capacity", capacity);
      expect(() => api.transfer("letter", "box")).toThrow("capacity is invalid");
      expect(w.entities.find((e) => e.id === "letter")!.location).toBe("player");
    }
    api.setComponent("box", "capacity", 2);
    api.setComponent("box", "open", false);
    api.setComponent("box", "insertionSlot", { maxVolume: -1 });
    expect(() => api.transfer("letter", "box")).toThrow("Slot volume is invalid");
  });
  it("distinguishes ordinary action refusals from missing mechanisms and engine defects", () => {
    const w = initialWorld(campaign);
    w.entities.push(
      {
        id: "cloth",
        name: "Cloth",
        kind: "object",
        location: "player",
        description: "",
        components: { opaque: true, portable: true },
      },
      {
        id: "lamp",
        name: "Lamp",
        kind: "object",
        location: "hall",
        description: "",
        components: { light: true },
      }
    );
    const api = createWorldAPI(w, "player");
    const refused = (action: () => unknown) => {
      try {
        action();
        throw new Error("Expected a refusal");
      } catch (error) {
        expect(error).toMatchObject({ name: "WorldActionError", code: "WORLD_ACTION_REFUSED" });
      }
    };
    refused(() => api.inspect("unknown-id"));
    refused(() => api.give("unknown-id", "clerk"));
    refused(() => api.take("letter"));
    refused(() => api.link("cloth", "lamp", "covers"));
    refused(() => api.wait(-1));
    expect(w.tick).toBe(0);
    expect(() => api.move("road")).toThrow("FRONTIER:");
    try {
      api.move("road");
    } catch (error) {
      expect((error as Error).name).toBe("Error");
      expect((error as Error).message).toContain("FRONTIER:");
    }
    w.behaviors.push({ id: "missing-hook", entityId: "box", trigger: "turn", code: "", state: {} });
    expect(() => api.act("box", "turn")).toThrow("Behavior is unavailable");
    try {
      api.act("box", "turn");
    } catch (error) {
      expect((error as Error).name).toBe("Error");
      expect((error as Error).message).toContain("Behavior is unavailable");
    }
    const privileged = createWorldAPI(w, "player", true);
    expect(() => (privileged as any).entity("missing-internal-reference")).toThrow(
      "Unknown entity"
    );
    try {
      (privileged as any).entity("missing-internal-reference");
    } catch (error) {
      expect((error as Error).name).toBe("Error");
    }
  });
  it("rejects broken references and containment cycles", () => {
    const w = initialWorld(campaign);
    w.entities.find((e) => e.id === "box")!.location = "letter";
    expect(() => validateWorld(w)).toThrow("cycle");
  });
});
