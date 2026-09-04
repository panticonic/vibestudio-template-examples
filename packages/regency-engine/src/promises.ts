/**
 * The Regent's word as a ledger. A promise is text plus a structured check;
 * the engine says at each resolution whether the world has made it true, made
 * it false, or is still deciding. Nothing here is guessed from prose.
 */
import { atWar, treatyBetween } from "./state.js";
import type { GameState, PromiseCheck, PromiseStatus, RegentPromise } from "./types.js";

/** The infamy a broken promise costs the Regency. */
export const BROKEN_PROMISE_INFAMY = 5;
/** How far the wronged realm's regard falls. */
export const BROKEN_PROMISE_REGARD = 20;

/** Returns a human-readable problem, or null when the check is well formed. */
export function validatePromiseCheck(state: GameState, check: unknown): string | null {
  if (!check || typeof check !== "object") return "check must be an object";
  const c = check as PromiseCheck;
  switch (c.kind) {
    case "treaty":
      if (!(c.with in state.realms)) return `unknown realm ${String(c.with)}`;
      if (!["non_aggression", "alliance", "trade", "tribute", "peace"].includes(c.treatyKind)) return `unknown treaty kind ${String(c.treatyKind)}`;
      return null;
    case "no_war":
      if (!(c.with in state.realms)) return `unknown realm ${String(c.with)}`;
      if (!(Number.isInteger(c.seasons) && c.seasons >= 1 && c.seasons <= 40)) return "no_war.seasons must be 1..40";
      return null;
    case "cede":
      if (!(c.province in state.provinces)) return `unknown province ${String(c.province)}`;
      if (!(c.to in state.realms)) return `unknown realm ${String(c.to)}`;
      return null;
    case "free_text":
      return null;
    default:
      return `unknown check kind ${String((c as { kind?: unknown }).kind)}`;
  }
}

export function describePromiseCheck(state: GameState, check: PromiseCheck): string {
  const rn = (id: string) => state.realms[id]?.name ?? id;
  switch (check.kind) {
    case "treaty":
      return `a ${check.treatyKind.replace("_", "-")} treaty with ${rn(check.with)}`;
    case "no_war":
      return `no war with ${rn(check.with)} for ${check.seasons} season${check.seasons === 1 ? "" : "s"}`;
    case "cede":
      return `${state.provinces[check.province]?.name ?? check.province} passes to ${rn(check.to)}`;
    case "free_text":
      return "kept or broken by the Regent's own judgement";
  }
}

/**
 * Evaluate one promise against the world. `free_text` promises are never
 * settled by the engine; a person decides those.
 */
export function evaluatePromise(state: GameState, promise: RegentPromise): PromiseStatus {
  const me = state.playerRealm;
  switch (promise.check.kind) {
    case "treaty":
      return treatyBetween(state, me, promise.check.with, promise.check.treatyKind) ? "kept" : "pending";
    case "no_war": {
      if (atWar(state, me, promise.check.with)) return "broken";
      return state.season - promise.season >= promise.check.seasons ? "kept" : "pending";
    }
    case "cede":
      return state.provinces[promise.check.province]?.owner === promise.check.to ? "kept" : "pending";
    case "free_text":
      return promise.status === "pending" ? "pending" : promise.status;
  }
}

/**
 * Mark a promise kept or broken and charge the world for it: a broken word
 * raises the Regency's infamy and costs the wronged realm's regard; a kept one
 * wins a little of both back. Used by the engine's own settlement and by the
 * Regent's judgement on free-text promises, so both cost the same.
 */
export function applyPromiseVerdict(state: GameState, promise: RegentPromise, verdict: "kept" | "broken"): void {
  const player = state.realms[state.playerRealm];
  promise.status = verdict;
  promise.settled = state.season;
  const other = state.realms[promise.to];
  if (verdict === "broken") {
    if (player) player.infamy = Math.min(100, player.infamy + BROKEN_PROMISE_INFAMY);
    if (other) other.relations[state.playerRealm] = Math.max(-100, (other.relations[state.playerRealm] ?? 0) - BROKEN_PROMISE_REGARD);
    state.regent.reputation = Math.max(0, state.regent.reputation - 3);
  } else {
    if (other) other.relations[state.playerRealm] = Math.min(100, (other.relations[state.playerRealm] ?? 0) + 8);
    state.regent.reputation = Math.min(100, state.regent.reputation + 2);
  }
}

/**
 * Settle every pending promise the engine can judge. Mutates `state` and
 * returns the promises that changed.
 */
export function settlePromises(state: GameState, promises: RegentPromise[]): RegentPromise[] {
  const changed: RegentPromise[] = [];
  if (!state.realms[state.playerRealm]) return changed;
  for (const promise of promises) {
    if (promise.status !== "pending") continue;
    const next = evaluatePromise(state, promise);
    if (next === "pending") continue;
    applyPromiseVerdict(state, promise, next);
    changed.push(promise);
  }
  return changed;
}
