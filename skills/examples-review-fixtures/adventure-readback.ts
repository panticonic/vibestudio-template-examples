import { createHash } from "node:crypto";
import type { Entity, View } from "@workspace/adventure-engine";
import type {
  AdventureObject,
  AdventureView,
} from "../examples-review/types.js";

export const sceneDigest = (signature: string) =>
  createHash("sha256").update(signature).digest("hex");
const flag = (value: unknown) => (typeof value === "boolean" ? value : null);

export function adventureReadback(
  id: string,
  view: View,
  tick: number,
  signature: string,
): AdventureView {
  const entity = (item: Entity): AdventureObject => ({
    id: item.id,
    location: item.location ?? null,
    kind: item.kind,
    open: flag(item.components.open),
    sealed: flag(item.components.sealed),
    locked: flag(item.components.locked),
  });
  return {
    id,
    place: view.location.id,
    tick,
    entities: [...view.entities, ...view.inventory].map(entity),
    inventory: view.inventory.map((item) => item.id),
    exits: Object.values(view.exits),
    signature: sceneDigest(signature),
  };
}
