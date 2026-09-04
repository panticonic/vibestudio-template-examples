/**
 * Drawing a region on a canvas as a map in a notebook that has come alive.
 *
 * Every layer is an ink: water blues that pool, heat as a warm wash, growth
 * greens by species, rot as ink bleeding the wrong way, light as a pale wash,
 * ether as faint violet dots along the ley lines. What is wrong is drawn
 * wrong: still wheels, drowning orchards, stale sigils that flicker. Changes
 * between two snapshots are drawn as ink spreading over ~600 ms.
 */
import type { Ailment, Entity, Layer, Region, RegionView } from "@workspace/grimoire-engine";
import { LAYER_INK, SPECIES_INK, hex, rgba, type Palette } from "./palette.js";

export type LayerToggle = "heat" | "water" | "ether" | "rot" | "light" | "growth" | "wind";

export interface DrawOptions {
  palette: Palette;
  layers: Set<LayerToggle>;
  /** 0..1 progress from `previous` to `region`. */
  blend: number;
  previous: Region | null;
  hover: { x: number; y: number } | null;
  focus: { x: number; y: number } | null;
  wards: RegionView["wards"];
  /** Animation clock in ms, for flicker and moths. */
  clock: number;
  windDir: "n" | "s" | "e" | "w";
  windForce: number;
  reducedMotion: boolean;
}

interface Rng { next(): number }

function seeded(seed: number): Rng {
  let s = (seed >>> 0) || 1;
  return {
    next() {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    },
  };
}

function lerpLayer(a: number[] | undefined, b: number[], t: number, i: number): number {
  const bv = b[i] ?? 0;
  if (!a) return bv;
  const av = a[i] ?? bv;
  return av + (bv - av) * t;
}

/** Cell size in CSS pixels for a region drawn into `width` px. */
export function cellSize(region: Region, width: number, height: number): number {
  return Math.max(4, Math.floor(Math.min(width / region.w, height / region.h)));
}

export function drawRegion(canvas: HTMLCanvasElement, view: RegionView, opts: DrawOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const region = view.region;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const cw = canvas.clientWidth || 600;
  const ch = canvas.clientHeight || 400;
  if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = cellSize(region, cw, ch);
  const ox = Math.floor((cw - s * region.w) / 2);
  const oy = Math.floor((ch - s * region.h) / 2);
  const p = opts.palette;
  const t = opts.blend;
  const prev = opts.previous && opts.previous.id === region.id && opts.previous.w === region.w ? opts.previous : null;

  // Paper.
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, cw, ch);
  paperGrain(ctx, cw, ch, region.id.length * 131 + region.w, p);

  // Terrain: elevation as a faint hatch; stone as grey; roofs as a darker paper.
  const rng = seeded(region.w * 7919 + region.h);
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      const i = y * region.w + x;
      const px = ox + x * s;
      const py = oy + y * s;
      const elev = region.elevation[i] ?? 0;
      const stone = lerpLayer(prev?.layers.stone, region.layers.stone, t, i);
      const roofed = (region.roof[i] ?? 0) > 0;
      if (roofed) {
        ctx.fillStyle = rgba(p.ink, 0.06);
        ctx.fillRect(px, py, s, s);
      }
      if (elev > 0) {
        ctx.fillStyle = rgba(p.ink, Math.min(0.18, elev * 0.02));
        ctx.fillRect(px, py, s, s);
      }
      if (stone > 0) {
        ctx.fillStyle = rgba(LAYER_INK.stone, Math.min(0.75, 0.15 + stone * 0.05));
        ctx.fillRect(px + 0.5, py + 0.5, s - 1, s - 1);
        if (s >= 8 && rng.next() < 0.35) {
          ctx.strokeStyle = rgba(p.ink, 0.15);
          ctx.beginPath();
          ctx.moveTo(px + 2, py + s - 2);
          ctx.lineTo(px + s - 2, py + 2);
          ctx.stroke();
        }
      }
      // Ley lines as faint violet dots.
      if ((region.ley[i] ?? 0) > 0 && opts.layers.has("ether")) {
        ctx.fillStyle = rgba(LAYER_INK.ether, 0.35);
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2, Math.max(1, s / 8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Inks per layer, blended from previous → current.
  const draw = (layer: Layer, ink: string, maxAlpha: number, scale: number, pattern: "fill" | "pool" | "bleed" | "wash" | "dots") => {
    const cur = region.layers[layer];
    const before = prev?.layers[layer];
    for (let y = 0; y < region.h; y++) {
      for (let x = 0; x < region.w; x++) {
        const i = y * region.w + x;
        const v = lerpLayer(before, cur, t, i);
        if (v <= 0) continue;
        const a = Math.min(maxAlpha, v * scale);
        const px = ox + x * s;
        const py = oy + y * s;
        ctx.fillStyle = rgba(ink, a);
        if (pattern === "fill") ctx.fillRect(px, py, s, s);
        else if (pattern === "pool") {
          ctx.beginPath();
          ctx.roundRect(px + 0.5, py + 0.5, s - 1, s - 1, s / 3);
          ctx.fill();
        } else if (pattern === "bleed") {
          // Rot bleeds the wrong way: a blot with a tail against the wind.
          ctx.beginPath();
          ctx.ellipse(px + s / 2, py + s / 2, s * 0.55, s * 0.4, (i % 7) * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(px + (opts.windDir === "e" ? -s * 0.3 : s * 0.7), py + s * 0.4, s * 0.6, s * 0.2);
        } else if (pattern === "wash") {
          ctx.fillRect(px - 1, py - 1, s + 2, s + 2);
        } else {
          const n = Math.min(4, Math.ceil(v / 2));
          for (let k = 0; k < n; k++) {
            ctx.beginPath();
            ctx.arc(px + s * (0.25 + 0.5 * ((k * 37 + i) % 3) / 2), py + s * (0.25 + 0.5 * ((k * 53 + i) % 3) / 2), Math.max(1, s / 7), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  };

  if (opts.layers.has("water")) draw("water", LAYER_INK.water, 0.8, 0.12, "pool");
  draw("silt", LAYER_INK.silt, 0.5, 0.1, "fill");
  if (opts.layers.has("growth")) drawGrowth(ctx, region, prev, t, ox, oy, s, p);
  if (opts.layers.has("heat")) draw("heat", LAYER_INK.heat, 0.55, 0.09, "wash");
  draw("frost", LAYER_INK.frost, 0.7, 0.2, "fill");
  draw("ash", LAYER_INK.ash, 0.5, 0.15, "fill");
  draw("steam", LAYER_INK.steam, 0.6, 0.2, "wash");
  if (opts.layers.has("rot")) draw("rot", LAYER_INK.rot, 0.8, 0.14, "bleed");
  if (opts.layers.has("rot")) draw("spore", LAYER_INK.spore, 0.5, 0.2, "dots");
  draw("silver", LAYER_INK.silver, 0.8, 0.2, "dots");
  draw("glass", LAYER_INK.glass, 0.7, 0.2, "fill");
  if (opts.layers.has("light")) draw("light", LAYER_INK.light, 0.35, 0.05, "wash");
  if (opts.layers.has("ether")) draw("ether", LAYER_INK.ether, 0.5, 0.06, "dots");

  // Sluices.
  for (const sl of region.sluices) {
    const px = ox + sl.x * s;
    const py = oy + sl.y * s;
    ctx.strokeStyle = rgba(p.ink, 0.8);
    ctx.lineWidth = Math.max(1, s / 6);
    ctx.beginPath();
    if (sl.state === "closed") {
      ctx.moveTo(px + s * 0.2, py + s * 0.5);
      ctx.lineTo(px + s * 0.8, py + s * 0.5);
    } else if (sl.state === "half") {
      ctx.moveTo(px + s * 0.2, py + s * 0.6);
      ctx.lineTo(px + s * 0.5, py + s * 0.3);
    } else {
      ctx.moveTo(px + s * 0.5, py + s * 0.15);
      ctx.lineTo(px + s * 0.5, py + s * 0.85);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // Places: a small label.
  if (s >= 10) {
    ctx.fillStyle = rgba(p.ink, 0.7);
    ctx.font = `${Math.max(9, s * 0.9)}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
    for (const place of Object.values(region.places)) {
      ctx.fillText(place.name, ox + place.x * s + s * 0.2, oy + place.y * s - 2);
    }
  }

  // Marks with glow, adorns as charms.
  for (const [key, mark] of Object.entries(region.marks)) {
    const i = Number(key);
    const x = i % region.w;
    const y = Math.floor(i / region.w);
    const px = ox + x * s;
    const py = oy + y * s;
    if (mark.glow) {
      const g = ctx.createRadialGradient(px + s / 2, py + s / 2, 0, px + s / 2, py + s / 2, s * 1.4);
      g.addColorStop(0, rgba(mark.glow, 0.5));
      g.addColorStop(1, rgba(mark.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(px - s, py - s, s * 3, s * 3);
    }
    ctx.fillStyle = rgba(p.ink, 0.85);
    ctx.font = `${Math.max(8, s * 0.8)}px serif`;
    ctx.fillText(mark.sigil.slice(0, 2), px + s * 0.15, py + s * 0.8);
  }
  for (const [key, charm] of Object.entries(region.adorns)) {
    const i = Number(key);
    const x = i % region.w;
    const y = Math.floor(i / region.w);
    drawCharm(ctx, charm.kind, charm.colour ?? p.accent, ox + x * s, oy + y * s, s, opts.clock, opts.reducedMotion, i);
  }

  // Wards as faint sigils; stale ones flicker.
  for (const ward of opts.wards) {
    const flicker = ward.stale && !opts.reducedMotion ? 0.35 + 0.35 * Math.abs(Math.sin(opts.clock / 240 + ward.id.length)) : 0.55;
    ctx.strokeStyle = rgba(ward.stale ? LAYER_INK.ether : p.accent, flicker);
    ctx.lineWidth = 1;
    const cells = ward.cells.slice(0, 400);
    for (const i of cells) {
      const x = i % region.w;
      const y = Math.floor(i / region.w);
      const px = ox + x * s;
      const py = oy + y * s;
      ctx.beginPath();
      ctx.moveTo(px + 1, py + 1);
      ctx.lineTo(px + s - 1, py + s - 1);
      ctx.stroke();
    }
    if (cells.length > 0) {
      const first = cells[0]!;
      const px = ox + (first % region.w) * s;
      const py = oy + Math.floor(first / region.w) * s;
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Ailments drawn wrong.
  for (const ailment of region.ailments) drawAilment(ctx, ailment, region, ox, oy, s, p, opts.clock, opts.reducedMotion);

  // Entities.
  for (const e of view.entities) drawEntity(ctx, e, ox + e.x * s, oy + e.y * s, s, p, opts.clock, opts.reducedMotion);

  // Wind: a few streaks along the wind direction.
  if (opts.layers.has("wind") && opts.windForce > 0) {
    ctx.strokeStyle = rgba(p.ink, 0.12);
    const n = Math.min(24, 4 + opts.windForce * 4);
    const r2 = seeded(11 + Math.floor(opts.clock / (opts.reducedMotion ? 1e9 : 900)));
    for (let k = 0; k < n; k++) {
      const x = ox + r2.next() * region.w * s;
      const y = oy + r2.next() * region.h * s;
      const dx = opts.windDir === "e" ? 1 : opts.windDir === "w" ? -1 : 0;
      const dy = opts.windDir === "s" ? 1 : opts.windDir === "n" ? -1 : 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dx * s * 2 + s * 0.3, y + dy * s * 2 - s * 0.3, x + dx * s * 4, y + dy * s * 4);
      ctx.stroke();
    }
  }

  // Hover and focus.
  if (opts.focus) {
    ctx.strokeStyle = rgba(p.accent, 0.95);
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + opts.focus.x * s + 1, oy + opts.focus.y * s + 1, s - 2, s - 2);
    ctx.lineWidth = 1;
  }
  if (opts.hover) {
    ctx.strokeStyle = rgba(p.ink, 0.7);
    ctx.strokeRect(ox + opts.hover.x * s + 0.5, oy + opts.hover.y * s + 0.5, s - 1, s - 1);
  }

  // Ink edge around the region.
  ctx.strokeStyle = rgba(p.ink, 0.5);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox - 1, oy - 1, s * region.w + 2, s * region.h + 2);
  ctx.lineWidth = 1;
}

function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, p: Palette): void {
  const rng = seeded(seed);
  ctx.fillStyle = rgba(p.ink, 0.035);
  const n = Math.floor((w * h) / 900);
  for (let i = 0; i < n; i++) {
    ctx.fillRect(rng.next() * w, rng.next() * h, 1 + rng.next() * 2, 1);
  }
}

function drawGrowth(ctx: CanvasRenderingContext2D, region: Region, prev: Region | null, t: number, ox: number, oy: number, s: number, p: Palette): void {
  const cur = region.layers.growth;
  const before = prev?.layers.growth;
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      const i = y * region.w + x;
      const v = lerpLayer(before, cur, t, i);
      if (v <= 0) continue;
      const species = region.species[i] || "grass";
      const ink = SPECIES_INK[species] ?? LAYER_INK.growth;
      const px = ox + x * s;
      const py = oy + y * s;
      const a = Math.min(0.85, 0.2 + v * 0.1);
      ctx.fillStyle = rgba(ink, a);
      if (species === "apple") {
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(p.ink, 0.4);
        ctx.fillRect(px + s * 0.45, py + s * 0.6, s * 0.1, s * 0.35);
      } else if (species === "reed") {
        ctx.fillRect(px + s * 0.3, py + s * 0.1, s * 0.12, s * 0.8);
        ctx.fillRect(px + s * 0.6, py + s * 0.25, s * 0.12, s * 0.65);
      } else if (species === "moonbloom") {
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (species === "blight-cap") {
        ctx.beginPath();
        ctx.ellipse(px + s / 2, py + s * 0.45, s * 0.35, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(px + 0.5, py + 0.5, s - 1, s - 1);
      }
    }
  }
}

function drawCharm(ctx: CanvasRenderingContext2D, kind: string, colour: string, px: number, py: number, s: number, clock: number, still: boolean, seed: number): void {
  const cx = px + s / 2;
  const cy = py + s / 2;
  const pulse = still ? 1 : 0.85 + 0.15 * Math.sin(clock / 500 + seed);
  if (kind === "lantern" || kind === "glow" || kind === "colour") {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.8 * pulse);
    g.addColorStop(0, rgba(colour, 0.55));
    g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - s * 2, cy - s * 2, s * 4, s * 4);
    ctx.fillStyle = rgba(colour, 0.9);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.5, s / 5), 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "mist") {
    ctx.fillStyle = rgba(colour, 0.18);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (k - 1) * s * 0.4, cy + Math.sin(clock / 900 + k) * (still ? 0 : s * 0.15), s * 0.9, s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "moths") {
    ctx.fillStyle = rgba(colour, 0.8);
    const rng = seeded(seed + 17);
    for (let k = 0; k < 6; k++) {
      const a = rng.next() * Math.PI * 2 + (still ? 0 : clock / (700 + k * 90));
      const r = s * (0.4 + rng.next() * 1.2);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a * 1.3) * r * 0.7, Math.max(1, s / 9), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "petals") {
    ctx.fillStyle = rgba(colour, 0.7);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + (still ? 0 : clock / 3000);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3, s * 0.18, s * 0.1, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "chime") {
    ctx.strokeStyle = rgba(colour, 0.6);
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.25 * k * (still ? 1 : 0.9 + 0.1 * Math.sin(clock / 400 + k)), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = rgba(colour, 0.8);
    ctx.font = `${Math.max(8, s * 0.8)}px serif`;
    ctx.fillText("✦", px + s * 0.15, py + s * 0.8);
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, px: number, py: number, s: number, p: Palette, clock: number, still: boolean): void {
  const cx = px + s / 2;
  const cy = py + s / 2;
  if (e.kind === "golem") {
    const ink = e.sub === "bone" ? "#d9d2c3" : e.sub === "wood" ? "#8a6a3a" : "#6b6a66";
    ctx.fillStyle = rgba(ink, 0.95);
    ctx.fillRect(cx - s * 0.22, cy - s * 0.4, s * 0.44, s * 0.8);
    ctx.fillRect(cx - s * 0.32, cy - s * 0.25, s * 0.64, s * 0.2);
    ctx.fillStyle = rgba(p.ink, 0.9);
    ctx.fillRect(cx - s * 0.15, cy - s * 0.48, s * 0.3, s * 0.18);
    if (e.bound?.mode === "stale") {
      ctx.strokeStyle = rgba(LAYER_INK.ether, still ? 0.5 : 0.3 + 0.3 * Math.abs(Math.sin(clock / 300)));
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (s >= 10) {
      ctx.fillStyle = rgba(p.ink, 0.8);
      ctx.font = `${Math.max(8, s * 0.7)}px "Grimoire Serif", "Iowan Old Style", Palatino, Georgia, serif`;
      ctx.fillText(e.name, px + s * 0.6, py + s * 0.4);
      // A chartered golem explains itself on the map: its last line in a small bubble.
      if (e.bound?.mode === "charter" && e.last) {
        const text = e.last.length > 48 ? e.last.slice(0, 46) + "…" : e.last;
        ctx.font = `italic ${Math.max(9, s * 0.55)}px "Grimoire Serif", Georgia, serif`;
        const w = ctx.measureText(text).width + s * 0.6;
        const bx = px + s * 0.6, by = py - s * 0.9;
        ctx.fillStyle = rgba(p.paper, 0.92);
        ctx.strokeStyle = rgba(p.ink, 0.5);
        ctx.beginPath();
        ctx.roundRect(bx, by - s * 0.55, w, s * 0.8, s * 0.2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = rgba(p.ink, 0.9);
        ctx.fillText(text, bx + s * 0.3, by + s * 0.05);
      }
    }
    return;
  }
  const wobble = still ? 0 : Math.sin(clock / 260 + e.x * 3 + e.y) * s * 0.08;
  switch (e.sub) {
    case "sparrow":
      ctx.fillStyle = rgba("#6b4f2e", 0.9);
      ctx.beginPath();
      ctx.ellipse(cx, cy + wobble, s * 0.22, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx + s * 0.15, cy + wobble - s * 0.04, s * 0.18, s * 0.06);
      break;
    case "vermin":
      ctx.fillStyle = rgba("#3d3a33", 0.9);
      ctx.beginPath();
      ctx.ellipse(cx + wobble, cy, s * 0.25, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba("#3d3a33", 0.7);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.25, cy);
      ctx.lineTo(cx + s * 0.45, cy + s * 0.1);
      ctx.stroke();
      break;
    case "carp":
      ctx.fillStyle = rgba("#d9843a", 0.9);
      ctx.beginPath();
      ctx.ellipse(cx + wobble, cy, s * 0.28, s * 0.13, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.28, cy);
      ctx.lineTo(cx - s * 0.42, cy - s * 0.12);
      ctx.lineTo(cx - s * 0.42, cy + s * 0.12);
      ctx.fill();
      break;
    case "silt-worm":
      ctx.strokeStyle = rgba("#b39a6b", 0.9);
      ctx.lineWidth = Math.max(1, s / 8);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy);
      ctx.quadraticCurveTo(cx, cy - s * 0.25 + wobble, cx + s * 0.3, cy);
      ctx.stroke();
      ctx.lineWidth = 1;
      break;
    case "moth":
      ctx.fillStyle = rgba("#e8dcc0", 0.9);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.12, cy + wobble, s * 0.12, s * 0.08, -0.4, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.12, cy + wobble, s * 0.12, s * 0.08, 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.fillStyle = rgba("#d97a2a", still ? 0.5 : 0.3 + 0.3 * Math.abs(Math.sin(clock / 700)));
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
  }
}

function drawAilment(ctx: CanvasRenderingContext2D, a: Ailment, region: Region, ox: number, oy: number, s: number, p: Palette, clock: number, still: boolean): void {
  const cells = (a.cells ?? []).slice(0, 600);
  switch (a.kind) {
    case "flooded": {
      // The orchard drowning: blue washes swelling over the cells.
      ctx.fillStyle = rgba(LAYER_INK.water, 0.22 + (still ? 0 : 0.06 * Math.sin(clock / 1500)));
      for (const i of cells) ctx.fillRect(ox + (i % region.w) * s - 1, oy + Math.floor(i / region.w) * s - 1, s + 2, s + 2);
      break;
    }
    case "still": {
      // A wheel drawn still: a circle with spokes and no motion, crossed once.
      const c = cells[0];
      if (c === undefined) break;
      const cx = ox + (c % region.w) * s + s / 2;
      const cy = oy + Math.floor(c / region.w) * s + s / 2;
      ctx.strokeStyle = rgba(p.ink, 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, s * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * s * 1.2, cy + Math.sin(ang) * s * 1.2);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(LAYER_INK.silt, 0.8);
      ctx.beginPath();
      ctx.moveTo(cx - s * 1.4, cy + s * 1.3);
      ctx.lineTo(cx + s * 1.4, cy + s * 1.3);
      ctx.stroke();
      break;
    }
    case "stale-ward": {
      const flick = still ? 0.4 : 0.25 + 0.3 * Math.abs(Math.sin(clock / 190));
      ctx.strokeStyle = rgba(LAYER_INK.ether, flick);
      for (const i of cells.slice(0, 40)) {
        const px = ox + (i % region.w) * s;
        const py = oy + Math.floor(i / region.w) * s;
        ctx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
      }
      break;
    }
    case "dark": {
      ctx.fillStyle = rgba("#1b1a24", 0.35);
      for (const i of cells) ctx.fillRect(ox + (i % region.w) * s, oy + Math.floor(i / region.w) * s, s, s);
      break;
    }
    case "broken": {
      ctx.strokeStyle = rgba(p.ink, 0.5);
      for (const i of cells.slice(0, 80)) {
        const px = ox + (i % region.w) * s;
        const py = oy + Math.floor(i / region.w) * s;
        ctx.beginPath();
        ctx.moveTo(px, py + s * 0.6);
        ctx.lineTo(px + s * 0.4, py + s * 0.3);
        ctx.lineTo(px + s * 0.6, py + s * 0.7);
        ctx.lineTo(px + s, py + s * 0.2);
        ctx.stroke();
      }
      break;
    }
    case "locked": {
      const c = cells[0];
      if (c === undefined) break;
      const px = ox + (c % region.w) * s;
      const py = oy + Math.floor(c / region.w) * s;
      ctx.fillStyle = rgba(p.ink, 0.7);
      ctx.fillRect(px + s * 0.2, py + s * 0.4, s * 0.6, s * 0.5);
      ctx.strokeStyle = rgba(p.ink, 0.7);
      ctx.beginPath();
      ctx.arc(px + s * 0.5, py + s * 0.4, s * 0.2, Math.PI, 0);
      ctx.stroke();
      break;
    }
    case "quarrel": {
      ctx.strokeStyle = rgba(LAYER_INK.heat, 0.5);
      for (const i of cells.slice(0, 60)) {
        const px = ox + (i % region.w) * s;
        const py = oy + Math.floor(i / region.w) * s;
        const t = still ? 0 : Math.sin(clock / 300 + i);
        ctx.beginPath();
        ctx.moveTo(px, py + s / 2 + t);
        ctx.lineTo(px + s, py + s / 2 - t);
        ctx.stroke();
      }
      break;
    }
    case "leaking": {
      ctx.fillStyle = rgba(LAYER_INK.ether, 0.35);
      for (const i of cells.slice(0, 60)) {
        const px = ox + (i % region.w) * s;
        const py = oy + Math.floor(i / region.w) * s;
        const drift = still ? 0 : (clock / 40 + i * 7) % (s * 2);
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2 + drift, Math.max(1, s / 8), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
}

/** Cell under a pointer, or null. */
export function cellAt(canvas: HTMLCanvasElement, region: Region, clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  const s = cellSize(region, cw, ch);
  const ox = Math.floor((cw - s * region.w) / 2);
  const oy = Math.floor((ch - s * region.h) / 2);
  const x = Math.floor((clientX - rect.left - ox) / s);
  const y = Math.floor((clientY - rect.top - oy) / s);
  if (x < 0 || y < 0 || x >= region.w || y >= region.h) return null;
  return { x, y };
}

/** A tiny bar chart of a layer delta for the spellbook. */
export function deltaBars(before: Partial<Record<Layer, number>>, after: Partial<Record<Layer, number>>): Array<{ layer: Layer; before: number; after: number; ink: string }> {
  const keys = new Set<Layer>([...(Object.keys(before) as Layer[]), ...(Object.keys(after) as Layer[])]);
  return [...keys].map((layer) => ({ layer, before: before[layer] ?? 0, after: after[layer] ?? 0, ink: LAYER_INK[layer] })).filter((r) => r.before !== r.after).slice(0, 6);
}

export { hex };
