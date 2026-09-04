/**
 * @workspace/grimoire-engine — public surface.
 *
 * Pure and deterministic. No runtime dependencies. Consumed by the world
 * Durable Object, the agent worker and the panel. Module ownership:
 *
 *  world/    regions catalog + generation, physics (the reaction table),
 *            creatures (pure behaviours with legible source), sky/calendar,
 *            golems, ether cost, ailments ("drawn wrong"), the Moor's pressure.
 *  lexicon/  concepts, roots, true names, phonology, fuzzy resonance.
 *  verse/    the form gate, verse normalisation and fingerprints.
 *  spells/   spell records, capability gating, envelopes, cache matching,
 *            variations, the misfire palette, intent checks.
 *  binding/  the World binding the sandbox runs (a self-contained function
 *            whose source is shipped as a prelude), program composition, the
 *            local executor for tests, effect validation and application.
 *  content/  the letter, the undone list, notebooks, stories, spirits, golems,
 *            stale workings, seed idioms, milestones, the voice bible.
 *  news/     the estate's news pages and the "one thing to do now".
 *  scry/     provenance assembly for the scrying page; briefings for agents.
 */
export * from "./types.js";
export * from "./protocol.js";

export * from "./world/index.js";
export * from "./lexicon/index.js";
export * from "./verse/index.js";
export * from "./spells/index.js";
export * from "./binding/index.js";
export * from "./content/index.js";
export * from "./news/index.js";
export * from "./scry/index.js";
export * from "./presentation.js";
