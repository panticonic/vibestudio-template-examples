import type { Garden } from "@workspace/grimoire-engine";
import type { GardenReadback } from "../examples-review/types.js";

export function gardenReadback(id: string, garden: Garden): GardenReadback {
  return {
    id,
    day: garden.day,
    phase: garden.phase,
    weather: garden.weather,
    homes: garden.habitats.map(
      ({ id, water, shade, bloom, shelter, traits }) => ({
        id,
        values: Object.entries({
          ...traits,
          water,
          shade,
          bloom,
          shelter,
        }).flatMap(([key, amount]) =>
          typeof amount === "number" ? [{ key, amount }] : [],
        ),
      }),
    ),
    residents: garden.residents.map(
      ({ id, name, home, needs, energy, attachment, settled, lastVisit }) => ({
        id,
        name,
        home,
        needs: Object.entries(needs).map(([key, amount]) => ({ key, amount })),
        energy,
        attachment,
        settled,
        lastVisit,
      }),
    ),
    discoveries: garden.discoveries.map(({ id, title }) => ({ id, title })),
  };
}
