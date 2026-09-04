<script lang="ts">
  import type { UndoneItem } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { seatFamiliar } from "./lib/estate.js";
  import Flame from "./Flame.svelte";

  let { client, apprentice, hasEstate, onDone }: { client: EstateClient; apprentice: string; hasEstate: boolean; onDone: () => void } = $props();

  let name = $state("");
  let step = $state<"name" | "seating" | "letter">("name");
  let progress = $state<string[]>([]);
  let letter = $state<string | null>(null);
  let undone = $state<UndoneItem[]>([]);
  let error = $state<string | null>(null);

  async function begin() {
    const trimmed = name.trim();
    if (!trimmed) return;
    error = null;
    step = "seating";
    progress = [];
    try {
      if (hasEstate) {
        await client.call("joinEstate", { apprentice, apprenticeName: trimmed });
      } else {
        await client.call("newEstate", { apprentice, apprenticeName: trimmed });
      }
      const got = await client.call("letter", {});
      letter = got.text;
      undone = got.undone;
      await seatFamiliar(client, apprentice, trimmed, (line) => (progress = [...progress, line]));
      step = "letter";
    } catch (err) {
      error = errorText(err);
      step = "name";
    }
  }
</script>

<div class="first-run">
  <div class="card">
    {#if step === "name"}
      <Flame lit={false} size={56} />
      <h1>Grimoire</h1>
      <p class="lede">You have inherited an estate. The magic is still running and nobody turned it off.</p>
      <p class="quiet">The will names you apprentice. What name shall the hearth know you by?</p>
      <form onsubmit={(e) => { e.preventDefault(); void begin(); }}>
        <input bind:value={name} placeholder="your name" autocomplete="off" spellcheck="false" />
        <button type="submit" disabled={!name.trim()}>{hasEstate ? "Come home" : "Take the key"}</button>
      </form>
      {#if error}<p class="error">{error}</p>{/if}
    {:else if step === "seating"}
      <Flame guttering size={56} />
      <h2>The valley wakes</h2>
      <ul class="progress">
        {#each progress as line}<li>{line}</li>{/each}
      </ul>
    {:else}
      <Flame size={56} />
      <h2 class="hand">Ysolde's letter</h2>
      <div class="letter">
        {#each (letter ?? "").split("\n\n") as para}<p>{para}</p>{/each}
      </div>
      {#if undone.length}
        <h3 class="hand">Undone</h3>
        <ul class="undone">
          {#each undone as item}<li>{item.text}</li>{/each}
        </ul>
      {/if}
      <button class="go" onclick={onDone}>Go to the hearth</button>
    {/if}
  </div>
</div>

<style>
  .first-run { display: grid; place-items: center; height: 100%; padding: 2rem; overflow: auto; }
  .card { max-width: 40rem; width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 2.2rem 2.5rem; box-shadow: 0 20px 50px rgba(0,0,0,0.08); }
  h1 { font-size: 2.4rem; letter-spacing: 0.04em; margin: 0.6rem 0 0.2rem; font-weight: 500; }
  h2 { margin: 0.6rem 0 0.4rem; font-weight: 500; }
  h3 { margin: 1.2rem 0 0.4rem; font-weight: 500; }
  .lede { font-size: 1.1rem; margin: 0.4rem 0; }
  .quiet { color: var(--muted); }
  form { display: flex; gap: 0.6rem; margin-top: 1rem; }
  input { flex: 1; font: inherit; font-size: 1.05rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg); }
  button { font: inherit; padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .progress { list-style: none; padding: 0; margin: 0; color: var(--muted); }
  .progress li { padding: 0.2rem 0; animation: fade 600ms ease both; }
  .letter p { font-size: 1.05rem; line-height: 1.55; margin: 0.5rem 0; }
  .hand { font-family: "Apple Chancery", "Segoe Script", "URW Chancery L", cursive; font-size: 1.4rem; color: var(--ink-hand); }
  .undone { font-family: "Apple Chancery", "Segoe Script", "URW Chancery L", cursive; font-size: 1.1rem; list-style: none; padding-left: 1rem; color: var(--ink-hand); }
  .undone li { padding: 0.15rem 0; }
  .go { margin-top: 1.4rem; }
  .error { color: #b3261e; }
  @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
</style>
