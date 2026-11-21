import { validateScene, sceneDocument } from "@workspace/living-canvas";
import { gardenOwner } from "./live-garden.js";

/** The same installed owner that serves StoryClient. No agent is seated for a scene draft. */
export function openOwnedGrimoireScene(id: string) {
  if (!/^natlang-scene-[a-f0-9-]{36}$/u.test(id))
    throw new Error("Expected one assigned caretaker garden");
  const owner = gardenOwner(id);
  return {
    read: () => owner.call("getGame"),
    catalog: () => owner.call("artCatalog"),
  };
}

export const grimoireSceneInstalled = {
  owner: openOwnedGrimoireScene,
  validateScene,
  sceneDocument,
};
