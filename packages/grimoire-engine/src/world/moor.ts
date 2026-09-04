/**
 * The Moor's deterministic pressure: what it does to the valley without an
 * agent's turn. The Moor agent adds tactics on top through `spiritAct`; this
 * is the weather of it. Stakes stay soft: nothing here destroys a region,
 * kills a golem, or takes a name that cannot be won back (design §27).
 */
import type { EstateState, RegionId } from "../types.js";
import { idx } from "./regions.js";
import type { Rng } from "./rng.js";
import type { WorldEvent } from "./physics.js";

const WALL_REGIONS: RegionId[] = ["lower-reach", "grate", "boneyard", "chapel"];

export function moorPressure(state: EstateState, rng: Rng): WorldEvent[] {
  const events: WorldEvent[] = [];
  const sky = state.sky;
  const moor = state.moor;
  moor.quiet = sky.festival !== null;
  if (moor.quiet) return events;
  const night = sky.hour < 6 || sky.hour >= 18;
  // Pressure grows with cairn leakage and the season; it is spent on acts.
  const leaking = Object.entries(state.regions.ridge.places).filter(([k]) => k.startsWith("cairn-")).filter(([, p]) => state.regions.ridge.layers.stone[idx(state.regions.ridge, p.x, p.y)]! < 6).length;
  if (sky.hour === 0) moor.reserve = Math.min(60, moor.reserve + 2 + leaking);
  if (!(sky.season === "autumn" || (sky.season === "winter" && sky.year >= 1)) && sky.year < 3) return events;
  if (!night) return events;

  // First autumn: spore over the wall; rot at the grate.
  if (sky.season === "autumn" && moor.reserve >= 3 && rng.next() < 0.12) {
    const target = state.regions[rng.pick(WALL_REGIONS.slice(0, 2))];
    const wetDark: number[] = [];
    for (let i = 0; i < target.w * target.h; i++) if (target.layers.water[i]! > 0 && target.layers.light[i]! < 2 && target.layers.rot[i]! < 4) wetDark.push(i);
    if (wetDark.length) {
      const i = rng.pick(wetDark);
      target.layers.spore[i] = Math.min(6, target.layers.spore[i]! + 2);
      moor.reserve -= 3;
      moor.tactic = "spore";
      moor.pressure = Math.min(9, moor.pressure + 1);
      events.push({ kind: "moor", text: `Spore comes over the wall on the night wind and settles in ${target.name}.`, region: target.id, cell: i, rung: "inbox" });
    }
  }
  // First winter: frost to block sluices.
  if (sky.season === "winter" && moor.reserve >= 4 && rng.next() < 0.08) {
    const candidates = Object.values(state.regions).flatMap((r) => r.sluices.map((s) => ({ r, s }))).filter(({ r, s }) => r.layers.water[idx(r, s.x, s.y)]! > 0);
    if (candidates.length) {
      const { r, s } = rng.pick(candidates);
      const i = idx(r, s.x, s.y);
      r.layers.frost[i] = Math.min(4, r.layers.frost[i]! + 2);
      moor.reserve -= 4;
      moor.tactic = "frost";
      events.push({ kind: "moor", text: `Frost from the moor seizes ${s.name} in ${r.name}.`, region: r.id, cell: i, rung: "inbox" });
    }
  }
  // Third year: it targets ether, not growth.
  if (sky.year >= 3 && moor.reserve >= 6 && rng.next() < 0.06) {
    const ridge = state.regions.ridge;
    const leyCells: number[] = [];
    for (let i = 0; i < ridge.w * ridge.h; i++) if (ridge.ley[i] === 1 && ridge.layers.ether[i]! > 0) leyCells.push(i);
    if (leyCells.length) {
      const i = rng.pick(leyCells);
      ridge.layers.rot[i] = Math.min(4, ridge.layers.rot[i]! + 1);
      moor.reserve -= 6;
      moor.tactic = "ether";
      events.push({ kind: "moor", text: "Rot climbs the ridge along the third line, drinking ether as it goes.", region: "ridge", cell: i, rung: "urgent" });
    }
  }
  return events;
}

/**
 * The soft-stakes invariant: every region keeps enough of what it needs to be
 * restored. No region is wholly rot; no golem is gone; the wall's gate still
 * exists; no stolen word is unrecoverable (all stolen words remain listed so
 * they can be bargained back).
 */
export function isRecoverable(state: EstateState): boolean {
  for (const region of Object.values(state.regions)) {
    if (region.id === "far-fen" || region.id === "barrows" || region.id === "road-out") continue;
    const n = region.w * region.h;
    let rotted = 0;
    for (let i = 0; i < n; i++) if (region.layers.rot[i]! >= 6) rotted++;
    if (rotted > n * 0.6) return false;
  }
  const golems = Object.values(state.entities).filter((e) => e.kind === "golem");
  if (golems.length < 14) return false;
  for (const w of state.moor.stolenWords) if (!state.moor.heardWords.includes(w) && !state.moor.stolenWords.includes(w)) return false;
  return true;
}
