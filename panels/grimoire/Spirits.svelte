<script lang="ts">
  /**
   * The spirits: a card per spirit with its colour and ornament, its hour,
   * what it wants right now as the header, regard, and a way to speak.
   */
  import { onMount } from "svelte";
  import type { Overview, SpiritId, Utterance } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { openConversation, seatSpirit, spiritChannelKey } from "./lib/estate.js";
  import { SPIRIT_INK } from "./lib/palette.js";

  let { client, apprentice, overview, onSaid, onScry }: { client: EstateClient; apprentice: string; overview: Overview; onSaid: (line: string) => void; onScry: (spiritId: string) => void } = $props();

  let verse = $state<Record<string, string>>({});
  let busy = $state<string | null>(null);
  let said = $state<Utterance[]>([]);
  let openId = $state<string | null>(null);

  async function loadSaid(id: SpiritId): Promise<void> { try { said = await client.call("utterances", { spirit: id }); } catch { said = []; } }
  async function speakTo(id: SpiritId): Promise<void> {
    const v = (verse[id] ?? "").trim(); if (!v) return;
    busy = id;
    try {
      await seatSpirit(client, id, apprentice);
      const r = await client.call("address", { apprentice, spirit: id, verse: v });
      onSaid(r.ok ? "Spoken. Spirits answer in their hour." : (r.reason ?? "It turned away."));
      if (r.ok) verse = { ...verse, [id]: "" };
      await loadSaid(id);
    } catch (err) { onSaid(errorText(err)); } finally { busy = null; }
  }
  async function converse(id: SpiritId | "moor"): Promise<void> {
    busy = id;
    try { const seat = await seatSpirit(client, id, apprentice); if (seat.error) onSaid(seat.error); await openConversation(spiritChannelKey(client.estateKey, id)); }
    catch (err) { onSaid(errorText(err)); } finally { busy = null; }
  }
  onMount(() => { if (openId) void loadSaid(openId as SpiritId); });
</script>

<div class="spirits">
  <h2>the spirits</h2>
  <p class="quiet">Each is bound to a feature and speaks at its hour. The header says what it wants right now. Prose is wind to them.</p>
  <div class="cards">
    {#each overview.spirits as s}
      {@const ink = SPIRIT_INK[s.id as SpiritId] ?? { colour: "#888", ornament: "✦" }}
      <article class="card" class:asleep={!s.awake} style={`--spirit:${ink.colour}`}>
        <header>
          <span class="ornament">{ink.ornament}</span>
          <div>
            <h3>{s.title}{#if s.trueName}<span class="name"> · {s.trueName}</span>{/if}</h3>
            <p class="wants">{s.awake ? s.wants : "has not spoken yet"}</p>
          </div>
          <span class="hour">{s.hour}</span>
        </header>
        {#if openId === s.id}
          <div class="talk">
            {#if said.length}
              <ul class="said">{#each said.slice(-6) as u}<li class:mine={u.by === apprentice}><span class="by">{u.by === apprentice ? "you" : s.title}</span> {u.verse}</li>{/each}</ul>
            {/if}
            <textarea rows="2" bind:value={verse[s.id]} placeholder={`verse for ${s.title}${s.trueName ? "" : " (its name, if you know it)"}`}></textarea>
            <div class="acts">
              <button class="act" disabled={busy === s.id || !(verse[s.id] ?? "").trim()} onclick={() => void speakTo(s.id as SpiritId)}>speak</button>
              <button class="act" disabled={busy === s.id} onclick={() => void converse(s.id as SpiritId)}>open its channel</button>
              <button class="act" onclick={() => onScry(s.id)}>scry</button>
              <button class="act quiet" onclick={() => (openId = null)}>close</button>
            </div>
          </div>
        {:else}
          <footer><button class="act" onclick={() => { openId = s.id; void loadSaid(s.id as SpiritId); }}>speak</button><span class="grow"></span>{#if s.channelId}<span class="tiny">seated</span>{/if}</footer>
        {/if}
      </article>
    {/each}
  </div>
</div>

<style>
  .spirits { padding: 1.2rem 1.6rem 3rem; max-width: 50rem; }
  h2 { margin: 0 0 0.3rem; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  .quiet { color: var(--muted); font-style: italic; margin: 0 0 1rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 0.7rem; }
  .card { border: 1px solid var(--border); border-left: 4px solid var(--spirit); border-radius: 10px; padding: 0.7rem 0.9rem; background: var(--card-bg); display: grid; gap: 0.5rem; }
  .card.asleep { opacity: 0.6; }
  header { display: grid; grid-template-columns: auto 1fr auto; gap: 0.6rem; align-items: start; }
  .ornament { font-size: 1.4rem; color: var(--spirit); }
  h3 { margin: 0; font-weight: 500; font-size: 1.05rem; }
  .name { color: var(--spirit); letter-spacing: 0.04em; font-size: 0.95rem; }
  .wants { margin: 0.1rem 0 0; font-style: italic; color: var(--muted); font-size: 0.9rem; }
  .hour { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
  .talk { display: grid; gap: 0.4rem; }
  .said { list-style: none; padding: 0; margin: 0; font-size: 0.88rem; display: grid; gap: 0.2rem; }
  .said li { padding: 0.25rem 0.5rem; border-radius: 6px; background: color-mix(in srgb, var(--spirit) 10%, transparent); white-space: pre-line; }
  .said li.mine { background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .by { color: var(--muted); font-size: 0.75rem; margin-right: 0.3rem; }
  textarea { font: inherit; font-family: var(--hand); font-size: 1.1rem; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--ink-hand); resize: vertical; }
  .acts, footer { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
  .grow { flex: 1; }
  .tiny { font-size: 0.72rem; color: var(--muted); }
  .act { font: inherit; font-size: 0.82rem; padding: 0.15rem 0.7rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  .act:disabled { opacity: 0.5; }
  .act.quiet { color: var(--muted); }
</style>
