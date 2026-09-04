<script lang="ts">
  /**
   * The study: warm and typographic. The letter, the notebooks with their
   * verses marked as echoable, the lineage's stories, the reactions with
   * glosses, and the door to the study conversation.
   */
  import { onMount } from "svelte";
  import type { Notebook, Overview, StudyView } from "@workspace/grimoire-engine";
  import { REACTIONS, REACTION_GLOSSES } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { openConversation, studyChannelKey } from "./lib/estate.js";

  let { client, apprentice, overview, onEcho }: { client: EstateClient; apprentice: string; overview: Overview; onEcho: (verse: string) => void } = $props();

  let view = $state<StudyView | null>(null);
  let letter = $state<string>("");
  let open = $state<Notebook | null>(null);
  let tab = $state<"letter" | "notebooks" | "stories" | "reactions">("notebooks");
  let error = $state<string | null>(null);

  async function load(): Promise<void> {
    try {
      view = await client.call("study", { apprentice });
      letter = (await client.call("letter", {})).text;
    } catch (err) { error = errorText(err); }
  }
  async function openNotebook(id: string): Promise<void> {
    try { open = await client.call("notebook", { id, apprentice }); } catch (err) { error = errorText(err); }
  }
  onMount(() => { void load(); });
  const studyOpen = $derived(overview.apprentices.find((a) => a.id === apprentice) !== undefined);
</script>

<div class="study">
  <header>
    <h2>the study</h2>
    <nav>
      <button class:on={tab === "letter"} onclick={() => (tab = "letter")}>the letter</button>
      <button class:on={tab === "notebooks"} onclick={() => { tab = "notebooks"; open = null; }}>notebooks</button>
      <button class:on={tab === "stories"} onclick={() => (tab = "stories")}>stories</button>
      <button class:on={tab === "reactions"} onclick={() => (tab = "reactions")}>how the valley works</button>
    </nav>
    <button class="talk" onclick={() => void openConversation(studyChannelKey(client.estateKey, apprentice))} disabled={!studyOpen}>speak with the familiar</button>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  {#if tab === "letter"}
    <article class="letter">
      {#each letter.split("\n\n") as para}<p>{para}</p>{/each}
    </article>
  {:else if tab === "notebooks"}
    {#if !open}
      <ul class="shelf">
        {#each view?.notebooks ?? [] as nb}
          <li>
            <button class="book" onclick={() => void openNotebook(nb.id)} disabled={nb.locked && nb.id === "corwen"}>
              <span class="title">{nb.title}</span>
              <span class="meta">{nb.author} · {nb.era} · {nb.pages} page{nb.pages === 1 ? "" : "s"}{nb.missingPages ? ` · ${nb.missingPages} missing` : ""}{nb.locked ? " · bound shut" : ""}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <article class="notebook">
        <button class="link" onclick={() => (open = null)}>← the shelf</button>
        <h3>{open.title}</h3>
        <p class="meta">{open.author}, {open.era}</p>
        {#each open.pages as page}
          <section class="page">
            <span class="folio">{page.n}</span>
            <p>{page.text}</p>
            {#each page.verses as v}
              <blockquote class="verse" class:old={!v.echoable}>
                {#each v.lines as l}<span class="l">{l}</span>{/each}
                <footer><span class="about">{v.about}</span>{#if v.echoable}<button class="echo" onclick={() => onEcho(v.lines.join("\n"))}>echo it</button>{/if}</footer>
              </blockquote>
            {/each}
            {#if page.words?.length}<p class="words">words on this page: {page.words.join(", ")}</p>{/if}
          </section>
        {/each}
      </article>
    {/if}
  {:else if tab === "stories"}
    {#if !view?.stories.length}
      <p class="quiet">The familiar tells one story a bell hour, in the evening, once the garden is warded. None yet.</p>
    {:else}
      {#each view.stories as s}
        <article class="story">
          <h3>{s.title}</h3>
          <p class="meta">{s.about}</p>
          {#each s.text.split("\n\n") as para}<p>{para}</p>{/each}
        </article>
      {/each}
    {/if}
  {:else}
    <table class="reactions">
      <thead><tr><th>#</th><th>when</th><th>then</th><th>in plain words</th></tr></thead>
      <tbody>
        {#each REACTIONS as r}
          <tr class:learned={r.n <= 10}><td>{r.n}</td><td>{r.when}</td><td>{r.then}</td><td class="gloss">{REACTION_GLOSSES[r.n]}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="quiet">The first ten you can learn by watching. The rest you learn by being surprised, and every surprise is recoverable.</p>
    {#if view}
      <h3>words you know</h3>
      <dl class="words-known">
        {#each Object.entries(view.wordsExplained) as [w, text]}<dt>{w}</dt><dd>{text}</dd>{/each}
      </dl>
    {/if}
  {/if}
</div>

<style>
  .study { padding: 1.2rem 1.6rem 3rem; max-width: 46rem; line-height: 1.55; }
  header { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; align-items: center; margin-bottom: 1rem; }
  h2 { margin: 0; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  nav { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  nav button, .talk { font: inherit; font-size: 0.85rem; padding: 0.2rem 0.7rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  nav button.on { background: color-mix(in srgb, var(--ink) 12%, transparent); border-color: var(--ink); }
  .talk { margin-left: auto; border-color: var(--accent); color: var(--accent); }
  .talk:disabled { opacity: 0.5; }
  .letter p, .story p { font-size: 1.05rem; }
  .shelf { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
  .book { width: 100%; text-align: left; font: inherit; padding: 0.7rem 0.9rem; border: 1px solid var(--border); border-radius: 10px; background: var(--card-bg); color: var(--fg); cursor: pointer; display: grid; gap: 0.15rem; }
  .book:hover { border-color: var(--accent); }
  .book:disabled { opacity: 0.6; cursor: not-allowed; }
  .title { font-size: 1.05rem; }
  .meta { color: var(--muted); font-size: 0.85rem; font-style: italic; }
  .notebook h3, .story h3 { font-weight: 500; margin: 0.6rem 0 0.1rem; }
  .page { position: relative; padding: 0.6rem 0 0.6rem 2rem; border-top: 1px dotted var(--border); }
  .folio { position: absolute; left: 0; top: 0.7rem; color: var(--muted); font-size: 0.8rem; }
  .verse { margin: 0.6rem 0; padding: 0.6rem 0.9rem; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); border-radius: 0 8px 8px 0; font-family: var(--hand); font-size: 1.2rem; color: var(--ink-hand); }
  .verse.old { font-family: var(--serif); font-style: italic; font-size: 1rem; border-color: var(--border); }
  .verse .l { display: block; }
  .verse footer { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.3rem; font-family: var(--serif); font-size: 0.8rem; color: var(--muted); }
  .echo { font: inherit; font-size: 0.8rem; border: 1px solid var(--accent); color: var(--accent); background: transparent; border-radius: 999px; padding: 0.05rem 0.6rem; cursor: pointer; }
  .words { font-size: 0.85rem; color: var(--muted); }
  .link { font: inherit; border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0; }
  .reactions { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
  .reactions th, .reactions td { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px dotted var(--border); vertical-align: top; }
  .reactions tr.learned td:first-child { color: var(--accent); }
  .gloss { font-style: italic; color: var(--muted); }
  .quiet { color: var(--muted); font-style: italic; }
  .words-known dt { font-weight: 600; margin-top: 0.4rem; }
  .words-known dd { margin: 0; color: var(--muted); }
  .error { color: #b3261e; }
</style>
