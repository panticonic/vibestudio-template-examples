/**
 * Spell records: minted per accepted verse; the enforceable identity of one
 * cast. Concepts gate capability (design §16.1).
 */
import type { Capability, EffectEnvelope, Focus, GateResult, Intent, RegionId, Resonance, SpellRecord, Tier } from "../types.js";
import { REHEARSAL_RULES } from "../types.js";
import { CONCEPT_BY_ID } from "../lexicon/concepts.js";
import { nameKind } from "../lexicon/names.js";
import { fingerprint } from "../verse/fingerprint.js";
import { TIER_ETHER } from "./tiers.js";

const BINDING_WORDS = new Set(["while", "until", "whenever", "at-dawn", "at-dusk", "until-moon"]);
const CHARM_ONLY = new Set(["adorn", "sound", "one", "few", "many", "all", "up", "down", "east", "west", "here", "there", "light", "smoke", "at-dusk", "at-dawn"]);

function has(earned: string[], id: string): boolean { return earned.includes(id); }

export function guessTier(verse: string, resonance: Resonance): Tier {
  const earned = resonance.earned;
  const lower = verse.toLowerCase();
  const golem = resonance.names.find((n) => nameKind(n) === "golem");
  const hasBinding = earned.some((e) => BINDING_WORDS.has(e));
  if (has(earned, "scry")) return "scry";
  const aboutSpell = /\b(spell|ward|working|charter|binding|verse|writing)\b/i.test(lower) || resonance.names.some((n) => nameKind(n) === "spell");
  if (aboutSpell && (has(earned, "release") || has(earned, "ward") || has(earned, "break")) && !golem) return "counter";
  if (golem && (has(earned, "bind") || hasBinding || has(earned, "ward") || has(earned, "sleep"))) {
    return has(earned, "speak") || /\b(tell|ask|speak|explain|say)\b/i.test(lower) ? "charter" : "automaton";
  }
  if (has(earned, "until-moon") && earned.length >= 4) return "working";
  if (/\b(season|all (winter|summer|spring|autumn)|through the (winter|summer|spring|autumn))\b/i.test(lower) && earned.length >= 4) return "working";
  if (hasBinding) return "ward";
  if (earned.length > 0 && earned.every((e) => CHARM_ONLY.has(e)) && (has(earned, "adorn") || has(earned, "sound"))) return "charm";
  if (has(earned, "adorn") && !earned.some((e) => CONCEPT_BY_ID[e]?.family === "element" && e !== "light")) return "charm";
  return "cantrip";
}

export function mintRecord(input: {
  id: string; caster: string; verse: string; gate: Extract<GateResult, { ok: true }>; resonance: Resonance; tick: number; focus: Focus | null; scope: RegionId[]; reserve: number;
}): SpellRecord {
  const tier = guessTier(input.verse, input.resonance);
  const earned = [...new Set([...input.resonance.earned, ...input.resonance.names])];
  const base = TIER_ETHER[tier];
  const budget = tier === "charm" ? 0 : Math.max(1, Math.round(base * (1.25 - 0.5 * input.resonance.strength)));
  return {
    id: input.id,
    name: null,
    caster: input.caster,
    coCasters: [],
    verse: input.verse,
    verseNormalized: input.gate.normalized,
    fingerprint: fingerprint(input.gate.normalized),
    lines: input.gate.lines,
    score: input.gate.score,
    resonance: input.resonance,
    tier,
    status: "heard",
    intent: null,
    writing: null,
    gloss: {},
    margin: [],
    rehearsal: null,
    receipts: [],
    firings: [],
    misfire: null,
    reject: null,
    ancestry: [],
    variantOf: null,
    persistent: null,
    etherBudget: budget,
    etherSpent: 0,
    focus: input.focus?.id ?? null,
    createdTick: input.tick,
    castTick: null,
    earned,
    scope: [...input.scope],
    fromCache: false,
    triggeredBy: null,
    triggered: [],
    trail: [],
    promotedIdiom: null,
  };
}

export function capabilitiesFor(earned: string[], names: string[]): Capability[] {
  const out = new Set<Capability>(["adorn"]);
  for (const id of earned) for (const cap of CONCEPT_BY_ID[id]?.unlocks ?? []) out.add(cap);
  const hasBind = earned.includes("bind") || earned.some((e) => BINDING_WORDS.has(e));
  for (const n of names) {
    const kind = nameKind(n);
    if (kind === "place" || kind === "golem") { out.add("move"); out.add("transfer"); out.add("mark"); out.add("sluice"); }
    if (kind === "spirit" || kind === "person") out.add("voice");
    if (kind === "golem" && hasBind) out.add("bind");
    if (kind === "spell" && (earned.includes("release") || earned.includes("ward"))) out.add("against");
    if (kind === "estate") out.add("estate");
  }
  return [...out].sort();
}

export function envelopeFor(record: SpellRecord, focus: Focus | null): EffectEnvelope {
  const rule = REHEARSAL_RULES[record.tier];
  const focusApplies = focus && !focus.broken && focus.tiers.includes(record.tier) && (focus.regions === "estate" || record.scope.every((r) => (focus.regions as RegionId[]).includes(r)));
  return {
    cells: focusApplies ? rule.cellCeiling * 2 : rule.cellCeiling,
    ether: record.etherBudget,
    regions: [...record.scope],
    capabilities: capabilitiesFor(record.earned, record.resonance.names),
  };
}

const PERSISTENT_TIERS = new Set<Tier>(["ward", "automaton", "charter", "working", "ritual", "counter"]);

export function checkIntent(record: SpellRecord, intent: Intent): { ok: boolean; lacking: string[]; note: string; tier: Tier } {
  const lacking: string[] = [];
  const earned = new Set(record.earned);
  const names = record.resonance.names;
  let tier: Tier = intent.tier;
  const hasBinding = [...earned].some((e) => BINDING_WORDS.has(e)) || earned.has("bind") || earned.has("once") || earned.has("release");

  if (PERSISTENT_TIERS.has(intent.tier) && !hasBinding) lacking.push("binding");
  if (intent.binding && intent.binding.kind !== "once" && !hasBinding) lacking.push("binding");
  if (intent.subject.kind === "spirit") {
    const spirit = names.find((n) => nameKind(n) === "spirit" || nameKind(n) === "person");
    if (!spirit) lacking.push("name");
  }
  if (intent.subject.kind === "entity" && (intent.tier === "automaton" || intent.tier === "charter")) {
    if (!names.some((n) => nameKind(n) === "golem")) lacking.push("name");
  }
  if (intent.subject.kind === "spell" && intent.tier === "counter") {
    if (!(earned.has("release") || earned.has("ward") || earned.has("break"))) lacking.push("release or ward");
  }
  if (intent.quantity && !earned.has(intent.quantity.concept)) lacking.push(`quantity:${intent.quantity.concept}`);
  for (const c of intent.concepts) {
    if (c.confidence >= 0.55 && !earned.has(c.concept) && !CONCEPT_BY_ID[c.concept]) lacking.push(`unknown:${c.concept}`);
  }

  if (lacking.length > 0) tier = record.tier;
  const uniq = [...new Set(lacking)];
  const note = uniq.length === 0
    ? "The intent fits what was heard."
    : uniq.includes("binding")
      ? "Heard as a lasting thing, but no binding word was spoken: no while, until, whenever, dawn, dusk or moon. Carry it once, or say so."
      : uniq.includes("name")
        ? "Addressed to a thing whose true name was not spoken. The world cannot point without a name."
        : `The verse does not carry: ${uniq.join(", ")}.`;
  return { ok: uniq.length === 0, lacking: uniq, note, tier };
}

const FIRE = new Set(["heat", "kindle", "burn"]);
const WATER = new Set(["water", "drain", "open", "more"]);

export function needsCouncil(record: SpellRecord, intent: Intent | null, foci: Focus[]): { needed: boolean; reason: string } {
  const earned = new Set(record.earned);
  const names = record.resonance.names;
  const regions = new Set<RegionId>([...(record.scope ?? []), ...(intent?.subject.region ? [intent.subject.region] : [])]);
  const reasons: string[] = [];
  if (earned.has("bone")) reasons.push("bone is spoken; the Boneyard and the Hearth must consent");
  if (record.tier === "ritual") reasons.push("a ritual needs every voice sealed");
  if (names.some((n) => nameKind(n) === "estate") || earned.has("estate" as never)) reasons.push("the estate's own name is spoken");
  if ((regions.has("mill") || regions.has("foundry")) && [...earned].some((e) => FIRE.has(e))) reasons.push("fire near the mill");
  if (regions.has("library") && [...earned].some((e) => WATER.has(e)) && !earned.has("dry") && !earned.has("cold")) reasons.push("water into the library");
  if (names.some((n) => n.startsWith("Corwen") || n === "Warden") && (earned.has("bind") || earned.has("release"))) reasons.push("binding or loosing another's golem");
  if (earned.has("all") && (record.tier === "working" || regions.size > 2)) reasons.push("a working over the whole of a shared thing");
  if (reasons.length === 0) return { needed: false, reason: "" };
  const covered = foci.some((f) => !f.broken && f.tiers.includes(record.tier) && (f.regions === "estate" || [...regions].every((r) => (f.regions as RegionId[]).includes(r))) && [...earned].filter((e) => e === "bone" || FIRE.has(e) || WATER.has(e)).every((e) => f.concepts.includes(e)));
  if (covered && !reasons.some((r) => r.startsWith("a ritual") || r.startsWith("bone"))) return { needed: false, reason: "" };
  return { needed: true, reason: reasons.join("; ") };
}

/** Cell indices listed by the intent's rect, for the map. `w` is the region width. */
export function wardCells(record: SpellRecord, w = 64): number[] {
  const rect = record.intent?.subject.rect;
  if (!rect) return [];
  const out: number[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) out.push(y * w + x);
  return out;
}
