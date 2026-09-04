<script lang="ts">
  /**
   * One region at zoom: a canvas drawn as a map in a notebook that has come
   * alive. Layer toggles, hover numbers, wards as sigils, a click to focus a
   * cell for the next verse, and a right-click to leave a charm.
   */
  import { onMount } from "svelte";
  import type { CharmKind, Overview, RegionId, RegionView, Sky } from "@workspace/grimoire-engine";
  import { drawRegion, cellAt, type LayerToggle } from "./lib/draw.js";
  import { LAYER_INK, type Palette } from "./lib/palette.js";

  type ScryTarget = { kind: "spell" | "cell" | "entity" | "spirit"; ref: string; region?: RegionId; x?: number; y?: number };

  let { view, previous, palette, sky, onBack, onScry, onFocus, onAdorn, apprentices }: {
    view: RegionView; previous: RegionView | null; palette: Palette; sky: Sky;
    onBack: () => void; onScry: (t: ScryTarget) => void; onFocus: (c: { region: RegionId; x: number; y: number }) => void;
    onAdorn: (cell: { region: RegionId; x: number; y: number }, charm: { kind: CharmKind; colour?: string; label?: string }) => Promise<void>;
    apprentices: Overview["apprentices"];
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let wrap = $state<HTMLDivElement | null>(null);
  let layers = $state<Set<LayerToggle>>(new Set(["water", "growth", "rot", "light"]));
  let hover = $state<{ x: number; y: number } | null>(null);
  let focus = $state<{ x: number; y: number } | null>(null);
  let menu = $state<{ x: number; y: number; cx: number; cy: number } | null>(null);
  let blendStart = 0;
  let raf = 0;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const TOGGLES: LayerToggle[] = ["heat", "water", "ether", "rot", "light", "growth", "wind"];
  const region = $derived(view.region);
  const hovered = $derived(hover ? { i: hover.y * region.w + hover.x } : null);
  const hoverCell = $derived(hovered ? Object.fromEntries(Object.entries(region.layers).map(([k, arr]) => [k, arr[hovered.i] ?? 0])) as Record<string, number> : null);
  const hoverWard = $derived(hover ? view.wards.find((w) => w.cells.includes(hover!.y * region.w + hover!.x)) ?? null : null);
  const hoverEntity = $derived(hover ? view.entities.find((e) => e.x === hover!.x && e.y === hover!.y) ?? null : null);
  const hoverMark = $derived(hover ? region.marks[String(hover.y * region.w + hover.x)] ?? null : null);

  $effect(() => { void view; blendStart = performance.now(); });

  function frame(now: number): void {
    if (canvas && wrap) {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(200, Math.floor(rect.width)), h = Math.max(160, Math.floor(rect.height));
      if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) { canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; }
      const blend = reducedMotion ? 1 : Math.min(1, (now - blendStart) / 600);
      drawRegion(canvas, view, { palette, layers, blend, previous: previous?.region.id === region.id ? previous.region : null, hover, focus, wards: view.wards, clock: now, windDir: sky.windDir, windForce: sky.windForce, reducedMotion });
    }
    raf = requestAnimationFrame(frame);
  }

  onMount(() => { raf = requestAnimationFrame(frame); return () => cancelAnimationFrame(raf); });

  function toggle(l: LayerToggle): void { const next = new Set(layers); if (next.has(l)) next.delete(l); else next.add(l); layers = next; }
  function onMove(e: MouseEvent): void { if (!canvas) return; hover = cellAt(canvas, region, e.clientX, e.clientY); }
  function onLeave(): void { hover = null; }
  function onClick(e: MouseEvent): void {
    if (!canvas) return;
    const c = cellAt(canvas, region, e.clientX, e.clientY);
    if (!c) return;
    menu = null;
    focus = c;
    onFocus({ region: region.id, x: c.x, y: c.y });
  }
  function onContext(e: MouseEvent): void {
    e.preventDefault();
    if (!canvas || !wrap) return;
    const c = cellAt(canvas, region, e.clientX, e.clientY);
    if (!c) return;
    const r = wrap.getBoundingClientRect();
    menu = { x: e.clientX - r.left, y: e.clientY - r.top, cx: c.x, cy: c.y };
  }
  async function leave(kind: CharmKind, colour?: string): Promise<void> {
    if (!menu) return;
    const m = menu; menu = null;
    await onAdorn({ region: region.id, x: m.cx, y: m.cy }, { kind, colour, label: kind === "lantern" ? "for whoever comes next" : undefined });
  }
</script>

<div class="region">
  <header>
    <button class="back" onclick={onBack} title="back to the valley (Esc)">← the valley</button>
    <h2>{region.name}</h2>
    <span class="dims">{region.w}×{region.h}</span>
    {#if region.ailments.length}<span class="ailments">{region.ailments.map((a) => a.note).join(" · ")}</span>{/if}
    <span class="grow"></span>
    <div class="toggles" role="group" aria-label="layers">
      {#each TOGGLES as l}
        <button class="toggle" class:on={layers.has(l)} style={`--ink:${l === "wind" ? palette.ink : LAYER_INK[l as keyof typeof LAYER_INK]}`} onclick={() => toggle(l)}>{l}</button>
      {/each}
    </div>
  </header>
  <div class="canvas-wrap" bind:this={wrap}>
    <canvas bind:this={canvas} onmousemove={onMove} onmouseleave={onLeave} onclick={onClick} oncontextmenu={onContext}></canvas>
    {#if hover && hoverCell}
      <div class="tip" style={`left:${Math.min(hover.x / region.w * 100, 70)}%; top:${Math.min(hover.y / region.h * 100 + 4, 80)}%`}>
        <div class="coords">{region.id} {hover.x},{hover.y} · elevation {region.elevation[hover.y * region.w + hover.x]}{region.ley[hover.y * region.w + hover.x] ? " · ley" : ""}{region.species[hover.y * region.w + hover.x] ? ` · ${region.species[hover.y * region.w + hover.x]}` : ""}</div>
        <div class="nums">
          {#each ["heat", "water", "stone", "growth", "light", "rot", "ether", "silt", "frost", "ash"] as k}{#if (hoverCell[k] ?? 0) > 0}<span style={`--ink:${LAYER_INK[k as keyof typeof LAYER_INK]}`}>{k} {hoverCell[k]}</span>{/if}{/each}
        </div>
        {#if hoverEntity}<div class="ent">{hoverEntity.name} · {hoverEntity.sub}{hoverEntity.last ? ` · ${hoverEntity.last}` : ""} <button onclick={(e) => { e.stopPropagation(); onScry({ kind: "entity", ref: hoverEntity!.name }); }}>scry</button></div>{/if}
        {#if hoverWard}<div class="ward">◌ {hoverWard.name ?? hoverWard.id}{hoverWard.stale ? " (stale)" : ""} · {hoverWard.caster} <button onclick={(e) => { e.stopPropagation(); onScry({ kind: "spell", ref: hoverWard!.id }); }}>scry</button></div>{/if}
        {#if hoverMark && !hoverWard}<div class="ward">{hoverMark.sigil} · {hoverMark.by} <button onclick={(e) => { e.stopPropagation(); onScry({ kind: "spell", ref: hoverMark!.spellId }); }}>scry</button></div>{/if}
        <div class="hint">click: speak of this cell · right-click: leave a charm</div>
      </div>
    {/if}
    {#if menu}
      <div class="menu" style={`left:${menu.x}px; top:${menu.y}px`}>
        <div class="menu-title">leave a charm at {menu.cx},{menu.cy}</div>
        <button onclick={() => void leave("lantern", "#ffd27a")}>a lantern</button>
        <button onclick={() => void leave("mist", "#c9d8e8")}>a coloured mist</button>
        <button onclick={() => void leave("moths")}>moths</button>
        <button onclick={() => void leave("petals", "#e7a4b8")}>petals</button>
        <button onclick={() => void leave("chime")}>a chime</button>
        <button onclick={() => void leave("sigil", palette.accent)}>a mark that glows at dusk</button>
        <button class="cancel" onclick={() => (menu = null)}>nothing</button>
      </div>
    {/if}
  </div>
  <footer>
    <span>{view.entities.length} living things · {view.wards.length} ward{view.wards.length === 1 ? "" : "s"}{apprentices.filter((a) => a.present && a.region === region.id).length ? ` · here: ${apprentices.filter((a) => a.present && a.region === region.id).map((a) => a.name).join(", ")}` : ""}</span>
    <span class="grow"></span>
    {#if focus}<span class="focus">speaking of {region.id} {focus.x},{focus.y}</span>{/if}
    <button class="scry" onclick={() => onScry({ kind: "cell", ref: region.id, region: region.id, x: focus?.x ?? hover?.x ?? 0, y: focus?.y ?? hover?.y ?? 0 })}>scry a cell</button>
  </footer>
</div>

<style>
  .region { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  header, footer { display: flex; align-items: center; gap: 0.7rem; padding: 0.4rem 0.8rem; font-size: 0.9rem; }
  header { border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  footer { border-top: 1px solid var(--border); color: var(--muted); }
  h2 { margin: 0; font-weight: 500; font-size: 1.15rem; }
  .dims, .ailments { color: var(--muted); font-style: italic; }
  .back, .scry, .toggle { font: inherit; font-size: 0.85rem; padding: 0.15rem 0.6rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  .toggle { border-color: color-mix(in srgb, var(--ink) 40%, transparent); color: var(--muted); }
  .toggle.on { background: color-mix(in srgb, var(--ink) 18%, transparent); color: var(--fg); border-color: var(--ink); }
  .grow { flex: 1; }
  .canvas-wrap { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--paper); }
  canvas { display: block; cursor: crosshair; }
  .tip { position: absolute; pointer-events: none; background: color-mix(in srgb, var(--paper) 90%, white); border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0.6rem; font-size: 0.8rem; max-width: 22rem; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
  .tip button { pointer-events: auto; font: inherit; font-size: 0.75rem; margin-left: 0.4rem; border: 1px solid var(--border); background: transparent; border-radius: 999px; padding: 0 0.5rem; cursor: pointer; color: var(--fg); }
  .coords { color: var(--muted); }
  .nums { display: flex; flex-wrap: wrap; gap: 0.3rem 0.6rem; margin: 0.2rem 0; }
  .nums span { color: var(--ink); font-variant-numeric: tabular-nums; }
  .ent, .ward { margin-top: 0.2rem; }
  .hint { color: var(--muted); font-style: italic; margin-top: 0.2rem; font-size: 0.72rem; }
  .menu { position: absolute; display: flex; flex-direction: column; background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 0.3rem; box-shadow: 0 10px 30px rgba(0,0,0,0.18); z-index: 2; }
  .menu-title { font-size: 0.75rem; color: var(--muted); padding: 0.2rem 0.6rem; }
  .menu button { font: inherit; font-size: 0.85rem; text-align: left; padding: 0.3rem 0.7rem; border: 0; background: transparent; color: var(--fg); border-radius: 6px; cursor: pointer; }
  .menu button:hover { background: color-mix(in srgb, var(--ink) 10%, transparent); }
  .menu .cancel { color: var(--muted); }
  .focus { font-style: italic; }
</style>
