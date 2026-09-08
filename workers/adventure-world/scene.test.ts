import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { createWorldAPI, initialWorld } from "@workspace/adventure-engine";
import { deadLetterOffice } from "@workspace/adventure-campaigns";
import { sceneSnapshot } from "./scene.js";

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
