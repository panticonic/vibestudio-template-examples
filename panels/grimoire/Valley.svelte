<script lang="ts">
  /**
   * The valley: every region as a card on a hand-drawn map, drawn wrong where
   * the estate is wrong. Click a region to enter it.
   */
  import type { Overview, RegionId, RegionSummary } from "@workspace/grimoire-engine";
  import { VALLEY_LAYOUT, VALLEY_W, VALLEY_H, WALL_Y, RIVER_PATH, LEY_LINES, HEARTH_XY } from "./lib/layout.js";
  import { SPIRIT_INK, type Palette } from "./lib/palette.js";

  let { overview, palette, onEnter }: { overview: Overview; palette: Palette; onEnter: (id: RegionId) => void } = $props();

  const byId = $derived(new Map(overview.regions.map((r) => [r.id, r])));
  const lit = $derived(overview.firstHour.hearthLit);
  const night = $derived(palette.night);

  function ailmentGlyph(r: RegionSummary): string {
    const kinds = r.ailments.map((a) => a.kind);
    if (kinds.includes("flooded")) return "≈";
    if (kinds.includes("rot")) return "∿";
    if (kinds.includes("still")) return "⊘";
    if (kinds.includes("dark")) return "●";
    if (kinds.includes("locked")) return "⚿";
    if (kinds.includes("quarrel")) return "⚔";
    if (kinds.includes("vermin")) return "∴";
    if (kinds.includes("leaking")) return "⋰";
    if (kinds.includes("silted")) return "≡";
    if (kinds.includes("broken")) return "✕";
    if (kinds.includes("stale-ward")) return "◌";
    return "";
  }
  function worst(r: RegionSummary): number { return r.ailments.reduce((m, a) => Math.max(m, a.severity), 0); }
  function tint(r: RegionSummary): string {
    const kinds = r.ailments.map((a) => a.kind);
    if (kinds.includes("rot")) return "#6b4a8a";
    if (kinds.includes("flooded")) return "#4a7fa5";
    if (kinds.includes("dark") || kinds.includes("locked")) return "#3e4a5a";
    if (kinds.includes("still") || kinds.includes("silted") || kinds.includes("broken")) return "#8a8478";
    if (r.restored) return palette.accent;
    return palette.wash;
  }
  function note(r: RegionSummary): string {
    const a = [...r.ailments].sort((x, y) => y.severity - x.severity)[0];
    return a ? a.note : r.restored ? "well" : "quiet";
  }
</script>

<div class="valley" style={`--night:${night}`}>
  <svg viewBox={`0 0 ${VALLEY_W} ${VALLEY_H}`} class="map" role="img" aria-label="the valley">
    <defs>
      <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" /><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncA type="table" tableValues="0 0.06" /></feComponentTransfer></filter>
      <filter id="ink-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <filter id="bleed" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="t" /><feDisplacementMap in="SourceGraphic" in2="t" scale="6" /></filter>
    </defs>
    <rect width={VALLEY_W} height={VALLEY_H} fill={palette.paper} />
    <rect width={VALLEY_W} height={VALLEY_H} filter="url(#paper)" opacity="0.8" />
    <!-- ley lines -->
    {#each LEY_LINES as d, i}
      <path {d} class="ley" class:bent={i === 2 && !(byId.get("ridge")?.restored)} stroke={palette.accent} />
    {/each}
    <!-- the river -->
    <path d={RIVER_PATH} class="river" class:sings={byId.get("mill")?.restored} stroke="#4a7fa5" />
    <!-- Ilvane's wall -->
    <path d={`M 20 ${WALL_Y} L 760 ${WALL_Y}`} class="wall" stroke={palette.ink} />
    <text x="24" y={WALL_Y - 6} class="tiny" fill={palette.faint}>Ilvane's wall</text>
    <!-- regions -->
    {#each VALLEY_LAYOUT as p}
      {@const r = byId.get(p.id)}
      {#if r}
        <g class="region" class:ailing={worst(r) > 0} class:restored={r.restored} class:moor={p.y >= WALL_Y} role="button" tabindex="0" onclick={() => onEnter(p.id)} onkeydown={(e) => (e.key === "Enter" || e.key === " ") && onEnter(p.id)} style={`--sev:${worst(r)}`}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="6" fill={tint(r)} fill-opacity={0.16 + worst(r) * 0.3} stroke={palette.ink} stroke-opacity="0.55" stroke-width="1.1" class:bleeding={r.ailments.some((a) => a.kind === "rot")} />
          {#if r.ailments.some((a) => a.kind === "flooded")}
            <path d={`M ${p.x + 6} ${p.y + p.h - 10} q 6 -4 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0`} class="ripple" stroke="#4a7fa5" />
          {/if}
          {#if r.ailments.some((a) => a.kind === "stale-ward")}
            <text x={p.x + p.w - 12} y={p.y + 14} class="sigil" fill={palette.ink}>◌</text>
          {/if}
          <text x={p.x + 8} y={p.y + 16} class="label" fill={palette.ink}>{p.label}</text>
          <text x={p.x + 8} y={p.y + 30} class="note" fill={palette.faint}>{ailmentGlyph(r)} {note(r)}</text>
          {#if r.spirit}<text x={p.x + p.w - 14} y={p.y + p.h - 8} class="ornament" fill={SPIRIT_INK[r.spirit]?.colour ?? palette.accent} opacity={overview.spirits.find((s) => s.id === r.spirit)?.awake ? 1 : 0.35}>{SPIRIT_INK[r.spirit]?.ornament ?? "✦"}</text>{/if}
          {#if r.wards}<text x={p.x + 8} y={p.y + p.h - 8} class="tiny" fill={palette.faint}>{r.wards} ward{r.wards === 1 ? "" : "s"}</text>{/if}
          {#each r.apprentices as a, i}<circle cx={p.x + p.w - 30 - i * 10} cy={p.y + 10} r="3.5" fill={palette.accent} stroke={palette.paper} />{/each}
        </g>
      {/if}
    {/each}
    <!-- the hearth -->
    <g class="hearth" class:lit>
      <circle cx={HEARTH_XY.x} cy={HEARTH_XY.y} r="14" fill="#e8a24a" opacity="0.18" filter="url(#ink-glow)" />
      <circle cx={HEARTH_XY.x} cy={HEARTH_XY.y} r="4" fill={lit ? "#e8a24a" : palette.faint} />
    </g>
    <!-- the sky's night wash -->
    <rect width={VALLEY_W} height={VALLEY_H} fill="#1d2233" opacity={night * 0.35} pointer-events="none" />
    <text x={VALLEY_W - 12} y={VALLEY_H - 10} text-anchor="end" class="tiny" fill={palette.faint}>{overview.estateName ?? "the estate"} · {palette.name}</text>
  </svg>
</div>

<style>
  .valley { height: 100%; min-height: 0; display: grid; place-items: center; padding: 0.5rem; overflow: hidden; }
  .map { width: 100%; height: 100%; max-width: 100%; max-height: 100%; font-family: var(--serif); }
  .ley { fill: none; stroke-width: 1; stroke-dasharray: 2 6; opacity: 0.55; animation: flow 6s linear infinite; }
  .ley.bent { stroke-dasharray: 2 10; opacity: 0.3; }
  .river { fill: none; stroke-width: 5; stroke-linecap: round; opacity: 0.45; stroke-dasharray: 14 8; animation: flow 5s linear infinite; }
  .river.sings { opacity: 0.7; animation-duration: 2.4s; }
  .wall { stroke-width: 3; stroke-dasharray: 8 3; opacity: 0.7; }
  .region { cursor: pointer; transition: transform 300ms ease; transform-box: fill-box; transform-origin: center; }
  .region:hover { transform: scale(1.02); }
  .region:hover rect { stroke-opacity: 1; stroke-width: 1.6; }
  .region.ailing rect { animation: none; }
  .region.restored rect { stroke-dasharray: none; }
  .bleeding { filter: url(#bleed); }
  .label { font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
  .note { font-size: 10px; font-style: italic; }
  .tiny { font-size: 9px; }
  .sigil { font-size: 11px; opacity: 0.45; animation: flicker 2.2s ease-in-out infinite; }
  .ornament { font-size: 13px; }
  .ripple { fill: none; stroke-width: 1; opacity: 0.6; animation: drift 3s ease-in-out infinite alternate; }
  .hearth circle:first-child { animation: breathe 3s ease-in-out infinite alternate; }
  .hearth:not(.lit) circle:first-child { opacity: 0; animation: none; }
  @keyframes flow { to { stroke-dashoffset: -44; } }
  @keyframes flicker { 0%, 100% { opacity: 0.45; } 45% { opacity: 0.1; } 50% { opacity: 0.6; } 55% { opacity: 0.15; } }
  @keyframes drift { from { transform: translateX(-2px); } to { transform: translateX(2px); } }
  @keyframes breathe { from { opacity: 0.12; } to { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .ley, .river, .sigil, .ripple, .hearth circle { animation: none !important; } }
</style>
