<script lang="ts">
  import { portraitSvg, crestSvg } from "./lib/portrait.js";
  let { seed, color, size = 56, name = "", crest = true }: { seed: number; color: string; size?: number; name?: string; crest?: boolean } = $props();
  const face = $derived(portraitSvg(seed, color, size));
  const shield = $derived(crestSvg(seed, color, Math.round(size * 0.42)));
</script>

<span class="portrait" style={`--size:${size}px`} title={name}>
  <span class="face">{@html face}</span>
  {#if crest}<span class="crest">{@html shield}</span>{/if}
</span>

<style>
  .portrait { position: relative; display: inline-block; width: var(--size); height: var(--size); flex: none; }
  .face :global(svg) { display: block; border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(0,0,0,0.15); }
  .crest { position: absolute; right: -6px; bottom: -6px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4)); }
  .crest :global(svg) { display: block; }
</style>
