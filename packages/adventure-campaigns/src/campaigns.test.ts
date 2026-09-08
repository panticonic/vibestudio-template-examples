import { describe, expect, it } from "@workspace/test-runtime";
import { initialWorld, createWorldAPI, validateWorld } from "@workspace/adventure-engine";
import { campaigns, deadLetterOffice, missingCountry, wanderingHouse } from "./index.js";

describe("authored adventures", () => {
  for (const campaign of campaigns) {
    it(`${campaign.id} begins with a coherent world and meaningful frontiers`, () => {
      const world = initialWorld(campaign);
      expect(validateWorld(world)).toBe(world);
      const view = createWorldAPI(world, world.playerId).observe();
      expect(view.location.kind).toBe("place");
      expect(Object.keys(view.exits).length).toBeGreaterThan(0);
      expect(world.entities.some((entity) => entity.components["frontier"])).toBe(true);
      expect(world.behaviors.length).toBeGreaterThan(0);
      for (const place of world.entities.filter((entity) => entity.kind === "place")) {
        for (const target of Object.values(place.components["exits"] ?? {})) {
          expect(world.entities.find((entity) => entity.id === target)?.kind).toBe("place");
        }
      }
      world.entities[0]!.name = "changed in a save";
      expect(campaign.entities[0]!.name).not.toBe("changed in a save");
    });
  }
  it("ties the postal mystery to physical custody and a reachable official", () => {
    const world = initialWorld(deadLetterOffice);
    expect(world.entities.find((e) => e.id === "permit")?.location).toBe("sorting-cabinet");
    expect(world.entities.find((e) => e.id === "mara-letter")?.location).toBe(world.playerId);
    expect(
      world.behaviors.some((b) => b.entityId === "sorting-cabinet" && b.trigger === "receive")
    ).toBe(true);
  });
  it("makes the opening window observable without exposing the customs office", () => {
    const world = initialWorld(deadLetterOffice);
    const api = createWorldAPI(world, world.playerId);
    expect(api.inspect("customs-window").description).toContain("You can meet her inside");
    expect(() => api.inspect("elin")).toThrow("perceive");
    expect(() => api.inspect("sorting-cabinet")).toThrow("perceive");
  });
  it("offers an executable insertion action and a deposit slot, without a false tide control", () => {
    const world = initialWorld(deadLetterOffice);
    const api = createWorldAPI(world, world.playerId);
    world.entities.find((entity) => entity.id === world.playerId)!.location = "customs";
    expect(api.inspect("sorting-cabinet").actions).toEqual(["Insert a letter"]);
    expect(api.inspect("sorting-cabinet").components.insertionSlot).toBe(true);
  });
  it("keeps diplomatic acceptance distinct from an offered promise", () => {
    const world = initialWorld(missingCountry);
    expect(world.entities.find((e) => e.id === "guest-book")?.components["entries"]).toEqual([]);
    expect(world.story.commitments.some((text) => text.includes("knowingly accept"))).toBe(true);
  });
  it("gives the hotel a persistent home and material for its first repair", () => {
    const world = initialWorld(wanderingHouse);
    expect(
      world.entities.find((e) => e.id === "guest-room")?.components["frontier"]
    ).toBeUndefined();
    expect(world.entities.find((e) => e.id === "teacup")?.components["material"]).toContain(
      "ceramic"
    );
    expect(world.entities.find((e) => e.id === "escapement")?.components["working"]).toBe(false);
  });
});
