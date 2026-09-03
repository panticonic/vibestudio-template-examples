/**
 * Edicts are laws written as data by the Chancellor. The engine evaluates
 * them each season against every province of the realm. Validation is strict
 * so a badly written law is rejected at submission rather than silently ignored.
 */
import { foodRatio, garrisonCompanies, isBorderProvince } from "./state.js";
import { BUILDINGS, type BuildingKind, type Edict, type EdictAction, type EdictCondition, type GameState, type Province } from "./types.js";

const FIELDS: ReadonlySet<string> = new Set([
  "unrest",
  "population",
  "food_ratio",
  "development",
  "garrison",
  "fort",
  "granary",
  "is_border",
  "coastal",
  "terrain",
  "resource",
  "famine_streak",
]);
const OPS: ReadonlySet<string> = new Set([">", "<", ">=", "<=", "==", "!=", "has"]);
const ACTIONS: ReadonlySet<string> = new Set(["tax_relief", "grain_dole", "garrison_levy", "public_works", "curfew"]);

export function fieldValue(state: GameState, p: Province, field: EdictCondition["field"]): number | string | boolean {
  switch (field) {
    case "unrest":
      return p.unrest;
    case "population":
      return p.population;
    case "food_ratio":
      return foodRatio(p);
    case "development":
      return p.development;
    case "garrison":
      return garrisonCompanies(state, p);
    case "fort":
      return p.buildings.fort;
    case "granary":
      return p.granary;
    case "is_border":
      return isBorderProvince(state, p);
    case "coastal":
      return p.coastal;
    case "terrain":
      return p.terrain;
    case "resource":
      return p.resources.join(",");
    case "famine_streak":
      return p.famineStreak;
  }
}

export function conditionHolds(state: GameState, p: Province, c: EdictCondition): boolean {
  const actual = fieldValue(state, p, c.field);
  if (c.op === "has") {
    return typeof actual === "string" && actual.split(",").includes(String(c.value));
  }
  if (typeof actual === "number" && typeof c.value === "number") {
    switch (c.op) {
      case ">":
        return actual > c.value;
      case "<":
        return actual < c.value;
      case ">=":
        return actual >= c.value;
      case "<=":
        return actual <= c.value;
      case "==":
        return actual === c.value;
      case "!=":
        return actual !== c.value;
    }
  }
  if (c.op === "==") return actual === c.value;
  if (c.op === "!=") return actual !== c.value;
  return false;
}

export function provinceMatches(state: GameState, p: Province, edict: Edict): boolean {
  return edict.when.every((c) => conditionHolds(state, p, c));
}

/** Returns a human-readable problem, or null when the edict is well formed. */
export function validateEdict(edict: unknown): string | null {
  if (!edict || typeof edict !== "object") return "edict must be an object";
  const e = edict as Partial<Edict>;
  if (typeof e.title !== "string" || e.title.trim().length === 0 || e.title.length > 80) return "title must be 1–80 characters";
  if (!Array.isArray(e.when) || e.when.length === 0 || e.when.length > 6) return "when must list 1–6 conditions";
  for (const c of e.when as EdictCondition[]) {
    if (!c || typeof c !== "object") return "each condition must be an object";
    if (!FIELDS.has(c.field)) return `unknown condition field: ${String(c.field)}`;
    if (!OPS.has(c.op)) return `unknown operator: ${String(c.op)}`;
    const t = typeof c.value;
    if (t !== "number" && t !== "string" && t !== "boolean") return "condition value must be a number, string or boolean";
    if (c.op === "has" && c.field !== "resource") return "'has' only applies to the resource field";
    if (["terrain", "resource"].includes(c.field) && t !== "string") return `${c.field} compares against a string`;
    if (["is_border", "coastal"].includes(c.field) && t !== "boolean") return `${c.field} compares against a boolean`;
    if (!["terrain", "resource", "is_border", "coastal"].includes(c.field) && t !== "number") return `${c.field} compares against a number`;
  }
  if (!Array.isArray(e.then) || e.then.length === 0 || e.then.length > 3) return "then must list 1–3 actions";
  for (const a of e.then as EdictAction[]) {
    if (!a || typeof a !== "object" || !ACTIONS.has(a.kind)) return `unknown action: ${String((a as { kind?: unknown })?.kind)}`;
    if (a.kind === "tax_relief" && !(typeof a.factor === "number" && a.factor >= 0 && a.factor <= 1)) return "tax_relief.factor must be within 0..1";
    if (a.kind === "garrison_levy" && !(Number.isInteger(a.companies) && a.companies >= 1 && a.companies <= 5)) return "garrison_levy.companies must be 1..5";
    if (a.kind === "public_works" && !BUILDINGS.includes(a.building)) return `public_works.building must be one of ${BUILDINGS.join(", ")}`;
  }
  return null;
}

/** Actions that apply to a province this season, merged across matching edicts. */
export interface EdictEffects {
  taxFactor: number;
  grainDole: boolean;
  garrisonLevy: number;
  publicWorks: BuildingKind[];
  curfew: boolean;
  matched: string[];
}

export function edictEffects(state: GameState, p: Province, edicts: Edict[]): EdictEffects {
  const fx: EdictEffects = { taxFactor: 1, grainDole: false, garrisonLevy: 0, publicWorks: [], curfew: false, matched: [] };
  for (const edict of edicts) {
    if (!provinceMatches(state, p, edict)) continue;
    fx.matched.push(edict.id);
    for (const a of edict.then) {
      switch (a.kind) {
        case "tax_relief":
          fx.taxFactor = Math.min(fx.taxFactor, a.factor);
          break;
        case "grain_dole":
          fx.grainDole = true;
          break;
        case "garrison_levy":
          fx.garrisonLevy = Math.max(fx.garrisonLevy, a.companies);
          break;
        case "public_works":
          if (!fx.publicWorks.includes(a.building)) fx.publicWorks.push(a.building);
          break;
        case "curfew":
          fx.curfew = true;
          break;
      }
    }
  }
  return fx;
}

/** A worked example the Chancellor can copy. */
export const EXAMPLE_EDICT: Omit<Edict, "id" | "enacted" | "author"> = {
  title: "Relief for the hungry marches",
  when: [
    { field: "is_border", op: "==", value: true },
    { field: "food_ratio", op: "<", value: 1 },
  ],
  then: [{ kind: "tax_relief", factor: 0.5 }, { kind: "grain_dole" }],
};
