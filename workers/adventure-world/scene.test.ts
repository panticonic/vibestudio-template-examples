import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { createWorldAPI, initialWorld } from "@workspace/adventure-engine";
import {
  deadLetterOffice,
  missingCountry,
} from "@workspace/adventure-campaigns";
import { sceneSnapshot, illustrationReferences } from "./scene.js";

it("selects identities by the visible cast and keeps portraits stable across clothing and location changes", () => {
  const world = initialWorld(missingCountry);
  const references = () =>
    illustrationReferences(sceneSnapshot(world).view, world.artDirection);
  const ada = references().find((ref) => ref.key === "person:ada")!;
  expect(ada.prompt).toContain("chestnut curls");
  expect(references().some((ref) => ref.key === "person:vesper")).toBe(false);
  world.entities.find((e) => e.id === world.playerId)!.location = "square";
  const vesper = references().find((ref) => ref.key === "person:vesper")!;
  expect(vesper.prompt).toContain("severe high bun");
  expect(references().some((ref) => ref.key === "person:ada")).toBe(false);
  const person = world.entities.find((e) => e.id === "ada")!;
  person.location = "square";
  person.description = "Ada has removed her coat and is holding an umbrella.";
  expect(references().find((ref) => ref.key === "person:ada")!.signature).toBe(
    ada.signature,
  );
  person.components.appearance += " Her hair is now silver.";
  expect(
    references().find((ref) => ref.key === "person:ada")!.signature,
  ).not.toBe(ada.signature);
  expect(references()[0]!.prompt).toContain("Absolutely no people");
});

it("shows visible physical connections to the painter and drops them when detached", () => {
  const world = initialWorld(deadLetterOffice);
  const hooks = Object.fromEntries(
    world.behaviors.map((b) => [
      b.id,
      runInNewContext(
        "(function(world, state, event, self) {" + b.code + "\n})",
      ),
    ]),
  );
  const api = createWorldAPI(world, world.playerId, false, hooks);
  api.transfer("oilskin-wrap", "landing");
  const before = sceneSnapshot(world);
  const cover = api.link("oilskin-wrap", "harbour-lamp", "covers");
  const covered = sceneSnapshot(world);
  expect(covered.view.relations).toEqual([cover]);
  expect(covered.signature).not.toBe(before.signature);
  // Institutional relationships and physical links outside the view stay out of the brief.
  world.relations.push({
    id: "private-arrangement",
    from: "elin",
    to: "sorting-cabinet",
    kind: "beside",
    data: { physical: true },
  });
  expect(sceneSnapshot(world).view.relations).toEqual([cover]);
  api.unlink(cover.id);
  expect(sceneSnapshot(world).view.relations).toEqual([]);
  expect(sceneSnapshot(world).signature).toBe(before.signature);
});
