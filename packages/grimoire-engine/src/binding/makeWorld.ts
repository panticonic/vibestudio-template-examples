/**
 * The World binding: what a spell's writing sees.
 *
 * `makeWorld` is ONE self-contained function. Its source is shipped as text
 * (`bindingPrelude()`) into whichever sandbox runs the writing — the
 * familiar's own eval, or the world's — so it must not reference anything
 * outside its own body. Reads are local to the snapshot and reflect effects
 * already batched in the run; effects are validated against the envelope
 * here (with in-world wording) and again by the world at commit.
 */
import type {
  Caster, Cell, CellRef, Dir, Effect, Entity, GolemAction, Layer, Offer, Rect, Region, RegionId, Rehearsal, RunResult, Senses, Sluice, SluiceState, Snapshot, SpeciesId, Sky, Tier, Trigger, Utterance, CharmKind, Reagent, CreatureKind,
} from "../types.js";

export const BINDING_VERSION = "grimoire-binding/1";

export interface EffectRef { id: string; kind: Effect["kind"] }

export interface WorldBinding {
  read: {
    cell(region: RegionId, x: number, y: number): Cell;
    region(region: RegionId, bounds?: Rect): Cell[];
    neighbours(cell: CellRef, radius?: number): Cell[];
    elevation(region: RegionId): number[];
    flows(region: RegionId): Array<{ from: CellRef; to: CellRef; kind: "water" | "wind" | "ether" | "heat"; rate: number }>;
    entity(name: string): Entity | null;
    entities(region?: RegionId, filter?: { kind?: string; sub?: string }): Entity[];
    species(cell: CellRef): SpeciesId | null;
    sky(): Sky;
    bell(): number;
    self(): Caster;
    spell(name: string): { name: string; tier: Tier; source: string } | null;
    sluices(region?: RegionId): Sluice[];
    places(region: RegionId): Record<string, { x: number; y: number; name: string; trueName?: string }>;
    memory: Record<string, unknown>;
    trigger(): Snapshot["trigger"] | undefined;
    senses(): Senses | undefined;
    listen(name: string, since?: number): Utterance[];
  };
  effect: {
    transmute(cell: CellRef, delta: Partial<Record<Layer, number>>): EffectRef;
    push(cell: CellRef, dir: Dir, force: number): EffectRef;
    move(entity: string, to: CellRef): EffectRef;
    spawn(what: CreatureKind | SpeciesId, at: CellRef): EffectRef;
    transfer(from: string, to: string, reagent: Reagent, n: number): EffectRef;
    mark(cell: CellRef, sigil: string, glow?: string): EffectRef;
    adorn(cell: CellRef, charm: { kind: CharmKind; colour?: string; intensity?: number; label?: string }): EffectRef;
    sluice(name: string, state: SluiceState): EffectRef;
    craft(recipe: Reagent, at: string, n?: number): EffectRef;
  };
  time: {
    now(): number;
    at(tick: number, source: string, state?: unknown): EffectRef;
    checkpoint(state: unknown, phase?: number): EffectRef;
  };
  on: {
    cell(region: RegionId, predicate: string | ((cell: Cell) => boolean), source: string, rect?: Rect): EffectRef;
    entity(name: string, event: "moves" | "speaks" | "carries" | "tired" | "arrives", source: string): EffectRef;
    speech(name: string, source: string): EffectRef;
    sky(event: Extract<Trigger, { kind: "sky" }>["event"], source: string): EffectRef;
    spell(spellId: string, event: "fires" | "misfires" | "released", source: string): EffectRef;
    release(wardId: string): EffectRef;
  };
  voice: {
    speak(name: string, verse: string): EffectRef;
    bargain(name: string, offer: Offer): EffectRef;
  };
  bind: {
    automaton(golem: string, source: string): EffectRef;
    charter(golem: string, charter: string): EffectRef;
    release(golem: string): EffectRef;
    senses(golem: string): Senses | undefined;
    act(golem: string, action: GolemAction): EffectRef;
  };
  against: {
    release(spellId: string): EffectRef;
    redirect(spellId: string, trigger: Trigger): EffectRef;
    starve(spellId: string): EffectRef;
  };
  rehearse<T>(fn: (w: WorldBinding) => T): { value: T; effects: Effect[]; touched: number; ether: number };
  invoke(name: string, args?: unknown): unknown;
  cost(plan: (() => void) | ((w: WorldBinding) => void)): { cells: number; ether: number; effects: number };
  log(...args: unknown[]): void;
  remember(key: string, value: unknown): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function makeWorld(snapshot: Snapshot): { world: WorldBinding; finish(): RunResult } {
  // ── working copies: reads reflect effects batched in this run ──
  const LAYERS: Layer[] = ["heat", "water", "stone", "growth", "air", "light", "rot", "ether", "steam", "silt", "ash", "frost", "spore", "silver", "glass"];
  const regions: Record<string, Region> = {};
  for (const r of snapshot.regions) regions[r.id] = JSON.parse(JSON.stringify(r));
  const entities: Record<string, Entity> = {};
  for (const e of snapshot.entities) entities[e.name] = JSON.parse(JSON.stringify(e));
  const memory: Record<string, unknown> = Object.assign({}, snapshot.memory || {});
  const memoryWrites: Record<string, unknown> = {};
  const envelope = snapshot.envelope;
  const caps: string[] = envelope.capabilities || [];
  const effects: Effect[] = [];
  const log: string[] = [];
  const touched = new Set<string>();
  let ether = 0;
  let seq = 0;

  const fail = (msg: string): never => { throw new Error(msg); };
  const has = (cap: string): boolean => caps.indexOf(cap as any) >= 0;
  const need = (cap: string, what: string): void => {
    if (!has(cap)) fail("the world does not hear `" + what + "` from this verse: " + capabilityHint(cap));
  };
  function capabilityHint(cap: string): string {
    switch (cap) {
      case "transmute": case "push": case "spawn": return "no element or quality was spoken";
      case "move": case "transfer": case "mark": case "sluice": return "no true name of the thing";
      case "craft": return "no reagent word";
      case "ward": return "no binding word (once, while, until, whenever, at)";
      case "time": return "no binding word for time";
      case "voice": return "no true name of a spirit or person";
      case "bind": return "no golem's name with a binding word";
      case "against": return "no spell's name with kaer or hara";
      case "scry-deep": return "mira was not spoken";
      case "estate": return "the estate's own name is not known";
      default: return "the verse lacks it";
    }
  }
  const regionOf = (id: string): Region => regions[id] || fail("no region called `" + id + "` is in this working; the verse reaches " + Object.keys(regions).join(", "));
  const inScope = (id: string): void => {
    if (envelope.regions.indexOf(id as RegionId) < 0) fail("the verse does not reach `" + id + "`; it reaches " + envelope.regions.join(", "));
  };
  const idx = (r: Region, x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) fail("no cell at " + x + "," + y + " in " + r.id + " (" + r.w + "×" + r.h + ")");
    return y * r.w + x;
  };
  const key = (c: CellRef): string => c.region + ":" + c.x + ":" + c.y;
  const touch = (c: CellRef, cost: number): void => {
    inScope(c.region);
    touched.add(key(c));
    if (touched.size > envelope.cells) fail("the verse cannot hold this many cells (" + touched.size + " of " + envelope.cells + "); a stronger tier or a smaller subject");
    ether += cost;
  };
  const push = (e: Effect): EffectRef => {
    effects.push(e);
    seq += 1;
    return { id: "e" + seq, kind: e.kind };
  };
  const cellAt = (regionId: string, x: number, y: number): Cell => {
    const r = regionOf(regionId);
    const i = idx(r, x, y);
    const c: any = { region: r.id, x, y, elevation: r.elevation[i] || 0, ley: !!(r.ley && r.ley[i]), roofed: !!(r.roof && r.roof[i]), species: (r.species && r.species[i]) || null, mark: (r.marks && r.marks[String(i)]) || null, adorn: (r.adorns && r.adorns[String(i)]) || null };
    for (const l of LAYERS) c[l] = (r.layers[l] && r.layers[l][i]) || 0;
    return c as Cell;
  };
  const sensesFor = (name: string): Senses | undefined => {
    const e = entities[name];
    if (!e) return undefined;
    const r = regions[e.region];
    if (!r) return snapshot.senses && snapshot.senses.self && snapshot.senses.self.name === name ? snapshot.senses : undefined;
    const around: Cell[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = e.x + dx, y = e.y + dy;
      if (x >= 0 && y >= 0 && x < r.w && y < r.h) around.push(cellAt(r.id, x, y));
    }
    const nearby: Entity[] = [];
    for (const k of Object.keys(entities)) { const o = entities[k]; if (o && o.name !== name && o.region === e.region && Math.abs(o.x - e.x) <= 3 && Math.abs(o.y - e.y) <= 3) nearby.push(o); }
    const heard = (snapshot.utterances || []).filter((u) => u.to === name || u.to === null).slice(-6);
    return { self: e, cell: cellAt(r.id, e.x, e.y), around, heard, carrying: e.carrying || {}, nearby };
  };

  const read: WorldBinding["read"] = {
    cell: (region, x, y) => cellAt(region, x, y),
    region: (region, bounds) => {
      const r = regionOf(region);
      const out: Cell[] = [];
      const x0 = bounds ? Math.max(0, bounds.x) : 0, y0 = bounds ? Math.max(0, bounds.y) : 0;
      const x1 = bounds ? Math.min(r.w, bounds.x + bounds.w) : r.w, y1 = bounds ? Math.min(r.h, bounds.y + bounds.h) : r.h;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(cellAt(r.id, x, y));
      return out;
    },
    neighbours: (cell, radius) => {
      const rad = radius || 1;
      const r = regionOf(cell.region);
      const out: Cell[] = [];
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = cell.x + dx, y = cell.y + dy;
        if (x >= 0 && y >= 0 && x < r.w && y < r.h) out.push(cellAt(r.id, x, y));
      }
      return out;
    },
    elevation: (region) => regionOf(region).elevation.slice(),
    flows: (region) => {
      const r = regionOf(region);
      const out: Array<{ from: CellRef; to: CellRef; kind: "water" | "wind" | "ether" | "heat"; rate: number }> = [];
      const water = r.layers.water || [];
      const ley = r.ley || [];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const i = y * r.w + x;
        if ((water[i] || 0) > 0) {
          let best = -1, bestDrop = 0;
          for (const d of dirs) {
            const nx = x + d[0]!, ny = y + d[1]!;
            if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
            const j = ny * r.w + nx;
            const drop = (r.elevation[i] || 0) + (water[i] || 0) - ((r.elevation[j] || 0) + (water[j] || 0));
            if (drop > bestDrop) { bestDrop = drop; best = j; }
          }
          if (best >= 0) out.push({ from: { region: r.id, x, y }, to: { region: r.id, x: best % r.w, y: Math.floor(best / r.w) }, kind: "water", rate: Math.min(water[i] || 0, Math.ceil(bestDrop / 2)) });
        }
        if (ley[i]) {
          for (const d of dirs) {
            const nx = x + d[0]!, ny = y + d[1]!;
            if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
            const j = ny * r.w + nx;
            if (ley[j] && j > i) out.push({ from: { region: r.id, x, y }, to: { region: r.id, x: nx, y: ny }, kind: "ether", rate: 2 });
          }
        }
      }
      return out;
    },
    entity: (name) => entities[name] || null,
    entities: (region, filter) => Object.keys(entities).map((k) => entities[k]!).filter((e) => (!region || e.region === region) && (!filter || ((!filter.kind || e.kind === filter.kind) && (!filter.sub || e.sub === filter.sub)))),
    species: (cell) => (cellAt(cell.region, cell.x, cell.y).species as SpeciesId | null),
    sky: () => snapshot.sky,
    bell: () => snapshot.sky.bell,
    self: () => snapshot.caster,
    spell: (name) => {
      const w = snapshot.workings && snapshot.workings[name];
      return w ? { name: w.name, tier: w.tier, source: w.source } : null;
    },
    sluices: (region) => {
      const out: Sluice[] = [];
      for (const id of Object.keys(regions)) if (!region || id === region) for (const s of regions[id]!.sluices || []) out.push(s);
      return out;
    },
    places: (region) => regionOf(region).places || {},
    memory,
    trigger: () => snapshot.trigger,
    senses: () => snapshot.senses || (snapshot.caster && entities[snapshot.caster.id] ? sensesFor(snapshot.caster.id) : undefined),
    listen: (name, since) => (snapshot.utterances || []).filter((u) => (u.by === name || u.to === name) && (since === undefined || u.tick >= since)),
  };

  let transmuted = 0;
  const effect: WorldBinding["effect"] = {
    transmute: (cell, delta) => {
      const k = key(cell);
      if (!has("transmute") && !touched.has(k) && transmuted >= 1) fail("the world does not hear `transmute` beyond one cell from this verse: no element or quality was spoken");
      const r = regionOf(cell.region);
      const i = idx(r, cell.x, cell.y);
      touch(cell, 1);
      transmuted += 1;
      for (const l of Object.keys(delta) as Layer[]) {
        if (LAYERS.indexOf(l) < 0) fail("no element called `" + l + "`; the elements are " + LAYERS.join(", "));
        if (!r.layers[l]) r.layers[l] = new Array(r.w * r.h).fill(0);
        r.layers[l]![i] = Math.max(0, (r.layers[l]![i] || 0) + (delta[l] || 0));
      }
      return push({ kind: "transmute", cell: { region: cell.region, x: cell.x, y: cell.y }, delta: Object.assign({}, delta) });
    },
    push: (cell, dir, force) => {
      need("push", "push");
      touch(cell, 1);
      return push({ kind: "push", cell: { region: cell.region, x: cell.x, y: cell.y }, dir, force });
    },
    move: (name, to) => {
      need("move", "move");
      const e = entities[name] || fail("nothing called `" + name + "` is in this working");
      inScope(to.region);
      idx(regionOf(to.region), to.x, to.y);
      e.region = to.region; e.x = to.x; e.y = to.y;
      ether += 3;
      return push({ kind: "move", entity: name, to: { region: to.region, x: to.x, y: to.y } });
    },
    spawn: (what, at) => {
      need("spawn", "spawn");
      touch(at, 3);
      return push({ kind: "spawn", what, at: { region: at.region, x: at.x, y: at.y } });
    },
    transfer: (from, to, reagent, n) => {
      need("transfer", "transfer");
      ether += 1;
      return push({ kind: "transfer", from, to, reagent, n });
    },
    mark: (cell, sigil, glow) => {
      need("mark", "mark");
      inScope(cell.region);
      touched.add(key(cell));
      return push({ kind: "mark", cell: { region: cell.region, x: cell.x, y: cell.y }, sigil, glow });
    },
    adorn: (cell, charm) => {
      inScope(cell.region);
      const r = regionOf(cell.region);
      const i = idx(r, cell.x, cell.y);
      if (!r.adorns) r.adorns = {};
      r.adorns[String(i)] = Object.assign({ by: snapshot.caster.id, spellId: snapshot.spellId }, charm) as any;
      return push({ kind: "adorn", cell: { region: cell.region, x: cell.x, y: cell.y }, charm: Object.assign({}, charm) });
    },
    sluice: (name, state) => {
      need("sluice", "sluice");
      let found: Sluice | null = null;
      for (const id of Object.keys(regions)) for (const s of regions[id]!.sluices || []) if (s.name === name) found = s;
      if (!found) fail("no sluice called `" + name + "` is in this working");
      inScope(found!.region);
      found!.state = state;
      ether += 2;
      return push({ kind: "sluice", name, state });
    },
    craft: (recipe, at, n) => {
      need("craft", "craft");
      ether += 2;
      return push({ kind: "craft", recipe, at, n: n || 1 });
    },
  };

  const time: WorldBinding["time"] = {
    now: () => snapshot.sky.tick,
    at: (tick, source, state) => { need("time", "at"); ether += 5; return push({ kind: "at", tick, source, state }); },
    checkpoint: (state, phase) => { need("time", "checkpoint"); return push({ kind: "checkpoint", state, phase: phase || 0 }); },
  };

  const on: WorldBinding["on"] = {
    cell: (region, predicate, source, rect) => {
      need("ward", "whenever");
      inScope(region);
      regionOf(region);
      const pred = typeof predicate === "function" ? predicate.toString() : String(predicate);
      ether += 5;
      return push({ kind: "ward", trigger: { kind: "cell", region, rect, predicate: pred }, source });
    },
    entity: (name, event, source) => { need("ward", "whenever"); ether += 5; return push({ kind: "ward", trigger: { kind: "entity", name, event }, source }); },
    speech: (name, source) => { need("ward", "whenever"); ether += 5; return push({ kind: "ward", trigger: { kind: "speech", name }, source }); },
    sky: (event, source) => { need("ward", "whenever"); ether += 5; return push({ kind: "ward", trigger: { kind: "sky", event }, source }); },
    spell: (spellId, event, source) => { need("ward", "whenever"); ether += 5; return push({ kind: "ward", trigger: { kind: "spell", spellId, event }, source }); },
    release: (wardId) => push({ kind: "release-ward", wardId }),
  };

  const voice: WorldBinding["voice"] = {
    speak: (name, verse) => { need("voice", "speak"); return push({ kind: "speak", name, verse }); },
    bargain: (name, offer) => { need("voice", "bargain"); return push({ kind: "bargain", name, offer }); },
  };

  const bind: WorldBinding["bind"] = {
    automaton: (golem, source) => { need("bind", "bind"); ether += 5; return push({ kind: "bind-automaton", golem, source }); },
    charter: (golem, charter) => { need("bind", "bind"); ether += 5; return push({ kind: "bind-charter", golem, charter }); },
    release: (golem) => push({ kind: "release-golem", golem }),
    senses: (golem) => sensesFor(golem),
    act: (golem, action) => {
      need("bind", "act");
      const e = entities[golem] || fail("no body called `" + golem + "` is in this working");
      if (action.kind === "move") {
        const d: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
        const v = d[action.dir] || fail("no direction `" + (action as any).dir + "`");
        const r = regions[e.region];
        if (r) { const nx = e.x + v[0], ny = e.y + v[1]; if (nx >= 0 && ny >= 0 && nx < r.w && ny < r.h) { e.x = nx; e.y = ny; } }
      }
      ether += 1;
      return push({ kind: "act", golem, action });
    },
  };

  const against: WorldBinding["against"] = {
    release: (spellId) => { need("against", "release"); return push({ kind: "against", spellId, how: "release" }); },
    redirect: (spellId, trigger) => { need("against", "redirect"); return push({ kind: "against", spellId, how: "redirect", trigger }); },
    starve: (spellId) => { need("against", "starve"); return push({ kind: "against", spellId, how: "starve" }); },
  };

  const forkSnapshot = (): Snapshot => JSON.parse(JSON.stringify({
    spellId: snapshot.spellId, record: snapshot.record, regions: Object.keys(regions).map((k) => regions[k]), entities: Object.keys(entities).map((k) => entities[k]),
    sky: snapshot.sky, caster: snapshot.caster, workings: snapshot.workings || {}, utterances: snapshot.utterances || [], memory, trigger: snapshot.trigger, senses: snapshot.senses, envelope, fork: true,
  }));

  const world: WorldBinding = {
    read, effect, time, on, voice, bind, against,
    rehearse: (fn) => {
      const inner = makeWorld(forkSnapshot());
      const value = fn(inner.world);
      const done = (v: any) => { const r = inner.finish(); return { value: v, effects: r.effects, touched: r.touched, ether: r.ether }; };
      if (value && typeof (value as any).then === "function") return (value as any).then(done) as any;
      return done(value);
    },
    invoke: (name, args) => {
      const w = snapshot.workings && snapshot.workings[name];
      if (!w) fail("no working called `" + name + "` is in the spellbook");
      const AsyncFn = Object.getPrototypeOf(async function () { /* */ }).constructor as any;
      const fn = new AsyncFn("world", "w", "read", "effect", "time", "on", "voice", "bind", "against", "args", w!.source);
      return fn(world, world, read, effect, time, on, voice, bind, against, args);
    },
    cost: (plan) => {
      // A plan written against the fork (`cost((w) => …)`) is measured cleanly. A plan that
      // closes over the outer `world` is measured by its delta on the batch, then withdrawn.
      if (plan.length >= 1) {
        const inner = makeWorld(forkSnapshot());
        (plan as unknown as (w: WorldBinding) => void)(inner.world);
        const r = inner.finish();
        return { cells: r.touched, ether: r.ether, effects: r.effects.length };
      }
      const before = effects.length, beforeTouched = Array.from(touched), beforeEther = ether;
      (plan as () => void)();
      const added = effects.splice(before);
      const cells = touched.size - beforeTouched.length;
      const spent = ether - beforeEther;
      touched.clear();
      for (const k of beforeTouched) touched.add(k);
      ether = beforeEther;
      return { cells, ether: spent, effects: added.length };
    },
    log: (...args) => { log.push(args.map((a) => (typeof a === "string" ? a : safeString(a))).join(" ")); },
    remember: (k, v) => { memory[k] = v; memoryWrites[k] = v; },
  };
  function safeString(a: unknown): string {
    try { return JSON.stringify(a); } catch (_e) { return String(a); }
  }

  const finish = (): RunResult => {
    const earned = (snapshot.record && snapshot.record.earned) || [];
    const scaled = earned.length >= 3 ? ether * 0.7 : ether;
    return { ok: true, effects: effects.slice(), log: log.slice(), touched: touched.size, ether: Math.round(scaled), memory: Object.assign({}, memoryWrites) };
  };
  return { world, finish };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The prelude every program starts with: the binding as text. */
export function bindingPrelude(): string {
  // Bundlers (esbuild keepNames) may inject a `__name` helper into the serialised function; shim it.
  return `var __name = typeof __name === "function" ? __name : (f) => f;\nconst __makeWorld = ${makeWorld.toString()};\n`;
}

/**
 * A program that, evaluated as an async function body (top-level `return`
 * and `await` allowed, as in the eval sandbox), runs `source` against the
 * snapshot and returns a RunResult. `source` is placed verbatim.
 */
export function composeProgram(source: string, snapshot: Snapshot): string {
  return [
    `// ${BINDING_VERSION}`,
    bindingPrelude(),
    `const __snap = ${JSON.stringify(snapshot)};`,
    `const { world, finish } = __makeWorld(__snap);`,
    `const __spell = async (world, w, read, effect, time, on, voice, bind, against) => {`,
    source,
    `};`,
    `let __value;`,
    `try {`,
    `  __value = await __spell(world, world, world.read, world.effect, world.time, world.on, world.voice, world.bind, world.against);`,
    `} catch (__e) {`,
    `  const __msg = String((__e && __e.message) || __e);`,
    `  world.log("error: " + __msg);`,
    `  const __r = finish();`,
    `  __r.ok = false; __r.error = __msg;`,
    `  return __r;`,
    `}`,
    `const __out = finish();`,
    `if (__value !== undefined) __out.returnValue = __value;`,
    `return __out;`,
  ].join("\n");
}

export type SourceExecutor = (program: string) => Promise<RunResult>;

/** Node/test executor. The world's own executor goes through the eval service. */
export const localExecutor: SourceExecutor = async (program) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as any;
  let fn: () => Promise<unknown>;
  try {
    fn = new AsyncFunction(program);
  } catch (err) {
    return { ok: false, effects: [], log: [], error: "the writing does not parse: " + (err instanceof Error ? err.message : String(err)), touched: 0, ether: 0, memory: {} };
  }
  try {
    const out = await fn();
    if (out && typeof out === "object" && "effects" in (out as object)) return out as RunResult;
    return { ok: false, effects: [], log: [], error: "the writing returned nothing the world could read", touched: 0, ether: 0, memory: {} };
  } catch (err) {
    return { ok: false, effects: [], log: [], error: err instanceof Error ? err.message : String(err), touched: 0, ether: 0, memory: {} };
  }
};

export function runLocally(source: string, snapshot: Snapshot): Promise<RunResult> {
  return localExecutor(composeProgram(source, snapshot));
}

const REGION_TITLES: Partial<Record<string, string>> = {
  manor: "the manor", garden: "the kitchen garden", scriptorium: "the scriptorium", library: "the library", chapel: "the chapel", orchard: "the orchard",
  "cold-house": "the cold house", "hot-house": "the hot house", "night-house": "the night house", "upper-reach": "the upper reach", mill: "the mill",
  "lower-reach": "the marsh", grate: "the grate", "mine-upper": "the upper galleries", "mine-deep": "the deep", "silver-seam": "the silver seam", foundry: "the foundry",
  glassworks: "the glassworks", "bell-tower": "the bell tower", boneyard: "the boneyard", ridge: "the ridge", observatory: "the observatory", green: "the green",
  "near-moor": "the near moor", barrows: "the barrows", "far-fen": "the far fen", "road-out": "the road out",
};

export function regionTitle(id: string): string {
  return REGION_TITLES[id] || id;
}

function signed(n: number): string {
  return n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0";
}

/** Summarise a run for the familiar and the scrying page. */
export function summariseRun(result: RunResult, snapshot: Snapshot): Rehearsal {
  const byRegion: Record<string, { layers: Record<string, number>; cells: Set<string> }> = {};
  const counts: Record<string, number> = {};
  for (const e of result.effects) {
    counts[e.kind] = (counts[e.kind] || 0) + 1;
    if (e.kind === "transmute") {
      const b = (byRegion[e.cell.region] ||= { layers: {}, cells: new Set() });
      b.cells.add(e.cell.x + ":" + e.cell.y);
      for (const l of Object.keys(e.delta)) b.layers[l] = (b.layers[l] || 0) + (e.delta[l as Layer] || 0);
    } else if ("cell" in e && e.cell) {
      const b = (byRegion[e.cell.region] ||= { layers: {}, cells: new Set() });
      b.cells.add(e.cell.x + ":" + e.cell.y);
    }
  }
  const parts: string[] = [];
  for (const id of Object.keys(byRegion)) {
    const b = byRegion[id]!;
    const layerText = Object.keys(b.layers).filter((l) => b.layers[l] !== 0).map((l) => l + " " + signed(b.layers[l]!)).join(", ");
    parts.push((layerText || "touched") + " over " + b.cells.size + (b.cells.size === 1 ? " cell" : " cells") + " in " + regionTitle(id));
  }
  const other: string[] = [];
  const plural = (n: number, s: string, p: string) => n + " " + (n === 1 ? s : p);
  if (counts["ward"]) other.push(plural(counts["ward"], "ward", "wards") + " on " + (snapshot.envelope.regions.map(regionTitle).join(", ") || "the estate"));
  if (counts["adorn"]) other.push(plural(counts["adorn"], "charm", "charms"));
  if (counts["mark"]) other.push(plural(counts["mark"], "mark", "marks"));
  if (counts["spawn"]) other.push(plural(counts["spawn"], "thing", "things") + " brought");
  if (counts["move"]) other.push(plural(counts["move"], "thing", "things") + " moved");
  if (counts["sluice"]) other.push(plural(counts["sluice"], "sluice", "sluices") + " set");
  if (counts["craft"]) other.push(plural(counts["craft"], "reagent", "reagents") + " made");
  if (counts["speak"]) other.push("a spirit addressed");
  if (counts["bargain"]) other.push("a bargain offered");
  if (counts["bind-automaton"] || counts["bind-charter"]) other.push("a body bound");
  if (counts["release-golem"]) other.push("a body released");
  if (counts["against"]) other.push("a working answered");
  if (counts["at"] || counts["checkpoint"]) other.push("a continuation set");
  const all = parts.concat(other);
  let summary = all.length ? all.join("; ") : result.error ? "nothing happened: " + result.error : "nothing changed";
  if (result.error && all.length) summary += "; then it stopped: " + result.error;
  return { ok: result.ok, effects: result.effects, log: result.log, error: result.error, touched: result.touched, ether: result.ether, summary, returnValue: result.returnValue };
}

/** Read a RunResult back out of an eval-service result (`{ success, console, returnValue, error }`). */
export function runResultFromEval(result: { success: boolean; console?: string; returnValue?: unknown; error?: string }): RunResult {
  const log = result.console ? [result.console] : [];
  if (!result.success) return { ok: false, effects: [], log, error: result.error ?? "the writing failed", touched: 0, ether: 0, memory: {} };
  const value = result.returnValue as Partial<RunResult> | undefined;
  if (!value || typeof value !== "object" || !Array.isArray(value.effects)) {
    return { ok: false, effects: [], log, error: "the writing returned nothing the world can read", touched: 0, ether: 0, memory: {} };
  }
  return { ok: value.ok !== false, effects: value.effects, log: [...(value.log ?? []), ...log], error: value.error, returnValue: value.returnValue, touched: value.touched ?? 0, ether: value.ether ?? 0, memory: value.memory ?? {} };
}

/**
 * Evaluate a ward's cell predicate without code generation (workerd forbids
 * it outside the eval sandbox). Supports `cell.<field>` compared to numbers or
 * strings with `< <= > >= == === != !==`, joined by `&&`, `||`, `!` and
 * parentheses; arrow-function sources (`cell => …`, `(c) => …`) are unwrapped.
 * Anything else is false, and the ward's own source may re-check.
 */
export function evalCellPredicate(predicate: string, cell: Cell): boolean {
  let src = predicate.trim();
  const arrow = src.match(/^\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*([\s\S]*)$/);
  let name = "cell";
  if (arrow) { name = arrow[1]!; src = arrow[2]!.trim(); if (src.startsWith("{")) { const m = src.match(/return\s+([\s\S]*?);?\s*}$/); src = m ? m[1]! : "false"; } }
  const tokens = src.match(/\s*(\(|\)|&&|\|\||!==|===|!=|==|<=|>=|<|>|!|"[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|true|false|null|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*/g)?.map((t) => t.trim()).filter(Boolean) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const value = (): unknown => {
    const t = next();
    if (t === undefined) return undefined;
    if (t === "(") { const v = orExpr(); if (peek() === ")") next(); return v; }
    if (t === "!") return !truthy(value());
    if (t === "true") return true; if (t === "false") return false; if (t === "null") return null;
    if (/^-?\d/.test(t)) return Number(t);
    if (t.startsWith('"') || t.startsWith("'")) return t.slice(1, -1);
    const path = t.split(".");
    if (path[0] === name) { let v: unknown = cell; for (const p of path.slice(1)) v = v && typeof v === "object" ? (v as Record<string, unknown>)[p] : undefined; return v; }
    if (t === "Math") return undefined;
    return undefined;
  };
  const cmp = (): unknown => {
    let left = value();
    for (;;) {
      const op = peek();
      if (!op || !["<", "<=", ">", ">=", "==", "===", "!=", "!=="].includes(op)) return left;
      next();
      const right = value();
      const l = left as number, r = right as number;
      switch (op) {
        case "<": left = l < r; break; case "<=": left = l <= r; break; case ">": left = l > r; break; case ">=": left = l >= r; break;
        case "==": case "===": left = left === right; break; case "!=": case "!==": left = left !== right; break;
      }
    }
  };
  const andExpr = (): unknown => { let v = cmp(); while (peek() === "&&") { next(); const r = cmp(); v = truthy(v) && truthy(r); } return v; };
  const orExpr = (): unknown => { let v = andExpr(); while (peek() === "||") { next(); const r = andExpr(); v = truthy(v) || truthy(r); } return v; };
  const truthy = (v: unknown) => !!v;
  try { return truthy(orExpr()); } catch { return false; }
}
