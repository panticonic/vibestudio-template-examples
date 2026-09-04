<script lang="ts">
  /**
   * The spellbook: the player's own verses, named, instant to recast, with a
   * small before-and-after of what each did. The artifact players screenshot.
   */
  import { onMount } from "svelte";
  import type { SpellbookView } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { deltaBars } from "./lib/draw.js";
  import { LAYER_INK } from "./lib/palette.js";

  let { client, apprentice, onScry, onSaid }: { client: EstateClient; apprentice: string; onScry: (id: string) => void; onSaid: (line: string) => void } = $props();

  let view = $state<SpellbookView | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let group = $state<"tier" | "region">("tier");

  async function load(): Promise<void> { try { view = await client.call("spellbook", { apprentice }); } catch (err) { error = errorText(err); } }
  async function recast(id: string): Promise<void> {
    busy = id;
    try { const r = await client.call("recast", { apprentice, spellId: id }); onSaid(r.ok ? `Spoken again. ${r.receipts?.length ?? 0} changes.` : (r.reason ?? "The world did not hear it.")); await load(); }
    catch (err) { onSaid(errorText(err)); } finally { busy = null; }
  }
  async function release(id: string): Promise<void> {
    busy = id;
    try { const r = await client.call("release", { apprentice, spellId: id }); onSaid(r.ok ? "Released. Release is always free." : (r.reason ?? "not released")); await load(); }
    catch (err) { onSaid(errorText(err)); } finally { busy = null; }
  }
  async function shelve(id: string, shelved: boolean): Promise<void> { await client.call("shelve", { apprentice, spellId: id, shelved }); await load(); onSaid(shelved ? "Shelved in the chapel for the household." : "Taken back from the shelf."); }
  onMount(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); });

  const groups = $derived(() => {
    if (!view) return [] as Array<{ key: string; spells: SpellbookView["spells"] }>;
    const m = new Map<string, SpellbookView["spells"]>();
    for (const s of view.spells) { const k = group === "tier" ? s.tier : (s.region ?? "nowhere"); if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); }
    return [...m.entries()].map(([key, spells]) => ({ key, spells }));
  });
</script>

<div class="spellbook">
  <header>
    <h2>the spellbook</h2>
    <span class="count">{view?.spells.length ?? 0} verse{(view?.spells.length ?? 0) === 1 ? "" : "s"}</span>
    <span class="grow"></span>
    <button class="pill" class:on={group === "tier"} onclick={() => (group = "tier")}>by tier</button>
    <button class="pill" class:on={group === "region"} onclick={() => (group = "region")}>by place</button>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  {#if view && !view.spells.length}
    <p class="quiet">Empty. A spell you have cast is yours; it will be written here, and speaking it again will not need the familiar.</p>
  {/if}
  {#each groups() as g}
    <h3>{g.key}</h3>
    <div class="cards">
      {#each g.spells as s}
        <article class={`card ${s.status}`} class:variant={!!s.variantOf}>
          <h4>{s.name ?? "(unnamed)"}{#if s.fromCache}<span class="instant" title="spoken again without the familiar">✧</span>{/if}</h4>
          <blockquote>{#each s.lines as l}<span class="l">{l}</span>{/each}</blockquote>
          <div class="bars">
            {#each deltaBars(s.before, s.after) as b}
              <span class="bar" title={`${b.layer}: ${b.before} → ${b.after}`} style={`--ink:${LAYER_INK[b.layer]}`}><i style={`width:${Math.min(100, Math.abs(b.after - b.before) * 6)}%`}></i><small>{b.layer} {b.after > b.before ? "+" : ""}{b.after - b.before}</small></span>
            {/each}
          </div>
          <footer>
            <span class="meta">{s.tier}{s.region ? ` · ${s.region}` : ""}{s.firings ? ` · fired ${s.firings}×` : ""}{s.status !== "cast" ? ` · ${s.status}` : ""}</span>
            <span class="grow"></span>
            {#if s.instant && s.status === "cast" && !s.firings}<button class="act" disabled={busy === s.id} onclick={() => void recast(s.id)}>cast again</button>{/if}
            {#if s.status === "cast" && s.firings > 0}<button class="act" disabled={busy === s.id} onclick={() => void release(s.id)}>release</button>{/if}
            <button class="act" onclick={() => void shelve(s.id, !s.shelved)}>{s.shelved ? "unshelve" : "shelve"}</button>
            <button class="act" onclick={() => onScry(s.id)}>scry</button>
          </footer>
        </article>
      {/each}
    </div>
  {/each}
</div>

<style>
  .spellbook { padding: 1.2rem 1.6rem 3rem; }
  header { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.6rem; }
  h2 { margin: 0; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  h3 { font-weight: 500; margin: 1.2rem 0 0.5rem; color: var(--muted); font-size: 0.95rem; letter-spacing: 0.06em; }
  .count { color: var(--muted); font-size: 0.85rem; }
  .grow { flex: 1; }
  .pill, .act { font: inherit; font-size: 0.8rem; padding: 0.15rem 0.6rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  .pill.on { border-color: var(--ink); background: color-mix(in srgb, var(--ink) 12%, transparent); }
  .act:disabled { opacity: 0.5; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 0.7rem; }
  .card { border: 1px solid var(--border); border-radius: 12px; padding: 0.7rem 0.9rem; background: var(--card-bg); display: grid; gap: 0.4rem; box-shadow: 0 1px 0 rgba(0,0,0,0.04); }
  .card.misfired { border-color: #e2792b; }
  .card.released { opacity: 0.7; }
  .card.variant { border-style: dashed; }
  h4 { margin: 0; font-weight: 500; font-size: 1rem; display: flex; gap: 0.4rem; align-items: center; }
  .instant { color: var(--accent); }
  blockquote { margin: 0; font-family: var(--hand); font-size: 1.15rem; color: var(--ink-hand); line-height: 1.35; }
  blockquote .l { display: block; }
  .bars { display: flex; flex-wrap: wrap; gap: 0.3rem 0.7rem; }
  .bar { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: var(--muted); }
  .bar i { display: inline-block; height: 4px; min-width: 6px; max-width: 60px; background: var(--ink); border-radius: 2px; }
  footer { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .meta { font-size: 0.78rem; color: var(--muted); font-style: italic; }
  .quiet { color: var(--muted); font-style: italic; }
  .error { color: #b3261e; }
</style>
