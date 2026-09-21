import { describe, expect, it } from "@workspace/test-runtime";
import { initialWorld, createWorldAPI, validateWorld } from "@workspace/adventure-engine";
import {
  campaigns,
  deadLetterOffice,
  missingCountry,
  wanderingHouse,
  postalPrograms,
} from "./index.js";

function postalWorld() {
  const world = initialWorld(deadLetterOffice);
  const hooks = {
    "customs-window-presence": postalPrograms.window,
    "harbour-tide": postalPrograms.tide,
    "cabinet-insertion": postalPrograms.insert,
    "cabinet-delivery": postalPrograms.route,
    "authority-inspection-elin": postalPrograms.inspectAuthority,
    "authority-inspection-tomas": postalPrograms.inspectAuthority,
  };
  return { world, api: createWorldAPI(world, world.playerId, false, hooks), hooks };
}

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
    expect(world.entities.find((e) => e.id === "permit")?.location).toBe("salt-street-drawer");
    expect(world.entities.find((e) => e.id === "salt-street-drawer")?.location).toBe(
      "sorting-cabinet"
    );
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
    expect(api.inspect("sorting-cabinet").components.insertionSlot).toEqual({ maxVolume: 1 });
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

  for (const letterId of ["mara-letter", "salt-street-circular"]) {
    it(`routes ${letterId} by its address and clears the same lawful passage`, () => {
      const { world, api, hooks } = postalWorld();
      api.move("customs");
      expect(() => api.inspect("permit")).toThrow("perceive");
      api.transfer(letterId, "sorting-cabinet");
      expect(api.inspect(letterId).location).toBe("salt-street-drawer");
      expect(api.inspect("permit").location).toBe("salt-street-drawer");
      expect(world.relations.find((r) => r.id === "permit-authority")?.data?.["valid"]).toBe(true);
      api.take("permit");
      api.move("landing");
      api.move("quay");
      api.give("permit", "tomas");
      expect(api.inspect("ferry").components.locked).toBe(false);
      const restored = JSON.parse(JSON.stringify(world));
      expect(validateWorld(restored)).toBe(restored);
      const resumed = createWorldAPI(restored, restored.playerId, false, hooks);
      expect(resumed.inspect("ferry").components.locked).toBe(false);
      expect(restored.behaviors.map((b: { code: string }) => b.code)).toEqual(
        world.behaviors.map((b) => b.code)
      );
    });
  }

  it("accepts a newly addressed postcard without new behavior or a builder", () => {
    const { world, api } = postalWorld();
    const originalCode = world.behaviors.map((behavior) => behavior.code);
    api.move("customs");
    api.setComponent("blank-postcard", "addressee", "  Salt Street Ferry Office  ");
    api.transfer("blank-postcard", "sorting-cabinet");
    expect(api.inspect("permit").location).toBe("salt-street-drawer");
    expect(
      world.relations.find(
        (relation) => relation.from === "blank-postcard" && relation.kind === "postal-route"
      )?.to
    ).toBe("drowned-quarter");
    expect(world.behaviors.map((behavior) => behavior.code)).toEqual(originalCode);
  });

  it("does not treat every addressed object as the same cabinet reward", () => {
    const { world, api } = postalWorld();
    api.move("customs");
    api.setComponent("blank-postcard", "addressee", "Elin Vale");
    api.transfer("blank-postcard", "sorting-cabinet");
    expect(api.inspect("blank-postcard").location).toBe("current-post-drawer");
    expect(() => api.inspect("permit")).toThrow("perceive");
    expect(world.relations.find((r) => r.id === "permit-authority")?.data?.["valid"]).toBe(false);
    api.take("blank-postcard");
    api.setComponent("blank-postcard", "addressee", "An unlisted stranger");
    api.transfer("blank-postcard", "sorting-cabinet");
    expect(api.inspect("blank-postcard").location).toBe("sorting-cabinet");
    expect(() => api.inspect("permit")).toThrow("perceive");
  });

  for (const inspector of ["elin", "tomas"]) {
    it(`lets ${inspector} recognize another valid document through the same authority relation`, () => {
      const { world, api } = postalWorld();
      api.move("customs");
      api.take("relief-warrant");
      if (inspector === "tomas") {
        api.move("landing");
        api.move("quay");
      }
      api.give("relief-warrant", inspector);
      expect(world.entities.find((entity) => entity.id === "ferry")?.components.locked).toBe(false);
      expect(
        world.relations.some(
          (relation) =>
            relation.kind === "recognized-authority" &&
            relation.from === inspector &&
            relation.to === "relief-warrant"
        )
      ).toBe(true);
      expect(world.entities.find((entity) => entity.id === "permit")?.location).toBe(
        "salt-street-drawer"
      );
    });
  }

  it("does not mistake a physical connection for an official authorization", () => {
    const { world, api } = postalWorld();
    api.move("customs");
    api.take("blank-postcard");
    api.setComponent("blank-postcard", "document", true);
    api.move("landing");
    api.move("quay");
    api.link("blank-postcard", "ferry", "authorizes", {
      issuer: "elin",
      beneficiary: "tomas",
      permission: "navigate",
      destination: "drowned-quarter",
      valid: true,
    });
    api.give("blank-postcard", "tomas");
    expect(world.entities.find((entity) => entity.id === "ferry")?.components.locked).toBe(true);
  });

  for (const cover of ["oilskin-wrap", "canvas-cover"]) {
    it(`blocks the harbour light with ${cover} through ordinary transfer and relation mechanics`, () => {
      const { world, api } = postalWorld();
      expect(api.inspect("harbour-lamp").components["effectiveLight"]).toBe(true);
      api.transfer(cover, "landing");
      const relation = api.link(cover, "harbour-lamp", "covers");
      expect(api.inspect("harbour-lamp").components["effectiveLight"]).toBe(false);
      expect(
        world.behaviors.some(
          (behavior) => behavior.entityId === cover || behavior.entityId === "harbour-lamp"
        )
      ).toBe(false);
      api.unlink(relation.id);
      expect(api.inspect("harbour-lamp").components["effectiveLight"]).toBe(true);
    });
  }
});
