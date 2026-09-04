<script lang="ts">
  import type { Sky } from "@workspace/grimoire-engine";
  import { MOON_GLYPHS, WEATHER_LABEL, hourLabel } from "./lib/palette.js";

  let { sky, onAdvance, busy = false }: { sky: Sky; onAdvance: (ticks: number) => void; busy?: boolean } = $props();
  const dayOfYear = $derived(sky.day + 1);
  const forecastLine = $derived(
    sky.forecast.length === 0
      ? null
      : sky.forecast
          .slice(0, 2)
          .map((f) => `${f.name ? `${f.name}, ` : ""}${WEATHER_LABEL[f.weather] ?? f.weather} in ${f.inDays} day${f.inDays === 1 ? "" : "s"}`)
          .join("; "),
  );
</script>

<div class="sky" class:night={sky.hour >= 20 || sky.hour < 5}>
  <span class="moon" title={`moon phase ${sky.moon}/8`}>{MOON_GLYPHS[sky.moon] ?? "🌑"}</span>
  <span class="when">
    <strong>{hourLabel(sky.hour)}</strong>, day {dayOfYear} of {sky.season}, year {sky.year}
    {#if !sky.bellTrue}<em class="drift" title="the bell is cracked; hours drift">(the bell drifts)</em>{/if}
  </span>
  <span class="weather">{WEATHER_LABEL[sky.weather] ?? sky.weather}{#if sky.windForce > 0}, wind {sky.windDir.toUpperCase()} {sky.windForce}{/if}</span>
  {#if sky.festival}<span class="festival">✦ {sky.festival.replace("-", " ")}</span>{/if}
  {#if forecastLine}<span class="forecast" title="the sky, three days ahead">{forecastLine}</span>{/if}
  <span class="grow"></span>
  <span class="bell" title="bell hours since the estate began">bell {sky.bell}</span>
  <button class="tick" disabled={busy} onclick={() => onAdvance(1)} title="let an hour pass">an hour</button>
  <button class="tick" disabled={busy} onclick={() => onAdvance(24)} title="let the day pass">the day</button>
</div>

<style>
  .sky {
    display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
    padding: 0.35rem 0.75rem; border-bottom: 1px solid var(--border);
    font-size: 0.85rem; color: var(--muted); background: var(--card-bg);
    transition: background 1.2s ease;
  }
  .sky.night { background: var(--night-bg); }
  .moon { font-size: 1.1rem; }
  .when strong { color: var(--fg); font-weight: 600; }
  .drift { margin-left: 0.4rem; font-style: italic; opacity: 0.8; }
  .festival { color: var(--accent); font-weight: 600; }
  .forecast { font-style: italic; }
  .grow { flex: 1; }
  .bell { font-variant-numeric: tabular-nums; opacity: 0.8; }
  .tick { font: inherit; padding: 0.15rem 0.6rem; border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--fg); cursor: pointer; }
  .tick:hover { border-color: var(--accent); }
  .tick:disabled { opacity: 0.5; cursor: wait; }
</style>
