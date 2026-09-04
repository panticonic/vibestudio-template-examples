/**
 * Ether is the world's attention and the cost of everything. Cost is a
 * function of scope (cells touched), permanence (tier), distance from
 * attention (ley lines, hearth, moon) and resonance. Charms are free.
 */
import type { Apprentice, Effect, Sky, Tier } from "../types.js";
import { moonlight } from "./sky.js";

const TIER_BASE: Record<Tier, number> = { charm: 0, cantrip: 1, ward: 4, automaton: 6, charter: 6, working: 12, ritual: 20, counter: 5, scry: 0 };
const PER_CELL: Record<Tier, number> = { charm: 0, cantrip: 0.5, ward: 0.25, automaton: 0.5, charter: 0.5, working: 0.1, ritual: 0.05, counter: 0.25, scry: 0 };

function touchedCells(effects: Effect[]): number {
  const set = new Set<string>();
  for (const e of effects) {
    if ("cell" in e) set.add(`${e.cell.region}:${e.cell.x}:${e.cell.y}`);
    else if (e.kind === "move") set.add(`${e.to.region}:${e.to.x}:${e.to.y}`);
    else if (e.kind === "spawn") set.add(`${e.at.region}:${e.at.x}:${e.at.y}`);
    else set.add(e.kind + JSON.stringify(e).length);
  }
  return set.size;
}

export function etherCost(effects: Effect[], opts: { tier: Tier; resonance: number; distanceFromAttention: number; permanence: boolean }): number {
  if (opts.tier === "charm" || opts.tier === "scry") return 0;
  const only = effects.filter((e) => e.kind !== "adorn" && e.kind !== "remember");
  if (only.length === 0) return 0;
  const cells = touchedCells(only);
  let cost = TIER_BASE[opts.tier] + cells * PER_CELL[opts.tier];
  cost += only.filter((e) => e.kind === "transmute").reduce((sum, e) => sum + (e.kind === "transmute" ? Object.values(e.delta).reduce((a, b) => a + Math.abs(b ?? 0), 0) * 0.2 : 0), 0);
  if (opts.permanence) cost *= 1.5;
  cost *= 1 + Math.max(0, Math.min(3, opts.distanceFromAttention)) * 0.25;
  const discount = Math.max(0, Math.min(1, opts.resonance)) * 0.4;
  cost *= 1 - discount;
  return Math.max(opts.tier === "cantrip" ? 1 : 0, Math.round(cost));
}

export function upkeepOf(tier: Tier, cells: number): number {
  switch (tier) {
    case "ward": return 1 + Math.floor(cells / 32);
    case "automaton": return 1;
    case "charter": return 2;
    case "working": return 2 + Math.floor(cells / 256);
    case "ritual": return 3;
    default: return 0;
  }
}

/** The reserve refills at the hearth, faster under the moon; a little anywhere on a ley cell. */
export function refillReserve(apprentice: Apprentice, atHearth: boolean, sky: Sky): void {
  let gain = 0;
  if (atHearth) gain += 3;
  gain += moonlight(sky) > 0 ? 1 : 0;
  if (sky.festival) gain += 1;
  apprentice.reserve = Math.min(apprentice.reserveMax, apprentice.reserve + gain);
}
