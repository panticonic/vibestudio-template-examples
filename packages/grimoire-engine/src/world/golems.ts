/**
 * Golems are bodies: senses (its cell and neighbours, what it carries, what it
 * hears) and a small fixed set of actions. The world runs the body's source
 * (automaton) or lets a chartered agent act; both go through
 * `applyGolemAction`, which is the only way a body moves.
 */
import type { Entity, EstateState, GolemAction, GolemBody, Reagent, RegionId, Senses } from "../types.js";
import { cellAt, idx, inBounds, neighbours } from "./regions.js";

export interface GolemSpec {
  name: string;
  body: GolemBody;
  region: RegionId;
  x: number;
  y: number;
  teaches: string;
  startsBound: "stale" | null;
  staleAuthor?: string;
  staleNote?: string;
}

export const GOLEM_CATALOG: GolemSpec[] = [
  { name: "Toll", body: "stone", region: "mine-upper", x: 6, y: 12, teaches: "release; the first automaton", startsBound: "stale", staleAuthor: "Ysolde", staleNote: "hauling stone to the fallen east tower, which fell forty years ago" },
  { name: "Wren", body: "wood", region: "hot-house", x: 8, y: 6, teaches: "charters; the news", startsBound: "stale", staleAuthor: "Ysolde", staleNote: "tending the hot house, caught between two wards that quarrel every dawn" },
  { name: "Sedge", body: "wood", region: "lower-reach", x: 30, y: 16, teaches: "reed management with the River", startsBound: null },
  { name: "Ash", body: "stone", region: "foundry", x: 4, y: 12, teaches: "wards around a charter", startsBound: null },
  { name: "Warden", body: "stone", region: "observatory", x: 12, y: 22, teaches: "counter-working with respect", startsBound: "stale", staleAuthor: "Ysolde", staleNote: "guarding the observatory door; the master's last complete spell" },
  ...Array.from({ length: 8 }, (_, i) => ({ name: `Corwen-${i + 1}`, body: "stone" as GolemBody, region: "mine-deep" as RegionId, x: 4 + i * 3, y: 18, teaches: "the ethics of binding", startsBound: "stale" as const, staleAuthor: "Corwen", staleNote: "under a four-hundred-year charter no one has read" })),
  { name: "Corwen-Bone", body: "bone", region: "mine-deep", x: 28, y: 18, teaches: "the ethics of binding", startsBound: "stale", staleAuthor: "Corwen", staleNote: "the one of bone" },
];

/** A body's stale source: what it does each tick under its old binding. Legible; the DO runs it. */
export function staleGolemSource(name: string): string {
  switch (name) {
    case "Toll":
      return `// Toll's binding — Ysolde, year 27 of her tenure. Haul stone east until the tower is mended.
const here = senses.cell;
if ((senses.carrying.silver ?? 0) + (senses.carrying.seed ?? 0) > 0 || here.stone < 2) {
  // carry what we hold toward the east tower (which is no longer there)
  return act({ kind: "move", dir: "e" });
}
return act({ kind: "carry" });`;
    case "Wren":
      return `// Wren's binding — Ysolde. Tend whatever is planted; water it if dry, shade it if hot.
const here = senses.cell;
if (here.growth > 0 && here.water < 2) return act({ kind: "tend" });
const dry = senses.around.find((c) => c.growth > 0 && c.water < 2);
if (dry) return act({ kind: "move", dir: dry.x > here.x ? "e" : dry.x < here.x ? "w" : dry.y > here.y ? "s" : "n" });
return act({ kind: "tend" });`;
    case "Warden":
      return `// The Warden — Ysolde's last complete spell. Hold the door until the moon and every spirit consent.
if (senses.heard.some((u) => u.verse.includes("consent"))) return act({ kind: "speak", line: "Not every voice has spoken." });
return act({ kind: "strike", dir: "s" }); // strikes the ground; nothing passes`;
    case "Corwen-Bone":
      return `// Corwen's charter, the ninth body. · · ·
// (the writing is old form; the Library can translate it, for a price)
return act({ kind: "carry" });`;
    default:
      return `// Corwen's charter. · · ·
// Bring stone up from the deep. Do not stop. Do not speak.
return act({ kind: "move", dir: "n" });`;
  }
}

export function golemSenses(state: EstateState, golem: Entity): Senses {
  const region = state.regions[golem.region];
  const cell = cellAt(region, golem.x, golem.y);
  const around = neighbours(region, golem.x, golem.y, 1);
  const nearby = Object.values(state.entities).filter((o) => o !== golem && o.region === golem.region && Math.abs(o.x - golem.x) <= 3 && Math.abs(o.y - golem.y) <= 3);
  return { self: golem, cell, around, heard: [], carrying: golem.carrying, nearby };
}

const CARRY_CAP = 3;

function reagentOfCell(state: EstateState, region: RegionId, i: number): Reagent | null {
  const r = state.regions[region];
  if (r.layers.silver[i]! > 0) return "silver";
  if (r.layers.ash[i]! > 0) return "ash";
  if (r.layers.stone[i]! >= 2 && r.layers.silt[i]! === 0) return null; // stone is not a reagent; carried as "stone" mass below
  return null;
}

export function applyGolemAction(state: EstateState, golem: Entity, action: GolemAction): { ok: boolean; reason?: string; text: string } {
  if (golem.kind !== "golem") return { ok: false, reason: "not a golem", text: "" };
  const region = state.regions[golem.region];
  const i = idx(region, golem.x, golem.y);
  if (golem.tired >= 12 && action.kind !== "speak") {
    return { ok: false, reason: "tired", text: `${golem.name} is too tired to move` };
  }
  switch (action.kind) {
    case "move": {
      const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[action.dir];
      const nx = golem.x + d[0]!;
      const ny = golem.y + d[1]!;
      if (!inBounds(region, nx, ny)) return { ok: false, reason: "edge", text: `${golem.name} reaches the edge of ${region.name} and stops` };
      const j = idx(region, nx, ny);
      if (region.layers.stone[j]! >= 6) return { ok: false, reason: "stone", text: `${golem.name} is stopped by stone` };
      if (Object.values(state.entities).some((o) => o.kind === "golem" && o !== golem && o.region === golem.region && o.x === nx && o.y === ny)) return { ok: false, reason: "occupied", text: `${golem.name} waits; another body is in the way` };
      golem.x = nx;
      golem.y = ny;
      golem.tired += 1;
      golem.last = `moved ${action.dir}`;
      return { ok: true, text: `${golem.name} moves ${action.dir}` };
    }
    case "carry": {
      const total = Object.values(golem.carrying).reduce((a, b) => a + (b ?? 0), 0);
      if (total >= CARRY_CAP) return { ok: false, reason: "full", text: `${golem.name}'s arms are full` };
      const reagent = action.reagent ?? reagentOfCell(state, golem.region, i);
      if (reagent && region.layers[reagent === "silver" ? "silver" : "ash"][i]! > 0) {
        region.layers[reagent === "silver" ? "silver" : "ash"][i]! -= 1;
        golem.carrying[reagent] = (golem.carrying[reagent] ?? 0) + 1;
        golem.tired += 1;
        golem.last = `picked up ${reagent}`;
        return { ok: true, text: `${golem.name} picks up ${reagent}` };
      }
      if (region.layers.stone[i]! >= 2) {
        region.layers.stone[i]! -= 1;
        golem.state["stone"] = Number(golem.state["stone"] ?? 0) + 1;
        golem.tired += 1;
        golem.last = "picked up stone";
        return { ok: true, text: `${golem.name} lifts loose stone` };
      }
      return { ok: false, reason: "nothing", text: `${golem.name} finds nothing to carry` };
    }
    case "place": {
      const stone = Number(golem.state["stone"] ?? 0);
      if (stone > 0) {
        golem.state["stone"] = stone - 1;
        region.layers.stone[i]! += 1;
        golem.last = "placed stone";
        return { ok: true, text: `${golem.name} sets stone down` };
      }
      for (const r of Object.keys(golem.carrying) as Reagent[]) {
        if ((golem.carrying[r] ?? 0) > 0) {
          golem.carrying[r]! -= 1;
          if (r === "silver" || r === "ash") region.layers[r][i]! += 1;
          golem.last = `placed ${r}`;
          return { ok: true, text: `${golem.name} sets ${r} down` };
        }
      }
      return { ok: false, reason: "empty", text: `${golem.name} has nothing to set down` };
    }
    case "strike": {
      const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[action.dir];
      const nx = golem.x + d[0]!;
      const ny = golem.y + d[1]!;
      if (!inBounds(region, nx, ny)) return { ok: false, reason: "edge", text: `${golem.name} strikes at nothing` };
      const j = idx(region, nx, ny);
      if (region.layers.stone[j]! >= 6) { region.layers.stone[j]! -= 1; golem.tired += 2; golem.last = "struck stone"; return { ok: true, text: `${golem.name} strikes the stone; it gives a little` }; }
      if (region.layers.frost[j]! > 0) { region.layers.frost[j] = 0; golem.tired += 1; golem.last = "broke frost"; return { ok: true, text: `${golem.name} breaks the frost` }; }
      if (region.layers.silt[j]! > 0) { region.layers.silt[j]! -= 1; golem.tired += 1; golem.last = "cleared silt"; return { ok: true, text: `${golem.name} clears silt` }; }
      golem.tired += 1;
      golem.last = "struck";
      return { ok: true, text: `${golem.name} strikes the ground` };
    }
    case "tend": {
      if (region.layers.growth[i]! > 0) {
        if (region.layers.water[i]! < 2) region.layers.water[i]! += 1;
        if (region.layers.rot[i]! > 0) region.layers.rot[i]! -= 1;
        golem.tired += 1;
        golem.last = "tended";
        return { ok: true, text: `${golem.name} tends the ${region.species[i] || "growth"}` };
      }
      return { ok: false, reason: "nothing", text: `${golem.name} finds nothing to tend` };
    }
    case "speak": {
      golem.last = `said: ${action.line}`;
      return { ok: true, text: `${golem.name} says: ${action.line}` };
    }
  }
}

/** Golems rest one point per tick when idle; a golem that is not acting recovers. Called by the tick. */
export function restGolems(state: EstateState): void {
  for (const e of Object.values(state.entities)) {
    if (e.kind !== "golem") continue;
    if (e.tired > 0) e.tired -= 1;
  }
}
