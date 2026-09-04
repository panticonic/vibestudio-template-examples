/**
 * The world's side of a cast: validate a RunResult against the spell record,
 * the tier's rehearsal rule and effect ceiling, the caster's ether, and the
 * soft-stakes rules; then apply what passes and hand back receipts.
 *
 * Effects that become records of their own (wards, continuations, bindings,
 * speech, bargains, counter-workings, memory) are validated here, receipted,
 * and returned in `deferred` for the Durable Object to install.
 */
import { REHEARSAL_RULES } from "../types.js";
import type {
  Apprentice, Capability, Caster, CellRef, Effect, EffectEnvelope, Entity, EstateState, Layer, MisfireKind, PersistentSpell, Reagent, Receipt, Region, RegionId, RunResult, Senses, Snapshot, SpellRecord, Utterance,
} from "../types.js";

/** A small mirror of the lexicon's capability table, so this module stands alone. */
export const capabilityTable: Record<string, Capability[]> = {
  // elements
  heat: ["transmute", "push"], water: ["transmute", "push"], stone: ["transmute", "push"], growth: ["transmute", "spawn"], air: ["transmute", "push"],
  light: ["transmute"], rot: ["transmute"], ether: ["transmute"],
  // qualities and quantities
  cold: ["transmute"], strong: ["transmute", "push"], one: ["transmute"], few: ["transmute"], many: ["transmute", "spawn"], all: ["transmute"],
  slow: ["transmute", "push"], fast: ["transmute", "push"], north: ["push"], south: ["push"], east: ["push"], west: ["push"], within: ["transmute"], beyond: ["transmute"],
  // bindings
  once: ["ward", "time"], while: ["ward", "time"], until: ["ward", "time"], whenever: ["ward", "time"], "at-dawn": ["ward", "time"], "at-dusk": ["ward", "time"], "until-moon": ["ward", "time"], release: ["against", "ward"],
  // verbs
  kindle: ["transmute"], quench: ["transmute"], bind: ["bind", "ward"], scry: ["scry-deep"], speak: ["voice"], hold: ["ward", "against"], open: ["sluice", "transmute"], name: ["mark", "voice"], break: ["transmute", "push"], adorn: ["adorn"],
  // reagents
  ash: ["craft"], salt: ["craft"], sap: ["craft"], silver: ["craft"], glass: ["craft"], "moon-ether": ["craft"], bone: ["craft"], seed: ["craft", "spawn"], fibre: ["craft"],
  // names (a true name of a thing/spirit/golem/spell earns the concept id `name:<kind>`)
  "name:place": ["move", "transfer", "mark", "sluice"], "name:spirit": ["voice", "transfer"], "name:golem": ["bind", "move", "transfer"], "name:spell": ["against"], "name:estate": ["estate"], "name:person": ["voice", "transfer"],
};

export function capabilitiesOf(earned: string[]): Capability[] {
  const out = new Set<Capability>(["adorn"]);
  for (const c of earned) for (const cap of capabilityTable[c] || []) out.add(cap);
  return Array.from(out);
}

const LAYERS: Layer[] = ["heat", "water", "stone", "growth", "air", "light", "rot", "ether", "steam", "silt", "ash", "frost", "spore", "silver", "glass"];

function effectCost(e: Effect, charm: boolean): number {
  if (charm) return 0;
  switch (e.kind) {
    case "transmute": case "push": return 1;
    case "spawn": case "move": return 3;
    case "adorn": case "mark": case "remember": case "release-ward": case "release-golem": return 0;
    case "ward": case "bind-automaton": case "bind-charter": case "at": return 5;
    case "checkpoint": return 2;
    case "craft": case "sluice": return 2;
    case "transfer": case "act": case "speak": return 1;
    case "bargain": return 2;
    case "against": return 4;
    default: return 1;
  }
}

function capabilityFor(e: Effect): Capability | null {
  switch (e.kind) {
    case "transmute": return "transmute";
    case "push": return "push";
    case "spawn": return "spawn";
    case "move": return "move";
    case "transfer": return "transfer";
    case "mark": return "mark";
    case "adorn": return null;
    case "sluice": return "sluice";
    case "craft": return "craft";
    case "at": case "checkpoint": return "time";
    case "ward": return "ward";
    case "release-ward": return null;
    case "speak": case "bargain": return "voice";
    case "bind-automaton": case "bind-charter": case "act": return "bind";
    case "release-golem": return null;
    case "against": return "against";
    case "remember": return null;
  }
}

function cellOf(e: Effect): CellRef | null {
  switch (e.kind) {
    case "transmute": case "push": case "mark": case "adorn": return e.cell;
    case "spawn": return e.at;
    case "move": return e.to;
    default: return null;
  }
}

const DIRS: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export interface ApplyOptions { fork?: false; envelope: EffectEnvelope; tick: number; nextId: () => string; rehearsed: boolean }
export interface ApplyOutcome { receipts: Receipt[]; rejected: string[]; misfire: { kind: MisfireKind; note: string } | null; installed: PersistentSpell | null; etherSpent: number; deferred: Effect[] }

/** Reagent recipes: what the crafting cell must hold, and what it consumes. */
export const CRAFT_RECIPES: Record<Reagent, { needs: Partial<Record<Layer, number>>; consumes: Partial<Record<Layer, number>>; reagentIn?: Partial<Record<Reagent, number>>; species?: string; when?: (state: EstateState) => boolean; note: string }> = {
  ash: { needs: { heat: 5, growth: 2 }, consumes: { growth: 2 }, note: "fire on growth" },
  salt: { needs: { heat: 3, water: 3 }, consumes: { water: 3 }, note: "evaporating marsh water in the foundry" },
  sap: { needs: {}, consumes: {}, species: "apple", when: (s) => s.sky.season === "spring", note: "orchard trees in spring, tapped" },
  silver: { needs: { silver: 1 }, consumes: { silver: 1 }, note: "the silver seam, hauled" },
  glass: { needs: { heat: 6, ether: 2 }, consumes: { ether: 2 }, reagentIn: { silver: 1 }, note: "silver under heat with ether" },
  "moon-ether": { needs: { ether: 1 }, consumes: { ether: 1 }, species: "moonbloom", when: (s) => s.sky.moon === 4 && (s.sky.hour < 5 || s.sky.hour > 19), note: "night house blooms under a full moon" },
  bone: { needs: {}, consumes: {}, when: (s) => !!s.regions.boneyard, note: "the boneyard, with the Hearth's consent" },
  seed: { needs: { growth: 3 }, consumes: { growth: 1 }, note: "a saturated plant" },
  fibre: { needs: {}, consumes: { growth: 1 }, species: "reed", note: "reeds, cut" },
};

function findPlace(state: EstateState, name: string): { region: Region; x: number; y: number } | null {
  const lower = name.toLowerCase();
  for (const id of Object.keys(state.regions) as RegionId[]) {
    const r = state.regions[id];
    if (!r) continue;
    for (const k of Object.keys(r.places || {})) {
      const p = r.places[k]!;
      if (k.toLowerCase() === lower || p.name.toLowerCase() === lower || (p.trueName && p.trueName.toLowerCase() === lower)) return { region: r, x: p.x, y: p.y };
    }
  }
  const e = state.entities[name];
  if (e && state.regions[e.region]) return { region: state.regions[e.region]!, x: e.x, y: e.y };
  return null;
}

function inventoryOf(state: EstateState, id: string): Partial<Record<Reagent, number>> | null {
  const a = state.apprentices[id];
  if (a) return (a.reagents ||= {});
  const e = state.entities[id];
  if (e) return (e.carrying ||= {});
  for (const s of Object.values(state.spirits)) if (s.trueName === id || s.id === id) return ((s as unknown as { reagents?: Partial<Record<Reagent, number>> }).reagents ||= {});
  return null;
}

export function validateAndApply(state: EstateState, record: SpellRecord, result: RunResult, opts: ApplyOptions): ApplyOutcome {
  const receipts: Receipt[] = [];
  const rejected: string[] = [];
  const deferred: Effect[] = [];
  let installed: PersistentSpell | null = null;
  let etherSpent = 0;
  const tier = record.tier;
  const charm = tier === "charm";
  const rule = REHEARSAL_RULES[tier] || REHEARSAL_RULES.cantrip;

  if (!result.ok && result.effects.length === 0) {
    return { receipts, rejected: [result.error ? "the writing failed: " + result.error : "the writing produced nothing"], misfire: null, installed, etherSpent, deferred };
  }
  if (rule.mustRehearse && !opts.rehearsed) {
    return { receipts, rejected: result.effects.map((e) => e.kind + ": unrehearsed"), misfire: { kind: "unrehearsed", note: "a " + tier + " must be rehearsed before it is cast; the writing was held" }, installed, etherSpent, deferred };
  }

  const caps = new Set<Capability>(opts.envelope.capabilities.concat(capabilitiesOf(record.earned)));
  const scope = new Set<RegionId>(opts.envelope.regions.length ? opts.envelope.regions : record.scope);
  const ceiling = Math.min(rule.cellCeiling, opts.envelope.cells || rule.cellCeiling);
  const budget = Math.min(record.etherBudget, opts.envelope.ether || record.etherBudget);
  const apprentice: Apprentice | undefined = state.apprentices[record.caster];
  const touchedCells = new Set<string>();
  let transmutedCells = 0;
  let misfire: ApplyOutcome["misfire"] = null;
  let overReached = false;
  let ceilinged = false;

  const receipt = (e: Effect, status: Receipt["status"], cost: number, reason?: string, before?: Receipt["before"], after?: Receipt["after"]): Receipt => {
    const r: Receipt = { id: opts.nextId(), effect: e, status, etherCost: status === "applied" ? cost : 0, tick: opts.tick };
    if (reason) r.reason = reason;
    if (before) r.before = before;
    if (after) r.after = after;
    receipts.push(r);
    if (status === "rejected") rejected.push(e.kind + ": " + reason);
    return r;
  };

  const pay = (cost: number, cell: CellRef | null): boolean => {
    if (cost <= 0) return true;
    if (etherSpent + cost > budget) return false;
    let remaining = cost;
    if (apprentice && apprentice.reserve > 0) {
      const take = Math.min(apprentice.reserve, remaining);
      apprentice.reserve -= take;
      remaining -= take;
    }
    if (remaining > 0 && cell) {
      const r = state.regions[cell.region];
      if (r) {
        const i = cell.y * r.w + cell.x;
        const have = r.layers.ether[i] || 0;
        const take = Math.min(have, remaining);
        r.layers.ether[i] = have - take;
        remaining -= take;
      }
    }
    if (remaining > 0 && !apprentice) remaining = 0; // spirits and the Moor pay from their own reserve, which the DO manages against the budget
    if (remaining > 0) return false;
    etherSpent += cost;
    return true;
  };

  for (const e of result.effects) {
    if (overReached) { receipt(e, "rejected", 0, "the ether ran out"); continue; }
    if (ceilinged) { receipt(e, "rejected", 0, "beyond the ceiling of a " + tier); continue; }
    const cap = capabilityFor(e);
    if (e.kind === "transmute" && !caps.has("transmute")) {
      // single-cell transmute is ungated
      const k = e.cell.region + ":" + e.cell.x + ":" + e.cell.y;
      if (!touchedCells.has(k) && transmutedCells >= 1) { receipt(e, "rejected", 0, "no element or quality was spoken; one cell only"); continue; }
    } else if (cap && !caps.has(cap)) {
      receipt(e, "rejected", 0, "the verse did not earn `" + cap + "`");
      continue;
    }
    const cell = cellOf(e);
    if (cell) {
      if (!scope.has(cell.region)) { receipt(e, "rejected", 0, "the verse does not reach " + cell.region); continue; }
      const region = state.regions[cell.region];
      if (!region || cell.x < 0 || cell.y < 0 || cell.x >= region.w || cell.y >= region.h) { receipt(e, "rejected", 0, "no such cell"); continue; }
      const k = cell.region + ":" + cell.x + ":" + cell.y;
      if (!touchedCells.has(k) && touchedCells.size + 1 > ceiling && e.kind !== "adorn") {
        ceilinged = true;
        misfire = misfire || { kind: "ceiling", note: "a " + tier + " holds " + ceiling + " cells; the rest of the writing was not heard" };
        receipt(e, "rejected", 0, "beyond the ceiling of a " + tier);
        continue;
      }
      touchedCells.add(k);
    }
    const cost = effectCost(e, charm);
    if (!pay(cost, cell)) {
      overReached = true;
      misfire = misfire || { kind: "over-reach", note: "the ether ran out at " + (cell ? cell.region + " " + cell.x + "," + cell.y : e.kind) + "; the spell stopped there" };
      receipt(e, "rejected", 0, "the ether ran out");
      continue;
    }
    // ── apply ──
    switch (e.kind) {
      case "transmute": {
        transmutedCells += 1;
        const region = state.regions[e.cell.region]!;
        const i = e.cell.y * region.w + e.cell.x;
        const before: Partial<Record<Layer, number>> = {};
        const after: Partial<Record<Layer, number>> = {};
        let rotRefused = false;
        for (const l of Object.keys(e.delta) as Layer[]) {
          if (LAYERS.indexOf(l) < 0) continue;
          const arr = (region.layers[l] ||= new Array(region.w * region.h).fill(0));
          const b = arr[i] || 0;
          let v = Math.max(0, b + (e.delta[l] || 0));
          if (l === "rot" && v > b && rotCoverage(region) >= 0.9) { rotRefused = true; v = b; }
          before[l] = b;
          after[l] = v;
          arr[i] = v;
        }
        receipt(e, "applied", cost, rotRefused ? "the marsh remembers: rot would not take the last of it" : undefined, before, after);
        break;
      }
      case "push": {
        const region = state.regions[e.cell.region]!;
        const i = e.cell.y * region.w + e.cell.x;
        const d = DIRS[e.dir];
        if (!d) { receipt(e, "rejected", 0, "no such direction"); break; }
        const nx = e.cell.x + d[0], ny = e.cell.y + d[1];
        if (nx < 0 || ny < 0 || nx >= region.w || ny >= region.h) { receipt(e, "rejected", 0, "pushed against the edge"); break; }
        const j = ny * region.w + nx;
        const before: Partial<Record<Layer, number>> = {};
        const after: Partial<Record<Layer, number>> = {};
        const force = Math.max(1, Math.min(8, Math.round(e.force)));
        // loose things move: silt first, then water, then loose stone (stone above the region's floor)
        for (const l of ["silt", "water", "stone"] as Layer[]) {
          const arr = (region.layers[l] ||= new Array(region.w * region.h).fill(0));
          const have = arr[i] || 0;
          if (have <= 0) continue;
          const moved = Math.min(have, force);
          before[l] = have;
          arr[i] = have - moved;
          arr[j] = (arr[j] || 0) + moved;
          after[l] = arr[i]!;
          break;
        }
        receipt(e, "applied", cost, undefined, before, after);
        break;
      }
      case "move": {
        const ent = state.entities[e.entity];
        if (!ent) { receipt(e, "rejected", 0, "nothing called " + e.entity); break; }
        ent.region = e.to.region; ent.x = e.to.x; ent.y = e.to.y;
        ent.last = "was moved";
        receipt(e, "applied", cost);
        break;
      }
      case "spawn": {
        const region = state.regions[e.at.region]!;
        const i = e.at.y * region.w + e.at.x;
        const creatures = ["sparrow", "vermin", "carp", "silt-worm", "moth", "warm-thing"];
        if (creatures.indexOf(e.what) >= 0) {
          const name = e.what + "-" + opts.nextId();
          const ent: Entity = { name, kind: "creature", sub: e.what as Entity["sub"], region: e.at.region, x: e.at.x, y: e.at.y, state: {}, carrying: {}, behaviour: null, bound: null, last: "arrived", tired: 0 };
          state.entities[name] = ent;
        } else {
          region.species[i] = e.what;
          region.layers.growth[i] = Math.max(region.layers.growth[i] || 0, 1);
        }
        receipt(e, "applied", cost);
        break;
      }
      case "transfer": {
        const from = inventoryOf(state, e.from);
        const to = inventoryOf(state, e.to);
        if (!from || !to) { receipt(e, "rejected", 0, "no such holder"); break; }
        const have = from[e.reagent] || 0;
        const n = Math.min(have, Math.max(0, Math.floor(e.n)));
        if (n <= 0) { receipt(e, "rejected", 0, e.from + " holds no " + e.reagent); break; }
        from[e.reagent] = have - n;
        to[e.reagent] = (to[e.reagent] || 0) + n;
        receipt(e, "applied", cost);
        break;
      }
      case "mark": {
        const region = state.regions[e.cell.region]!;
        const i = e.cell.y * region.w + e.cell.x;
        region.marks[String(i)] = { sigil: e.sigil, glow: e.glow, by: record.caster, spellId: record.id };
        receipt(e, "applied", cost);
        break;
      }
      case "adorn": {
        const region = state.regions[e.cell.region]!;
        const i = e.cell.y * region.w + e.cell.x;
        region.adorns[String(i)] = { ...e.charm, by: record.caster, spellId: record.id };
        if (e.charm.kind === "lantern" || e.charm.kind === "glow") region.layers.light[i] = Math.max(region.layers.light[i] || 0, 2);
        receipt(e, "applied", 0);
        break;
      }
      case "sluice": {
        let found = null as null | { s: Region["sluices"][number] };
        for (const id of Object.keys(state.regions) as RegionId[]) for (const s of state.regions[id]!.sluices || []) if (s.name === e.name) found = { s };
        if (!found) { receipt(e, "rejected", 0, "no sluice called " + e.name); break; }
        if (!scope.has(found.s.region)) { receipt(e, "rejected", 0, "the verse does not reach " + found.s.region); break; }
        found.s.state = e.state;
        receipt(e, "applied", cost);
        break;
      }
      case "craft": {
        const recipe = CRAFT_RECIPES[e.recipe];
        const at = findPlace(state, e.at);
        if (!recipe) { receipt(e, "rejected", 0, "no such reagent"); break; }
        if (!at) { receipt(e, "rejected", 0, "nowhere called " + e.at); break; }
        if (!scope.has(at.region.id)) { receipt(e, "rejected", 0, "the verse does not reach " + at.region.id); break; }
        if (recipe.when && !recipe.when(state)) { receipt(e, "rejected", 0, "not now: " + recipe.note); break; }
        const i = at.y * at.region.w + at.x;
        if (recipe.species && at.region.species[i] !== recipe.species) { receipt(e, "rejected", 0, "no " + recipe.species + " grows there"); break; }
        let ok = true;
        for (const l of Object.keys(recipe.needs) as Layer[]) if ((at.region.layers[l]?.[i] || 0) < (recipe.needs[l] || 0)) ok = false;
        const inv = inventoryOf(state, record.caster);
        for (const r of Object.keys(recipe.reagentIn || {}) as Reagent[]) if (!inv || (inv[r] || 0) < (recipe.reagentIn![r] || 0)) ok = false;
        if (!ok) { receipt(e, "rejected", 0, "the place lacks what " + e.recipe + " needs: " + recipe.note); break; }
        const n = Math.max(1, Math.min(8, Math.floor(e.n)));
        const before: Partial<Record<Layer, number>> = {};
        const after: Partial<Record<Layer, number>> = {};
        for (const l of Object.keys(recipe.consumes) as Layer[]) {
          const arr = at.region.layers[l]!;
          before[l] = arr[i] || 0;
          arr[i] = Math.max(0, (arr[i] || 0) - (recipe.consumes[l] || 0) * n);
          after[l] = arr[i]!;
        }
        for (const r of Object.keys(recipe.reagentIn || {}) as Reagent[]) inv![r] = (inv![r] || 0) - (recipe.reagentIn![r] || 0) * n;
        if (inv) inv[e.recipe] = (inv[e.recipe] || 0) + n;
        receipt(e, "applied", cost, undefined, before, after);
        break;
      }
      case "act": {
        const g = state.entities[e.golem];
        if (!g || g.kind !== "golem") { receipt(e, "rejected", 0, "no body called " + e.golem); break; }
        const region = state.regions[g.region];
        if (!region) { receipt(e, "rejected", 0, "the body is nowhere"); break; }
        const a = e.action;
        if (a.kind === "move" || a.kind === "strike") {
          const d = DIRS[a.dir];
          if (!d) { receipt(e, "rejected", 0, "no such direction"); break; }
          const nx = g.x + d[0], ny = g.y + d[1];
          if (nx < 0 || ny < 0 || nx >= region.w || ny >= region.h) { receipt(e, "rejected", 0, "the body met the edge"); break; }
          const j = ny * region.w + nx;
          if (a.kind === "move") {
            if ((region.layers.stone[j] || 0) > (region.layers.stone[g.y * region.w + g.x] || 0) + 6) { receipt(e, "rejected", 0, "stone in the way"); break; }
            g.x = nx; g.y = ny; g.last = "stepped " + a.dir;
          } else {
            const st = region.layers.stone[j] || 0;
            region.layers.stone[j] = Math.max(0, st - 2);
            region.layers.stone[g.y * region.w + g.x] = (region.layers.stone[g.y * region.w + g.x] || 0) + Math.min(2, st);
            g.last = "struck " + a.dir;
          }
          g.tired = (g.tired || 0) + 1;
        } else if (a.kind === "carry") {
          const i = g.y * region.w + g.x;
          const reagent = a.reagent || "silver";
          if (reagent === "silver" && (region.layers.silver[i] || 0) > 0) { region.layers.silver[i] = (region.layers.silver[i] || 0) - 1; g.carrying.silver = (g.carrying.silver || 0) + 1; g.last = "took up silver"; }
          else if (reagent === "ash" && (region.layers.ash[i] || 0) > 0) { region.layers.ash[i] = (region.layers.ash[i] || 0) - 1; g.carrying.ash = (g.carrying.ash || 0) + 1; g.last = "took up ash"; }
          else if ((region.layers.stone[i] || 0) > 0 && !a.reagent) { region.layers.stone[i] = (region.layers.stone[i] || 0) - 1; g.state["stone"] = Number(g.state["stone"] || 0) + 1; g.last = "took up stone"; }
          else { receipt(e, "rejected", 0, "nothing here to carry"); break; }
        } else if (a.kind === "place") {
          const i = g.y * region.w + g.x;
          if (Number(g.state["stone"] || 0) > 0) { g.state["stone"] = Number(g.state["stone"]) - 1; region.layers.stone[i] = (region.layers.stone[i] || 0) + 1; g.last = "set down stone"; }
          else {
            const held = (Object.keys(g.carrying) as Reagent[]).find((r) => (g.carrying[r] || 0) > 0);
            if (!held) { receipt(e, "rejected", 0, "carrying nothing"); break; }
            g.carrying[held] = (g.carrying[held] || 0) - 1;
            const l = held === "silver" ? "silver" : held === "ash" ? "ash" : null;
            if (l) region.layers[l][i] = (region.layers[l][i] || 0) + 1;
            g.last = "set down " + held;
          }
        } else if (a.kind === "tend") {
          const i = g.y * region.w + g.x;
          if ((region.layers.growth[i] || 0) > 0) region.layers.growth[i] = (region.layers.growth[i] || 0) + 1;
          region.layers.rot[i] = Math.max(0, (region.layers.rot[i] || 0) - 1);
          g.last = "tended";
        } else if (a.kind === "speak") {
          g.last = a.line;
          deferred.push({ kind: "speak", name: g.name, verse: a.line });
        }
        receipt(e, "applied", cost);
        break;
      }
      case "ward": {
        if (e.trigger.kind === "cell" && !scope.has(e.trigger.region)) { receipt(e, "rejected", 0, "the verse does not reach " + e.trigger.region); break; }
        deferred.push(e);
        if (!installed) installed = { kind: "ward", trigger: e.trigger, source: e.source, checkpoint: null, phase: 0, golem: null, upkeep: 1, watches: e.trigger.kind === "spell" ? [e.trigger.spellId] : [], active: true, dependsOn: record.earned.slice() };
        receipt(e, "applied", cost);
        break;
      }
      case "at": {
        deferred.push(e);
        if (!installed) installed = { kind: "working", trigger: { kind: "at", tick: e.tick }, source: e.source, checkpoint: e.state ?? null, phase: 0, golem: null, upkeep: 1, watches: [], active: true, dependsOn: record.earned.slice() };
        receipt(e, "applied", cost);
        break;
      }
      case "checkpoint": {
        deferred.push(e);
        installed = { kind: tier === "ritual" ? "ritual" : "working", trigger: (installed as PersistentSpell | null)?.trigger ?? null, source: record.writing || "", checkpoint: e.state, phase: e.phase, golem: null, upkeep: 1, watches: [], active: true, dependsOn: record.earned.slice() };
        receipt(e, "applied", cost);
        break;
      }
      case "bind-automaton": case "bind-charter": {
        const g = state.entities[e.golem];
        if (!g || g.kind !== "golem") { receipt(e, "rejected", 0, "no body called " + e.golem); break; }
        deferred.push(e);
        if (e.kind === "bind-automaton") {
          g.bound = { mode: "automaton", spellId: record.id, source: e.source };
          installed = { kind: "automaton", trigger: { kind: "sky", event: "tick" }, source: e.source, checkpoint: null, phase: 0, golem: e.golem, upkeep: 2, watches: [], active: true, dependsOn: record.earned.slice() };
        } else {
          g.bound = { mode: "charter", spellId: record.id, charter: e.charter };
          installed = { kind: "charter", trigger: null, source: e.charter, checkpoint: null, phase: 0, golem: e.golem, upkeep: 2, watches: [], active: true, dependsOn: record.earned.slice() };
        }
        g.last = "was bound";
        receipt(e, "applied", cost);
        break;
      }
      case "release-golem": {
        const g = state.entities[e.golem];
        if (!g || g.kind !== "golem") { receipt(e, "rejected", 0, "no body called " + e.golem); break; }
        g.bound = null;
        g.last = "was released";
        deferred.push(e);
        receipt(e, "applied", 0);
        break;
      }
      case "release-ward": case "speak": case "bargain": case "against": {
        deferred.push(e);
        receipt(e, "applied", cost);
        break;
      }
      case "remember": {
        deferred.push(e);
        receipt(e, "applied", 0);
        break;
      }
    }
  }
  for (const k of Object.keys(result.memory || {})) deferred.push({ kind: "remember", key: k, value: result.memory[k] });
  if (result.error && !misfire && receipts.some((r) => r.status === "applied")) rejected.push("the writing stopped early: " + result.error);
  return { receipts, rejected, misfire, installed, etherSpent, deferred };
}

function rotCoverage(region: Region): number {
  const rot = region.layers.rot || [];
  let n = 0;
  for (let i = 0; i < region.w * region.h; i++) if ((rot[i] || 0) > 0) n += 1;
  return region.w * region.h ? n / (region.w * region.h) : 0;
}

export interface SnapshotOptions { regions: RegionId[]; fork: boolean; envelope: EffectEnvelope; workings: Snapshot["workings"]; utterances: Utterance[]; memory: Record<string, unknown>; trigger?: Snapshot["trigger"]; senses?: Senses }

export function casterOf(state: EstateState, id: string, budget: number): Caster {
  const a = state.apprentices[id];
  if (a) return { id: a.id, name: a.name, reserve: a.reserve, reserveMax: a.reserveMax, reagents: { ...a.reagents }, words: a.words.slice(), names: a.names.slice(), foci: a.foci.slice(), region: a.region, x: a.x, y: a.y, active: state.activeSpells.slice() };
  const spirit = Object.values(state.spirits).find((s) => s.id === id || s.trueName === id);
  if (spirit) return { id: spirit.id, name: spirit.title, reserve: spirit.reserve, reserveMax: spirit.reserve, reagents: {}, words: spirit.knows.slice(), names: [spirit.trueName], foci: [], region: spirit.anchor.region, x: spirit.anchor.x, y: spirit.anchor.y, active: [] };
  const g = state.entities[id];
  if (g) return { id: g.name, name: g.name, reserve: budget, reserveMax: budget, reagents: { ...g.carrying }, words: [], names: [g.name], foci: [], region: g.region, x: g.x, y: g.y, active: [] };
  return { id, name: id, reserve: budget, reserveMax: budget, reagents: {}, words: [], names: [], foci: [], region: "near-moor", x: 0, y: 0, active: [] };
}

/** Deep-copies the listed regions and the entities in them; the binding works on the copy. */
export function makeSnapshot(state: EstateState, record: SpellRecord, opts: SnapshotOptions): Snapshot {
  const regions: Region[] = [];
  const wanted = new Set<RegionId>(opts.regions);
  for (const id of opts.regions) {
    const r = state.regions[id];
    if (r) regions.push(JSON.parse(JSON.stringify(r)) as Region);
  }
  const entities: Entity[] = [];
  for (const e of Object.values(state.entities)) if (wanted.has(e.region) || e.kind === "golem") entities.push(JSON.parse(JSON.stringify(e)) as Entity);
  const snap: Snapshot = {
    spellId: record.id,
    record: { id: record.id, caster: record.caster, tier: record.tier, earned: record.earned.slice(), scope: record.scope.slice(), etherBudget: record.etherBudget, coCasters: record.coCasters.slice() },
    regions,
    entities,
    sky: JSON.parse(JSON.stringify(state.sky)) as Snapshot["sky"],
    caster: casterOf(state, record.caster, record.etherBudget),
    workings: opts.workings,
    utterances: opts.utterances,
    memory: JSON.parse(JSON.stringify(opts.memory || {})) as Record<string, unknown>,
    envelope: opts.envelope,
    fork: opts.fork,
  };
  if (opts.trigger) snap.trigger = opts.trigger;
  if (opts.senses) snap.senses = opts.senses;
  return snap;
}
