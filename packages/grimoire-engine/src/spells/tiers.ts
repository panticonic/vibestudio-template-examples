import type { SpellRecord, Tier } from "../types.js";

export const TIER_LABELS: Record<Tier, string> = {
  charm: "charm",
  cantrip: "cantrip",
  ward: "ward",
  automaton: "binding (automaton)",
  charter: "binding (charter)",
  working: "great working",
  ritual: "ritual",
  counter: "counter-working",
  scry: "scry",
};

/** Base ether per tier; scaled by resonance in mintRecord. */
export const TIER_ETHER: Record<Tier, number> = {
  charm: 0, cantrip: 30, ward: 24, automaton: 10, charter: 6, working: 80, ritual: 160, counter: 24, scry: 0,
};

export function tierOf(record: SpellRecord): Tier {
  return record.tier;
}

export function isPersistent(tier: Tier): boolean {
  return tier === "ward" || tier === "automaton" || tier === "charter" || tier === "working" || tier === "ritual";
}
