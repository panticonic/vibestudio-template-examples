import { createWorldAPI, type Entity, type World, type View } from "@workspace/adventure-engine";

/** Authors opt physical component facts into both the scene brief and its freshness key. */
export function sceneSnapshot(world: World) {
  const observed = createWorldAPI(world, world.playerId).observe();
  const physical = (entity: Entity): Entity => ({
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    description: entity.description,
    location: entity.location,
    components: {
      open: entity.components.open,
      appearance: entity.components["appearance"],
      visualAnchors: entity.components["visualAnchors"],
      visual: Object.fromEntries(
        [...((entity.components["visualFields"] as string[] | undefined) ?? [])]
          .sort()
          .map((key) => [key, entity.components[key]])
      ),
    },
  });
  const view: View = {
    location: physical(observed.location),
    entities: observed.entities.map(physical).sort((a, b) => a.id.localeCompare(b.id)),
    inventory: observed.inventory.map(physical).sort((a, b) => a.id.localeCompare(b.id)),
    exits: observed.exits,
    events: [],
  };
  // Canonicalize nested authored facts too, so object key insertion order cannot request a repaint.
  const stable = (value: any): any =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, stable(value[key])])
          )
        : value;
  return { view, signature: JSON.stringify(stable({ view, artDirection: world.artDirection })) };
}
