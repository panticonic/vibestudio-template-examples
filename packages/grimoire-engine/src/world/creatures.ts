/**
 * Creatures are pure code, small and legible: the first things a player
 * scries. `source` is the text the scrying page shows; `run` is the same
 * logic executed by the engine. Keep them in step.
 */
import type { Cell, CreatureKind, Dir, Entity, EstateState, Reagent, RegionId, Sky } from "../types.js";
import { cellAt, idx, inBounds, neighbours } from "./regions.js";
import type { Rng } from "./rng.js";
import type { WorldEvent } from "./physics.js";
import { isDaytime } from "./sky.js";

export interface CreatureStep { move?: Dir; say?: string; eat?: boolean; breed?: boolean; die?: boolean; carry?: Reagent }
export interface CreatureSenses { cell: Cell; around: Cell[]; sky: Sky; nearby: Entity[] }
export interface Behaviour { name: string; source: string; lines: number; run(entity: Entity, senses: CreatureSenses, rng: Rng): CreatureStep }

const DIRS: Dir[] = ["n", "s", "e", "w"];

function dirTo(from: Cell, to: Cell): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "e" : "w";
  return dy > 0 ? "s" : "n";
}


const sparrow: Behaviour = {
  name: "sparrow",
  lines: 14,
  source: `// a sparrow
function sparrow(self, here, around, sky) {
  if (!sky.day) return { roost: true };                 // roosts at night
  if (here.heat >= 3) {                                  // flees heat
    const cool = around.sort((a, b) => a.heat - b.heat)[0];
    return { move: toward(here, cool) };
  }
  const seed = around.find((c) => c.growth >= 2);        // seeks seed
  if (seed) {
    if (self.hunger > 3) return { eat: true, move: toward(here, seed) };
    return { move: toward(here, seed), carry: "seed" };   // carries seeds elsewhere
  }
  return { move: wander() };                             // else wanders
}`,
  run(self, s, rng) {
    if (!isDaytime(s.sky)) return {};
    if (s.cell.heat >= 3) {
      const cool = [...s.around].sort((a, b) => a.heat - b.heat)[0];
      return cool ? { move: dirTo(s.cell, cool) } : { move: rng.pick(DIRS) };
    }
    const seed = s.around.find((c) => c.growth >= 2);
    if (seed) {
      const hunger = Number(self.state["hunger"] ?? 0);
      if (hunger > 3) return { eat: true, move: dirTo(s.cell, seed) };
      return { move: dirTo(s.cell, seed), carry: "seed" };
    }
    return { move: rng.pick(DIRS) };
  },
};

const vermin: Behaviour = {
  name: "vermin",
  lines: 22,
  source: `// vermin
function vermin(self, here, around, sky) {
  // avoids light: any lit cell nearby sends it the other way
  const lit = around.filter((c) => c.light >= 3);
  if (here.light >= 3) {
    const dark = around.sort((a, b) => a.light - b.light)[0];
    return { move: toward(here, dark) };
  }
  // seeks growth: eats what it stands on, else moves to the greenest neighbour
  if (here.growth > 0) {
    self.fed += 1;
    return { eat: true };
  }
  const green = around.filter((c) => c.light < 3).sort((a, b) => b.growth - a.growth)[0];
  if (green && green.growth > 0) return { move: toward(here, green) };
  // breeds in the dark when fed
  if (self.fed >= 4 && here.light === 0 && !sky.day) {
    self.fed = 0;
    return { breed: true };
  }
  // dislikes ash and salt; leaves cells that hold them
  if (here.ash > 0) return { move: wander() };
  return { move: wander() };
}`,
  run(self, s, rng) {
    if (s.cell.light >= 3) {
      const dark = [...s.around].sort((a, b) => a.light - b.light)[0];
      return dark ? { move: dirTo(s.cell, dark) } : {};
    }
    if (s.cell.growth > 0) {
      self.state["fed"] = Number(self.state["fed"] ?? 0) + 1;
      return { eat: true };
    }
    const green = s.around.filter((c) => c.light < 3).sort((a, b) => b.growth - a.growth)[0];
    if (green && green.growth > 0) return { move: dirTo(s.cell, green) };
    if (Number(self.state["fed"] ?? 0) >= 4 && s.cell.light === 0 && !isDaytime(s.sky)) {
      self.state["fed"] = 0;
      return { breed: true };
    }
    return { move: rng.pick(DIRS) };
  },
};

const carp: Behaviour = {
  name: "carp",
  lines: 9,
  source: `// a carp
function carp(self, here, around) {
  if (here.water < 2) return { gasp: true };             // needs water
  const slow = around.filter((c) => c.water >= 2 && c.species === "reed");
  if (slow.length) return { move: toward(here, slow[0]) }; // seeks slow water with reeds
  const wet = around.filter((c) => c.water >= 2);
  if (wet.length) return { move: toward(here, pick(wet)) };
  return {};
}`,
  run(self, s, rng) {
    if (s.cell.water < 2) { self.state["gasping"] = Number(self.state["gasping"] ?? 0) + 1; return Number(self.state["gasping"]) > 24 ? { die: true } : {}; }
    self.state["gasping"] = 0;
    const slow = s.around.filter((c) => c.water >= 2 && c.species === "reed");
    if (slow.length) return { move: dirTo(s.cell, slow[0]!) };
    const wet = s.around.filter((c) => c.water >= 2);
    if (wet.length) return { move: dirTo(s.cell, rng.pick(wet)) };
    return {};
  },
};

const siltWorm: Behaviour = {
  name: "silt-worm",
  lines: 11,
  source: `// a silt-worm
function siltWorm(self, here, around) {
  if (here.frost > 0) return { sleep: true };            // sleeps in frost
  if (here.silt > 0) return { eat: "silt" };             // eats silt
  const silty = around.sort((a, b) => b.silt - a.silt)[0];
  if (silty && silty.silt > 0) return { move: toward(here, silty) };
  if (here.water === 0) {
    const wet = around.find((c) => c.water > 0);
    if (wet) return { move: toward(here, wet) };
  }
  return { move: wander() };
}`,
  run(_self, s, rng) {
    if (s.cell.frost > 0) return {};
    if (s.cell.silt > 0) return { eat: true };
    const silty = [...s.around].sort((a, b) => b.silt - a.silt)[0];
    if (silty && silty.silt > 0) return { move: dirTo(s.cell, silty) };
    if (s.cell.water === 0) {
      const wet = s.around.find((c) => c.water > 0);
      if (wet) return { move: dirTo(s.cell, wet) };
    }
    return { move: rng.pick(DIRS) };
  },
};

const moth: Behaviour = {
  name: "moth",
  lines: 7,
  source: `// a moth
function moth(self, here, around) {
  if (here.heat >= 5) return { die: true };               // dies in fire
  const bright = around.sort((a, b) => b.light - a.light)[0];
  if (bright && bright.light > here.light) return { move: toward(here, bright) }; // seeks light
  return { move: wander() };
}`,
  run(_self, s, rng) {
    if (s.cell.heat >= 5) return { die: true };
    const bright = [...s.around].sort((a, b) => b.light - a.light)[0];
    if (bright && bright.light > s.cell.light) return { move: dirTo(s.cell, bright) };
    return { move: rng.pick(DIRS) };
  },
};

const warmThing: Behaviour = {
  name: "the warm thing in the boneyard",
  lines: 0,
  source: `// · · ·
// · · ·   (the writing under this one will not hold still)
// · · ·`,
  run(_self, s) {
    // It does not leave its grave. It warms it.
    return s.cell.heat < 2 ? { eat: false } : {};
  },
};

export const CREATURE_BEHAVIOURS: Record<CreatureKind, Behaviour> = {
  sparrow,
  vermin,
  carp,
  "silt-worm": siltWorm,
  moth,
  "warm-thing": warmThing,
};

function step(region: RegionId, dir: Dir): [number, number] {
  void region;
  switch (dir) {
    case "n": return [0, -1];
    case "s": return [0, 1];
    case "e": return [1, 0];
    case "w": return [-1, 0];
  }
}

const CREATURE_CAP = 60;

/** Step every creature in the active regions. Mutates state; returns notable events. */
export function stepCreatures(state: EstateState, rng: Rng, active: RegionId[]): WorldEvent[] {
  const events: WorldEvent[] = [];
  const activeSet = new Set(active);
  const perRegion: Record<string, number> = {};
  for (const e of Object.values(state.entities)) if (e.kind === "creature") perRegion[e.region] = (perRegion[e.region] ?? 0) + 1;
  const spawned: Entity[] = [];
  for (const e of Object.values(state.entities)) {
    if (e.kind !== "creature" || !activeSet.has(e.region)) continue;
    const region = state.regions[e.region];
    const behaviour = CREATURE_BEHAVIOURS[e.sub as CreatureKind];
    if (!behaviour) continue;
    const cell = cellAt(region, e.x, e.y);
    const around = neighbours(region, e.x, e.y, 1);
    const nearby = Object.values(state.entities).filter((o) => o !== e && o.region === e.region && Math.abs(o.x - e.x) <= 2 && Math.abs(o.y - e.y) <= 2);
    const result = behaviour.run(e, { cell, around, sky: state.sky, nearby }, rng);
    const i = idx(region, e.x, e.y);
    if (result.die) {
      delete state.entities[e.name];
      events.push({ kind: "creature-died", text: `a ${behaviour.name} ${e.sub === "moth" ? "burned" : "died"} in ${region.name}`, region: e.region, cell: i, entity: e.name });
      continue;
    }
    if (result.eat) {
      if (e.sub === "silt-worm") { if (region.layers.silt[i]! > 0) region.layers.silt[i] = region.layers.silt[i]! - 1; }
      else if (region.layers.growth[i]! > 0) { region.layers.growth[i] = region.layers.growth[i]! - 1; e.state["hunger"] = 0; }
    } else if (e.sub === "sparrow") {
      e.state["hunger"] = Number(e.state["hunger"] ?? 0) + 1;
    }
    if (result.carry === "seed" && cell.growth >= 2) e.carrying.seed = Math.min(3, (e.carrying.seed ?? 0) + 1);
    if (result.breed && (perRegion[e.region] ?? 0) < CREATURE_CAP) {
      const name = `${e.sub}-${state.seq++}`;
      spawned.push({ ...e, name, state: { fed: 0 }, carrying: {}, last: "born" });
      perRegion[e.region] = (perRegion[e.region] ?? 0) + 1;
      events.push({ kind: "creature-bred", text: `vermin breed in the dark of ${region.name}`, region: e.region, cell: i, entity: name });
    }
    if (result.move) {
      const [dx, dy] = step(e.region, result.move);
      const nx = e.x + dx;
      const ny = e.y + dy;
      if (inBounds(region, nx, ny) && region.layers.stone[idx(region, nx, ny)]! < 6) {
        e.x = nx;
        e.y = ny;
        // Sparrows drop carried seed on bare ground now and then.
        if (e.sub === "sparrow" && (e.carrying.seed ?? 0) > 0) {
          const j = idx(region, nx, ny);
          if (region.layers.growth[j] === 0 && region.species[j] === "" && region.layers.stone[j]! < 3 && rng.next() < 0.3) {
            region.species[j] = "grass";
            region.layers.growth[j] = 1;
            e.carrying.seed = (e.carrying.seed ?? 1) - 1;
          }
        }
      }
      e.last = `moved ${result.move}`;
    } else {
      e.last = result.eat ? "ate" : "stayed";
    }
  }
  for (const s of spawned) state.entities[s.name] = s;
  return events;
}
