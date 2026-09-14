import { createWorldAPI, type View, type Entity, type World, type Relation } from "./index.js";
export type BundledArtwork = { people: Record<string, string>; places: Record<string, string>; opening: string };
/** Reference subjects are identities, never an incidental cast in a finished scene. */
export function illustrationReferences(view: View, artDirection: string) {
  const subjects = [
    view.location,
    ...view.entities.filter((e) => e.kind === "person"),
  ];
  return subjects.map((entity) => {
    const portrait = entity.kind === "person";
    const identity = portrait
      ? (entity.components.appearance ?? entity.description)
      : {
          description: entity.description,
          anchors: entity.components.visualAnchors ?? [],
        };
    return {
      key: `${portrait ? "person" : "place"}:${entity.id}`,
      name: entity.name,
      kind: portrait ? ("portrait" as const) : ("place" as const),
      signature: JSON.stringify({ artDirection, id: entity.id, identity }),
      prompt: `${artDirection}\n\n${
        portrait
          ? `Canonical portrait of ${entity.name} (entity ${entity.id}). Identity: ${JSON.stringify(identity)}. Show this one person's distinctive face, hair and build clearly, in a neutral pose against a plain background. No other people, location, carried objects or lettering. This portrait establishes identity; clothing and actions may change in later scenes.`
          : `Architectural reference for ${entity.name} (place ${entity.id}). ${JSON.stringify(identity)}. Paint the empty place and its enduring architecture only. Absolutely no people, faces, portraits, human silhouettes or carried belongings, even if the description mentions them. No lettering. This plate will supply geography, never a cast.`
      }`,
    };
  });
}
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
      effectiveLight: entity.components["effectiveLight"],
      appearance: entity.components["appearance"],
      visualAnchors: entity.components["visualAnchors"],
      visual: Object.fromEntries(
        [...((entity.components["visualFields"] as string[] | undefined) ?? [])]
          .sort()
          .map((key) => [key, entity.components[key]]),
      ),
    },
  });
  const visibleIds = new Set([
    observed.location.id,
    ...observed.entities.map((e) => e.id),
    ...observed.inventory.map((e) => e.id),
  ]);
  const view: View & { relations: Relation[] } = {
    relations: structuredClone(
      world.relations.filter(
        (r) =>
          r.data?.["physical"] === true &&
          visibleIds.has(r.from) &&
          visibleIds.has(r.to),
      ),
    ).sort((a, b) => a.id.localeCompare(b.id)),
    location: physical(observed.location),
    entities: observed.entities
      .map(physical)
      .sort((a, b) => a.id.localeCompare(b.id)),
    inventory: observed.inventory
      .map(physical)
      .sort((a, b) => a.id.localeCompare(b.id)),
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
              .map((key) => [key, stable(value[key])]),
          )
        : value;
  return {
    view,
    artDirection: world.artDirection,
    signature: JSON.stringify(
      stable({
        view,
        artDirection: world.artDirection,
        references: illustrationReferences(view, world.artDirection).map(({ key, signature }) => ({ key, signature })),
      }),
    ),
  };
}
