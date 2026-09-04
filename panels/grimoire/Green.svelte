<script lang="ts">
  /**
   * The green: festivals. The household's charms side by side, the judging
   * spirit's verse, and the news' record of past winners.
   */
  import { onMount } from "svelte";
  import type { FestivalRecord, Overview, SpellbookView } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { SPIRIT_INK } from "./lib/palette.js";

  let { client, apprentice, overview, onSaid }: { client: EstateClient; apprentice: string; overview: Overview; onSaid: (line: string) => void } = $props();

  let festivals = $state<FestivalRecord[]>([]);
  let charms = $state<SpellbookView["spells"]>([]);
  let error = $state<string | null>(null);
  const NAMES: Record<string, string> = { "first-sap": "First Sap", midsummer: "Midsummer", "first-frost": "First Frost", "long-dark": "the Long Dark" };
  const WHEN: Record<string, string> = { "first-sap": "mid-spring · the Orchard gives; the Hearth judges growth and colour", midsummer: "the longest day · light and moths; charms only; the Glass judges and is never satisfied", "first-frost": "the night of the first frost · fire and ash; the Foundry judges, loudly", "long-dark": "the new moon nearest midwinter · ether and stillness; the Ridge judges in weather; the familiar tells the year's story" };

  async function load(): Promise<void> {
    try { festivals = await client.call("festivals", {}); charms = (await client.call("spellbook", { apprentice })).spells.filter((s) => s.tier === "charm" && s.status === "cast"); }
    catch (err) { error = errorText(err); }
  }
  async function enter(spellId: string): Promise<void> {
    try { const r = await client.call("enterFestival", { apprentice, spellId }); onSaid(r.ok ? "Entered. The judge speaks when the festival ends." : (r.reason ?? "not entered")); await load(); }
    catch (err) { onSaid(errorText(err)); }
  }
  onMount(() => { void load(); const t = setInterval(() => void load(), 6000); return () => clearInterval(t); });
  const current = $derived(overview.sky.festival ? festivals.find((f) => f.id === overview.sky.festival && f.year === overview.sky.year) ?? null : null);
  const nameOf = (id: string) => overview.apprentices.find((a) => a.id === id)?.name ?? id;
</script>

<div class="green">
  <h2>the green</h2>
  {#if error}<p class="error">{error}</p>{/if}
  {#if current}
    <section class="now" style={`--spirit:${SPIRIT_INK[current.judge]?.colour ?? "var(--accent)"}`}>
      <h3>✦ {NAMES[current.id]} is on</h3>
      <p class="quiet">{WHEN[current.id]}</p>
      <div class="entries">
        {#each current.entries as e}
          <blockquote class="entry" class:winner={current.winner === e.by}><span class="who">{nameOf(e.by)}</span>{#each e.verse.split("\n") as l}<span class="l">{l}</span>{/each}</blockquote>
        {:else}
          <p class="quiet">No entries yet. Enter a charm of yours below.</p>
        {/each}
      </div>
      {#if current.verdict}<p class="verdict"><span class="judge">{SPIRIT_INK[current.judge]?.ornament ?? "✦"} {overview.spirits.find((s) => s.id === current.judge)?.title ?? current.judge}:</span> {current.verdict}</p>{/if}
      {#if !current.verdict}
        <h4>your charms</h4>
        <div class="charms">
          {#each charms as c}<button class="charm" onclick={() => void enter(c.id)}>{c.name ?? c.lines[0]}</button>{:else}<p class="quiet">Make a charm first: light, colour, moths, a mark. Magic that need not be useful.</p>{/each}
        </div>
      {/if}
    </section>
  {:else}
    <p class="quiet">No festival tonight. Four a year, on the green, rung by the bell once it is true: First Sap, Midsummer, First Frost, the Long Dark. The Moor is quiet on festival nights; it has never been asked to one.</p>
  {/if}
  <section>
    <h3>past festivals</h3>
    {#if !festivals.filter((f) => f.verdict).length}<p class="quiet">None judged yet.</p>{/if}
    <ul class="past">
      {#each festivals.filter((f) => f.verdict).slice().reverse() as f}
        <li><strong>{NAMES[f.id]}, year {f.year}</strong> — judged by {overview.spirits.find((s) => s.id === f.judge)?.title ?? f.judge}{f.winner ? `; ${nameOf(f.winner)} won` : "; nobody won"}<br /><em>{f.verdict}</em></li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .green { padding: 1.2rem 1.6rem 3rem; max-width: 46rem; display: grid; gap: 1.2rem; }
  h2 { margin: 0; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  h3 { margin: 0 0 0.3rem; font-weight: 500; }
  h4 { margin: 0.8rem 0 0.3rem; font-weight: 500; color: var(--muted); font-size: 0.9rem; }
  .now { border: 1px solid var(--spirit); border-radius: 12px; padding: 1rem 1.2rem; background: color-mix(in srgb, var(--spirit) 6%, var(--card-bg)); }
  .entries { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.6rem; }
  .entry { margin: 0; padding: 0.5rem 0.8rem; border: 1px solid var(--border); border-radius: 8px; font-family: var(--hand); font-size: 1.15rem; color: var(--ink-hand); background: var(--card-bg); }
  .entry.winner { border-color: var(--spirit); box-shadow: 0 0 0 2px color-mix(in srgb, var(--spirit) 30%, transparent); }
  .entry .who { display: block; font-family: var(--serif); font-size: 0.75rem; color: var(--muted); margin-bottom: 0.2rem; }
  .entry .l { display: block; }
  .verdict { margin: 0.8rem 0 0; font-style: italic; white-space: pre-line; }
  .judge { color: var(--spirit); font-style: normal; }
  .charms { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .charm { font: inherit; font-size: 0.85rem; padding: 0.2rem 0.7rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  .charm:hover { border-color: var(--accent); }
  .past { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
  .quiet { color: var(--muted); font-style: italic; margin: 0.3rem 0; }
  .error { color: #b3261e; }
</style>
