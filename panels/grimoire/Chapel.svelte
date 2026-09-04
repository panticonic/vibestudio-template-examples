<script lang="ts">
  /**
   * The chapel: the council's cards with seals, the household's shelved
   * verses, and the walls of names, readable as earned.
   */
  import { onMount } from "svelte";
  import type { CouncilCard, GrimoireView, Notebook, Overview } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";

  let { client, apprentice, overview, onSaid }: { client: EstateClient; apprentice: string; overview: Overview; onSaid: (line: string) => void } = $props();

  let cards = $state<CouncilCard[]>([]);
  let shelf = $state<Notebook | null>(null);
  let names = $state<GrimoireView["names"]>([]);
  let error = $state<string | null>(null);

  async function load(): Promise<void> {
    try {
      cards = await client.call("council", {});
      shelf = await client.call("notebook", { id: "household", apprentice });
      names = (await client.call("grimoire", { apprentice })).names;
    } catch (err) { error = errorText(err); }
  }
  async function seal(id: string, yes: boolean): Promise<void> {
    try { const r = await client.call("seal", { apprentice, cardId: id, seal: yes }); onSaid(r.ok ? (yes ? (r.card?.status === "cast" ? "Sealed, and cast." : "Your seal is on it.") : "Withdrawn.") : (r.reason ?? "The card would not take the seal.")); await load(); }
    catch (err) { onSaid(errorText(err)); }
  }
  onMount(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); });
  const WALL = ["Hamanith", "Velharan", "Thesaurin", "Hahamadath", "Doranvel", "Tantanoes", "Lumevitre", "Saelolath", "Morithedor", "Ossnem", "Norael", "Aenithil", "Velhamanithael"];
  const known = $derived(new Set(names.map((n) => n.name)));
</script>

<div class="chapel">
  <h2>the chapel of names</h2>
  {#if error}<p class="error">{error}</p>{/if}

  <section>
    <h3>the council</h3>
    {#if !cards.filter((c) => c.status === "open").length}<p class="quiet">No card is on the table. Alone, the council is your own seal; it makes you read the card.</p>{/if}
    <div class="cards">
      {#each cards.filter((c) => c.status !== "withdrawn").slice().reverse() as c}
        <article class={`card ${c.status}`}>
          <h4>{c.title}</h4>
          <p class="summary">{c.summary}</p>
          {#if c.rehearsal}<p class="rehearsal">rehearsed: {c.rehearsal.summary}</p>{/if}
          <p class="meta">cost {c.cost} ether · needs {c.needs.map((n) => overview.apprentices.find((a) => a.id === n)?.name ?? n).join(", ")} · {c.status}</p>
          <div class="seals">
            {#each c.needs as n}<span class="seal" class:set={c.seals[n]} title={n}>{c.seals[n] ? "✦" : "○"} {overview.apprentices.find((a) => a.id === n)?.name ?? n}</span>{/each}
          </div>
          {#if c.status === "open" && c.needs.includes(apprentice) && !c.seals[apprentice]}
            <div class="acts"><button class="act yes" onclick={() => void seal(c.id, true)}>set my seal</button><button class="act" onclick={() => void seal(c.id, false)}>withhold</button></div>
          {/if}
        </article>
      {/each}
    </div>
  </section>

  <section>
    <h3>the household shelf</h3>
    {#if shelf && shelf.pages[0]?.verses.length}
      {#each shelf.pages as p}
        <blockquote class="verse">{#each p.verses[0]?.lines ?? [] as l}<span class="l">{l}</span>{/each}<footer>{p.text}</footer></blockquote>
      {/each}
    {:else}
      <p class="quiet">Empty. Shelve a verse from the spellbook and everyone in the house may speak it.</p>
    {/if}
  </section>

  <section class="walls">
    <h3>the walls</h3>
    <div class="stones">
      {#each WALL as n}<span class="stone" class:known={known.has(n)}>{known.has(n) ? n : "·".repeat(Math.max(4, Math.min(9, n.length)))}</span>{/each}
      {#each Array.from({ length: 30 }) as _, i}<span class="stone faint">{"·".repeat(4 + (i * 7) % 6)}</span>{/each}
    </div>
    <p class="quiet">Every master inscribed the true names they found. The deepest are under the others and answer only to household verse.</p>
  </section>
</div>

<style>
  .chapel { padding: 1.2rem 1.6rem 3rem; max-width: 46rem; display: grid; gap: 1.4rem; }
  h2 { margin: 0; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  h3 { font-weight: 500; margin: 0 0 0.5rem; color: var(--muted); font-size: 0.9rem; letter-spacing: 0.08em; }
  .cards { display: grid; gap: 0.6rem; }
  .card { border: 1px solid var(--border); border-radius: 12px; padding: 0.8rem 1rem; background: var(--card-bg); display: grid; gap: 0.3rem; }
  .card.sealed, .card.cast { opacity: 0.7; }
  h4 { margin: 0; font-weight: 500; }
  .summary { margin: 0; }
  .rehearsal, .meta { margin: 0; font-size: 0.82rem; color: var(--muted); font-style: italic; }
  .seals { display: flex; gap: 0.6rem; flex-wrap: wrap; font-size: 0.85rem; }
  .seal.set { color: var(--accent); }
  .acts { display: flex; gap: 0.5rem; margin-top: 0.3rem; }
  .act { font: inherit; font-size: 0.85rem; padding: 0.2rem 0.8rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  .act.yes { border-color: var(--accent); background: var(--accent); color: var(--accent-fg); }
  .verse { margin: 0 0 0.6rem; padding: 0.5rem 0.9rem; border-left: 3px solid var(--accent); font-family: var(--hand); font-size: 1.2rem; color: var(--ink-hand); }
  .verse .l { display: block; }
  .verse footer { font-family: var(--serif); font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
  .stones { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.8rem; background: color-mix(in srgb, var(--ink) 8%, var(--paper)); border-radius: 10px; }
  .stone { padding: 0.15rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; font-size: 0.85rem; letter-spacing: 0.08em; color: var(--muted); background: var(--card-bg); }
  .stone.known { color: var(--ink-hand); font-family: var(--hand); font-size: 1.05rem; letter-spacing: 0.02em; }
  .stone.faint { opacity: 0.45; }
  .quiet { color: var(--muted); font-style: italic; }
  .error { color: #b3261e; }
</style>
