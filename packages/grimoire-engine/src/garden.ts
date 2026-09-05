import { z } from "zod";
const word = z.string().min(1).max(80),
  unit = z.number().min(0).max(1),
  traits = z.record(
    z.union([z.number().finite(), z.string().max(400), z.boolean()]),
  );
export const GardenSchema = z
  .object({
    day: z.number().int().min(1),
    phase: z.number().int().min(0).max(3),
    weather: word,
    habitats: z
      .array(
        z
          .object({
            id: word,
            name: word,
            x: z.number(),
            y: z.number(),
            water: unit,
            shade: unit,
            bloom: unit,
            shelter: unit,
            traits,
          })
          .strict(),
      )
      .min(1)
      .max(24),
    residents: z
      .array(
        z
          .object({
            id: word,
            name: word,
            form: word,
            home: word,
            x: z.number(),
            y: z.number(),
            needs: z.record(unit),
            energy: unit,
            attachment: unit,
            activity: z.string().max(300),
            settled: z.number().int().min(0),
            lastVisit: z.number().int(),
            traits,
          })
          .strict(),
      )
      .max(24),
    discoveries: z
      .array(
        z
          .object({
            id: word,
            title: word,
            text: z.string().max(400),
            day: z.number(),
            x: z.number(),
            y: z.number(),
          })
          .strict(),
      )
      .max(40),
    traces: z.array(z.string().max(400)).max(12),
    rules: z
      .array(
        z
          .object({
            id: word,
            title: word,
            code: z.string().max(16000),
            state: z.record(z.unknown()),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();
export type Garden = z.infer<typeof GardenSchema>;
export function initialGarden(): Garden {
  return {
    day: 1,
    phase: 2,
    weather: "a mild evening",
    habitats: [
      {
        id: "hollow",
        name: "The old tree hollow",
        x: 440,
        y: 480,
        water: 0.3,
        shade: 0.8,
        bloom: 0.15,
        shelter: 0.65,
        traits: { moss: true },
      },
      {
        id: "bank",
        name: "The stream bank",
        x: 745,
        y: 555,
        water: 0.85,
        shade: 0.3,
        bloom: 0.35,
        shelter: 0.15,
        traits: { runningWater: true },
      },
      {
        id: "meadow",
        name: "The moonflower patch",
        x: 550,
        y: 615,
        water: 0.4,
        shade: 0.2,
        bloom: 0.5,
        shelter: 0.3,
        traits: { moonflowers: true },
      },
    ],
    residents: [
      {
        id: "sol",
        name: "Sol",
        form: "lantern snail",
        home: "hollow",
        x: 446,
        y: 510,
        needs: { water: 0.7, shade: 0.8, shelter: 0.7 },
        energy: 0.6,
        attachment: 0.05,
        activity: "peering out of the hollow, wishing the moss were damp",
        settled: 0,
        lastVisit: -1,
        traits: {
          glow: true,
          gift: "a tiny moonstone, polished by his silver trail",
        },
      },
      {
        id: "pip",
        name: "Pip",
        form: "small robin",
        home: "meadow",
        x: 582,
        y: 562,
        needs: { bloom: 0.6, shelter: 0.4 },
        energy: 0.8,
        attachment: 0.1,
        activity: "sorting pale seeds beneath a moonflower",
        settled: 0,
        lastVisit: -1,
        traits: {
          seedCollector: true,
          gift: "a ring of pale seeds arranged around one blue feather",
        },
      },
    ],
    discoveries: [],
    traces: ["Sol has left a silver trail toward the water, then turned back."],
    rules: [],
  };
}
/** Gentle ecological time. No offline decay, random emergencies or punishment for absence. */
export function pulseGarden(garden: Garden, events: string[]) {
  const round = (n: number) =>
    Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
  garden.phase = (garden.phase + 1) % 4;
  if (garden.phase === 0) garden.day++;
  const rain = garden.day % 3 === 0 && garden.phase === 1;
  garden.weather = rain
    ? "soft rain"
    : [
        "dew and birdsong",
        "warm afternoon light",
        "a mild evening",
        "a clear, starry night",
      ][garden.phase]!;
  for (const patch of garden.habitats) {
    const water = rain
      ? 0.18
      : garden.phase === 1
        ? -0.08 * (1 - patch.shade)
        : garden.phase === 0
          ? 0.04
          : 0;
    patch.water = round(patch.water + water);
    if (garden.phase === 0)
      patch.bloom = round(patch.bloom + (patch.water > 0.3 ? 0.08 : -0.025));
  }
  for (const resident of garden.residents) {
    const score = (patch: Garden["habitats"][number]) => {
      // Needs are minimum comforts: a better roof never makes a sheltered creature less happy.
      const needs = Object.entries(resident.needs);
      return (
        needs.reduce(
          (sum, [key, wanted]) =>
            sum +
            (wanted <= 0
              ? 1
              : Math.min(
                  1,
                  Math.max(
                    0,
                    Number((patch as any)[key] ?? patch.traits[key] ?? 0) /
                      wanted,
                  ),
                )),
          0,
        ) / Math.max(1, needs.length)
      );
    };
    const home = garden.habitats.find((h) => h.id === resident.home)!,
      best = [...garden.habitats].sort((a, b) => score(b) - score(a))[0]!;
    const destination = score(best) > score(home) + 0.05 ? best : home;
    if (destination.id !== home.id) {
      resident.home = destination.id;
      events.push(
        resident.name +
          " followed a more comfortable path to " +
          destination.name.toLowerCase() +
          ".",
      );
    }
    const neighbours = garden.residents.filter(
      (r) => r.home === destination.id,
    );
    const slot = neighbours.findIndex((r) => r.id === resident.id),
      angle = slot * 2.4;
    resident.x = destination.x + Math.sin(angle) * Math.sqrt(slot + 1) * 22;
    resident.y =
      destination.y + 24 + Math.cos(angle) * Math.sqrt(slot + 1) * 12;
    const comfort = score(destination);
    resident.energy = round(resident.energy + (comfort > 0.75 ? 0.08 : -0.02));
    resident.settled = comfort > 0.88 ? resident.settled + 1 : 0;
    resident.activity =
      comfort > 0.8
        ? "making a home in " + destination.name.toLowerCase()
        : comfort > 0.6
          ? "exploring the edges of " + destination.name.toLowerCase()
          : "looking for a more comfortable place";
    if (
      resident.settled >= 3 &&
      !garden.discoveries.some((d) => d.id === "home-" + resident.id)
    ) {
      const title = resident.name + " has chosen a home";
      const text =
        resident.name +
        " is comfortable enough to stay, and has left " +
        String(
          resident.traits["gift"] ??
            "a small keepsake at the end of the familiar trail",
        ) +
        ".";
      garden.discoveries.push({
        id: "home-" + resident.id,
        title,
        text,
        day: garden.day,
        x: resident.x,
        y: resident.y,
      });
      events.push(text);
    }
    if (resident.attachment >= 0.3)
      resident.activity += "; pausing when you come near";
  }
  garden.traces = events.slice(-8);
  garden.discoveries = garden.discoveries.slice(-40);
}
export function visitResident(garden: Garden, id: string) {
  const resident = garden.residents.find((r) => r.id === id);
  if (!resident) throw new Error("That resident has wandered elsewhere.");
  if (resident.lastVisit !== garden.day) {
    resident.lastVisit = garden.day;
    resident.attachment = Math.min(1, resident.attachment + 0.1);
  }
  return (
    resident.name +
    " " +
    (resident.attachment >= 0.3
      ? "recognises your hand and stays a little longer."
      : "pauses to watch you. There is no hurry.")
  );
}
export function validateGarden(value: unknown): Garden {
  const g = GardenSchema.parse(value);
  for (const rows of [g.habitats, g.residents, g.rules, g.discoveries])
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw new Error("Keep identities unique.");
  for (const r of g.residents)
    if (!g.habitats.some((h) => h.id === r.home))
      throw new Error("Give every resident a real home.");
  return g;
}
