<script lang="ts">
  /**
   * The grimoire: known words and earned entries, smudged unknowns, true
   * names, wild words with provenance, the master's index, foci, bargains,
   * active spells, and the undone list in Ysolde's hand.
   */
  import { onMount } from "svelte";
  import type { GrimoireView, Overview, RegionId } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";

  let { client, apprentice, overview, onOpenRegion, onScry }: { client: EstateClient; apprentice: string; overview: Overview; onOpenRegion: (id: RegionId) => void; onScry: (spellId: string) => void } = $props();

  let view = $state<GrimoireView | null>(null);
  let error = $state<string | null>(null);
  let newItem = $state("");
  let tab = $state<"words" | "names" | "undone" | "active">("undone");

  async function load(): Promise<void> {
    try { view = await client.call("grimoire", { apprentice }); } catch (err) { error = errorText(err); }
  }
  async function add(): Promise<void> {
    const text = newItem.trim(); if (!text) return;
    await client.call("addUndone", { apprentice, text });
    newItem = "";
  }
  onMount(() => { void load(); const t = setInterval(() => void load(), 6000); return () => clearInterval(t); });
  const families = $derived(view ? [...new Set(view.known.map((k) => k.family))] : []);
</script>

<div class="grimoire">
  <header>
    <h2>the grimoire</h2>
    <nav>
      <button class:on={tab === "undone"} onclick={() => (tab = "undone")}>undone</button>
      <button class:on={tab === "words"} onclick={() => (tab = "words")}>words</button>
      <button class:on={tab === "names"} onclick={() => (tab = "names")}>names & foci</button>
      <button class:on={tab === "active"} onclick={() => (tab = "active")}>bindings</button>
    </nav>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  {#if tab === "undone"}
    <ul class="undone">
      {#each overview.undone as u}
        <li class={`hand-${u.hand}`} class:done={u.done}>
          <span class="text">{u.text}</span>
          {#if u.region}<button class="link" onclick={() => onOpenRegion(u.region!)}>look</button>{/if}
          {#if u.notes.length}<span class="notes">{u.notes.join(" · ")}</span>{/if}
        </li>
      {/each}
    </ul>
    <form class="add" onsubmit={(e) => { e.preventDefault(); void add(); }}>
      <input bind:value={newItem} placeholder="add a line in your own hand" />
      <button type="submit" disabled={!newItem.trim()}>add</button>
    </form>
  {:else if tab === "words" && view}
    {#each families as fam}
      <h3>{fam}</h3>
      <div class="cards">
        {#each view.known.filter((k) => k.family === fam) as k}
          <div class="card">
            <div class="root">{k.root ?? "—"}</div>
            <div class="id">{k.id}</div>
            <div class="gloss">{k.gloss}</div>
            {#if k.learnedFrom}<div class="from">from {k.learnedFrom}</div>{/if}
          </div>
        {/each}
      </div>
    {/each}
    {#if view.inscriptions.length}
      <h3>wild words</h3>
      <div class="cards">
        {#each view.inscriptions as i}
          <div class="card wild"><div class="root">{i.word}</div><div class="gloss">{i.definition}</div><div class="from">{i.by}, first: {i.firstEffect}</div></div>
        {/each}
      </div>
    {/if}
    <h3>smudged</h3>
    <div class="cards">
      {#each view.smudged as s}
        <div class="card smudged"><div class="root">·····</div><div class="gloss">{s.hint}</div><div class="from">{s.family}</div></div>
      {/each}
    </div>
    <h3>the master's index</h3>
    <ul class="index">
      {#each view.masterIndex as shelf}
        <li class:closed={!shelf.open}><strong>{shelf.shelf}</strong> — {shelf.open ? shelf.words.join(", ") : "the Library has not read this shelf aloud"}</li>
      {/each}
    </ul>
  {:else if tab === "names" && view}
    <h3>true names</h3>
    <div class="cards">
      {#each view.names as n}
        <div class="card name"><div class="root">{n.name}</div><div class="gloss">{n.meaning}</div><div class="from">{n.kind}</div></div>
      {/each}
    </div>
    <h3>foci</h3>
    <div class="cards">
      {#each view.foci as f}
        <div class="card" class:broken={f.broken}><div class="root">{f.name}</div><div class="gloss">{f.concepts.join(", ")} · {f.regions === "estate" ? "the whole estate" : f.regions.join(", ")}</div><div class="from">{f.broken ? "broken" : "whole"} · made by {f.madeBy}</div></div>
      {/each}
    </div>
    {#if view.bargains.length}
      <h3>bargains</h3>
      <ul class="index">{#each view.bargains as b}<li>{b.spirit}: {b.offer.want} — {b.status}{b.answer ? ` · "${b.answer}"` : ""}</li>{/each}</ul>
    {/if}
  {:else if tab === "active" && view}
    <ul class="index">
      {#each view.active as a}
        <li><strong>{a.name ?? a.id}</strong> · {a.tier} · upkeep {a.upkeep}{a.region ? ` · ${a.region}` : ""} <button class="link" onclick={() => onScry(a.id)}>scry</button></li>
      {:else}
        <li class="quiet">nothing of yours is running yet</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .grimoire { padding: 1.2rem 1.6rem 3rem; max-width: 46rem; }
  header { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; align-items: center; margin-bottom: 1rem; }
  h2 { margin: 0; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  h3 { font-weight: 500; margin: 1.2rem 0 0.5rem; color: var(--muted); font-size: 0.95rem; letter-spacing: 0.06em; }
  nav { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  nav button { font: inherit; font-size: 0.85rem; padding: 0.2rem 0.7rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  nav button.on { background: color-mix(in srgb, var(--ink) 12%, transparent); border-color: var(--ink); }
  .undone { list-style: none; padding: 0.5rem 1rem; margin: 0; font-family: var(--hand); font-size: 1.35rem; color: var(--ink-hand); background: color-mix(in srgb, var(--paper) 85%, #e8d9b8); border-radius: 10px; border: 1px solid var(--border); }
  .undone li { padding: 0.3rem 0; display: flex; gap: 0.8rem; align-items: baseline; }
  .undone li.done .text { text-decoration: line-through; opacity: 0.55; }
  .undone li.hand-familiar { font-family: var(--serif); font-style: italic; font-size: 1rem; }
  .undone li.hand-apprentice { font-family: var(--serif); font-size: 1rem; }
  .undone .notes { font-family: var(--serif); font-size: 0.8rem; color: var(--muted); }
  .add { display: flex; gap: 0.5rem; margin-top: 0.8rem; }
  .add input { flex: 1; font: inherit; padding: 0.4rem 0.7rem; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg); }
  .add button { font: inherit; padding: 0.3rem 0.8rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.5rem; }
  .card { border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.7rem; background: var(--card-bg); display: grid; gap: 0.15rem; }
  .card .root { font-family: var(--hand); font-size: 1.3rem; color: var(--ink-hand); }
  .card .id { font-size: 0.8rem; color: var(--muted); }
  .card .gloss { font-size: 0.85rem; }
  .card .from { font-size: 0.75rem; color: var(--muted); font-style: italic; }
  .card.smudged .root { filter: blur(2px); opacity: 0.6; }
  .card.wild { border-style: dashed; }
  .card.broken { opacity: 0.6; }
  .card.name .root { letter-spacing: 0.04em; }
  .index { padding-left: 1.2rem; }
  .index li { padding: 0.2rem 0; }
  .index li.closed { color: var(--muted); font-style: italic; }
  .link { font: inherit; font-size: 0.85rem; border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline dotted; }
  .quiet { color: var(--muted); font-style: italic; list-style: none; }
  .error { color: #b3261e; }
</style>
