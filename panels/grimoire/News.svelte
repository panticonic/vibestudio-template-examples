<script lang="ts">
  /**
   * The estate's news: a page per day in the familiar's hand, with the
   * spirits' notes in their colours. Every page ends with one small thing to
   * do right now. Everything acknowledges on read.
   */
  import { onMount } from "svelte";
  import type { NewsPage, RegionId, SpiritId } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { SPIRIT_INK } from "./lib/palette.js";

  let { client, apprentice, onOpenRegion }: { client: EstateClient; apprentice: string; onOpenRegion: (id: RegionId) => void } = $props();

  let pages = $state<NewsPage[]>([]);
  let error = $state<string | null>(null);

  async function load(): Promise<void> {
    try {
      const out = await client.call("news", { apprentice, limit: 30 });
      pages = out.pages;
      const unread = out.pages.filter((p) => !p.read).map((p) => p.id);
      if (unread.length) await client.call("acknowledgeNews", { apprentice, pageIds: unread });
    } catch (err) { error = errorText(err); }
  }
  onMount(() => { void load(); const t = setInterval(() => void load(), 8000); return () => clearInterval(t); });
  function inkOf(hand: string): string { return (SPIRIT_INK as Record<string, { colour: string }>)[hand]?.colour ?? "var(--ink)"; }
</script>

<div class="news">
  <h2>the estate's news</h2>
  {#if error}<p class="error">{error}</p>{/if}
  {#if !pages.length}<p class="quiet">Nothing yet. Persistent spells, chartered golems and spirits write here while you are away; let a day pass and come back.</p>{/if}
  {#each pages as p}
    <article class="page" class:unread={!p.read}>
      <header>day {p.day + 1} of {p.season}, year {p.year}</header>
      <ul>
        {#each p.items as it}
          <li class={`rung-${it.rung} hand-${it.hand}`} style={`--hand:${inkOf(it.hand)}`}>
            {#if it.hand !== "familiar" && it.hand !== "world"}<span class="by">{it.by}</span>{/if}
            <span class="text">{it.text}</span>
            {#if it.region}<button class="link" onclick={() => onOpenRegion(it.region!)}>look</button>{/if}
          </li>
        {/each}
      </ul>
      {#if p.oneThing}
        <footer>
          <span class="one">One small thing: {p.oneThing.text}</span>
          {#if p.oneThing.region}<button class="link" onclick={() => onOpenRegion(p.oneThing!.region!)}>go</button>{/if}
        </footer>
      {/if}
    </article>
  {/each}
</div>

<style>
  .news { padding: 1.2rem 1.6rem 3rem; max-width: 44rem; display: grid; gap: 1rem; }
  h2 { margin: 0; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  .page { background: color-mix(in srgb, var(--paper) 88%, #fff8e6); border: 1px solid var(--border); border-radius: 4px; padding: 1rem 1.3rem; box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
  .page.unread { border-left: 3px solid var(--accent); }
  header { font-family: var(--hand); font-size: 1.25rem; color: var(--ink-hand); margin-bottom: 0.4rem; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.25rem; }
  li { display: flex; gap: 0.5rem; align-items: baseline; line-height: 1.45; }
  li.rung-urgent .text { font-weight: 600; }
  li.rung-urgent::before { content: "!"; color: #b3261e; font-weight: 700; }
  li.hand-familiar { font-style: italic; }
  .by { color: var(--hand); font-size: 0.8rem; letter-spacing: 0.04em; white-space: nowrap; }
  li:not(.hand-familiar):not(.hand-world) .text { color: color-mix(in srgb, var(--hand) 70%, var(--ink)); }
  footer { margin-top: 0.7rem; padding-top: 0.5rem; border-top: 1px dotted var(--border); display: flex; gap: 0.5rem; align-items: baseline; }
  .one { font-family: var(--hand); font-size: 1.15rem; color: var(--ink-hand); }
  .link { font: inherit; font-size: 0.8rem; border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline dotted; }
  .quiet { color: var(--muted); font-style: italic; }
  .error { color: #b3261e; }
</style>
