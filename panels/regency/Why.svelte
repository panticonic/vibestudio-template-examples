<script lang="ts">
  import { explain, type ExplainSubject, type GameState } from "@workspace/regency-engine";
  import type { EventRow } from "./lib/client.js";

  let { world, events = [], subject, label = "why?" }: { world: GameState; events?: EventRow[]; subject: ExplainSubject; label?: string } = $props();
  let open = $state(false);
  const answer = $derived(open ? explain(world, events as never, subject) : null);
</script>

<span class="why">
  <button class="ask" onclick={() => (open = !open)} aria-expanded={open} title="What is behind this number?">{label}</button>
  {#if answer}
    <div class="panel">
      <header>
        <strong>{answer.title}</strong>
        <button class="close" onclick={() => (open = false)} aria-label="close">×</button>
      </header>
      <p class="headline">{answer.headline}</p>
      <ul>
        {#each answer.causes as c, i (i)}<li>{c.text}</li>{/each}
      </ul>
      {#if answer.chronicle.length}
        <h5>From the chronicle</h5>
        <ul class="chronicle">
          {#each answer.chronicle as line, i (i)}<li>{line}</li>{/each}
        </ul>
      {/if}
    </div>
  {/if}
</span>

<style>
  .why { position: relative; display: inline-block; }
  .ask { font: inherit; font-size: 0.68rem; padding: 0 6px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; line-height: 1.5; }
  .ask:hover { color: var(--accent); border-color: var(--accent); }
  .panel { position: absolute; z-index: 6; right: 0; top: 100%; margin-top: 4px; width: 310px; max-height: 340px; overflow: auto; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--card-bg); box-shadow: 0 10px 30px rgba(0,0,0,0.28); text-align: left; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  header strong { font-family: "Georgia", serif; font-size: 0.9rem; }
  .close { font: inherit; background: none; border: none; color: var(--muted); cursor: pointer; font-size: 1rem; }
  .headline { margin: 4px 0 8px; font-size: 0.78rem; color: var(--muted); line-height: 1.4; }
  ul { margin: 0; padding-left: 16px; font-size: 0.78rem; line-height: 1.45; }
  li { margin-bottom: 3px; }
  h5 { margin: 8px 0 3px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); }
  .chronicle li { font-style: italic; color: var(--muted); }
</style>
