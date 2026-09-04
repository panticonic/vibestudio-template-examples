import type { Idiom } from "../types.js";

function idiom(id: string, name: string, about: string, concepts: string[], source: string): Idiom {
  return { id, name, about, source, concepts, origin: "seed", provenance: null, usedBy: [] };
}

/**
 * The lineage's idioms: tested reference workings the familiar reads,
 * adapts and invokes. Each is a function body against the binding; `args`
 * is in scope when invoked through `world.invoke(name, args)`.
 */
export const SEED_IDIOMS: Idiom[] = [
  idiom("idiom:flood-fill", "Flood fill", "Every connected cell from a start, by a predicate; returns the cells. Use it to find a pond, a rot patch, a bed.", ["here", "all"],
    `// args: { region, x, y, pred: (cell) => boolean, limit? }
const seen = new Set(); const out = []; const stack = [[args.x, args.y]];
const limit = args.limit || 512;
while (stack.length && out.length < limit) {
  const [x, y] = stack.pop();
  const key = x + "," + y;
  if (seen.has(key)) continue;
  seen.add(key);
  let c; try { c = read.cell(args.region, x, y); } catch { continue; }
  if (!args.pred(c)) continue;
  out.push(c);
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}
return out;`),
  idiom("idiom:frontier", "Frontier search", "Breadth-first from a start to the nearest cell matching a goal, avoiding cells that block; returns the path of cells. Bodies use it to walk.", ["path"],
    `// args: { region, from: {x,y}, goal: (cell) => boolean, blocked?: (cell) => boolean, limit? }
const blocked = args.blocked || ((c) => c.stone >= 6);
const limit = args.limit || 2048;
const key = (x, y) => x + "," + y;
const prev = new Map(); const q = [[args.from.x, args.from.y]]; prev.set(key(args.from.x, args.from.y), null);
let found = null, n = 0;
while (q.length && n++ < limit) {
  const [x, y] = q.shift();
  let c; try { c = read.cell(args.region, x, y); } catch { continue; }
  if (args.goal(c)) { found = [x, y]; break; }
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = x + dx, ny = y + dy, k = key(nx, ny);
    if (prev.has(k)) continue;
    let nc; try { nc = read.cell(args.region, nx, ny); } catch { continue; }
    if (blocked(nc)) continue;
    prev.set(k, [x, y]); q.push([nx, ny]);
  }
}
if (!found) return [];
const path = []; let cur = found;
while (cur) { path.unshift({ region: args.region, x: cur[0], y: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
return path;`),
  idiom("idiom:downhill", "Downhill", "From a cell, the lowest neighbour repeatedly: where water will go. Returns the descent as cells.", ["down", "water"],
    `// args: { region, x, y, steps? }
const out = []; let x = args.x, y = args.y;
for (let i = 0; i < (args.steps || 32); i++) {
  const here = read.cell(args.region, x, y);
  let best = null;
  for (const n of read.neighbours(here, 1)) if (n.x !== x || n.y !== y) if (!best || n.elevation < best.elevation) best = n;
  if (!best || best.elevation >= here.elevation) break;
  out.push(best); x = best.x; y = best.y;
}
return out;`),
  idiom("idiom:hysteresis", "Hold between", "A control loop with hysteresis: raise a layer when below `low`, lower it when above `high`, leave it alone between. The shape of every good ward.", ["ward", "more", "cold"],
    `// args: { cells: Cell[], layer, low, high, step? }
const step = args.step || 1; let changed = 0;
for (const c of args.cells) {
  const v = c[args.layer];
  if (v < args.low) { effect.transmute(c, { [args.layer]: step }); changed++; }
  else if (v > args.high) { effect.transmute(c, { [args.layer]: -step }); changed++; }
}
return changed;`),
  idiom("idiom:ward-lattice", "Ward lattice", "One ward per room that watches its neighbours' firing, so a household builds a net of small wards rather than one large one.", ["ward", "whenever"],
    `// args: { region, rects: Rect[], predicate: string, source: string }
const ids = [];
for (const r of args.rects) ids.push(on.cell(args.region, args.predicate, args.source, r));
return ids;`),
  idiom("idiom:hauling", "Hauling schedule", "Many bodies, one corridor: each body takes the next free step toward its goal, and yields when another body is ahead. No scheduler is given to the apprentice; this is the familiar's.", ["haul", "many", "path"],
    `// args: { golems: string[], region, from: {x,y}, to: {x,y} }
const occupied = new Set(read.entities(args.region).map((e) => e.x + "," + e.y));
for (const name of args.golems) {
  const g = read.entity(name); if (!g) continue;
  const carrying = Object.values(g.carrying || {}).some((n) => n > 0);
  const target = carrying ? args.to : args.from;
  const dx = target.x - g.x, dy = target.y - g.y;
  if (dx === 0 && dy === 0) { bind.act(name, { kind: carrying ? "place" : "carry" }); continue; }
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : (dy > 0 ? "s" : "n");
  const nx = g.x + (dir === "e" ? 1 : dir === "w" ? -1 : 0), ny = g.y + (dir === "s" ? 1 : dir === "n" ? -1 : 0);
  if (occupied.has(nx + "," + ny)) continue;   // yield
  occupied.delete(g.x + "," + g.y); occupied.add(nx + "," + ny);
  bind.act(name, { kind: "move", dir });
}`),
  idiom("idiom:sluice-cascade", "Sluice cascade", "Open sluices in order from the top of the valley down, one per checkpoint, so the marsh can take what the orchard gives.", ["open", "slow", "until"],
    `// args: { names: string[], phase }
const phase = args.phase || 0;
if (phase >= args.names.length) return "done";
effect.sluice(args.names[phase], "open");
time.checkpoint({ names: args.names, phase: phase + 1 }, phase + 1);
return args.names[phase];`),
  idiom("idiom:fire-break", "Fire break", "Quench a ring of cells around a fire so it cannot spread with the wind.", ["quench", "guard"],
    `// args: { region, x, y, radius? }
const ring = read.neighbours({ region: args.region, x: args.x, y: args.y }, args.radius || 2).filter((c) => Math.max(Math.abs(c.x - args.x), Math.abs(c.y - args.y)) === (args.radius || 2));
for (const c of ring) if (c.heat > 0 || c.growth > 0) effect.transmute(c, { heat: -c.heat, water: 1 });
return ring.length;`),
  idiom("idiom:silt", "Silt management", "Push silt downstream from the cells of a sluice or wheel, with the water, a cell at a time.", ["silt", "down", "fast"],
    `// args: { region, x, y, dir?: "s"|"e"|"n"|"w", cells? }
const dir = args.dir || "s";
const cells = args.cells || read.neighbours({ region: args.region, x: args.x, y: args.y }, 1);
let moved = 0;
for (const c of cells) if (c.silt > 0) { effect.push(c, dir, Math.min(c.silt, 2)); moved++; }
return moved;`),
  idiom("idiom:moth-lure", "Moth lure", "A lantern drawn at one cell so the moths gather there instead of in the beds or the furnace.", ["adorn", "light"],
    `// args: { region, x, y, colour? }
effect.adorn({ region: args.region, x: args.x, y: args.y }, { kind: "lantern", colour: args.colour || "#ffd27a", intensity: 3, label: "moth lure" });
effect.adorn({ region: args.region, x: args.x, y: args.y }, { kind: "moths", intensity: 2 });
return true;`),
];
