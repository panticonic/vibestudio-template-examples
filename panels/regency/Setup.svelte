<script lang="ts">
  import type { GameClient } from "./lib/client.js";
  import { seatTheCourt, type SeatProgress } from "./lib/court.js";

  let { client, onFounded }: { client: GameClient; onFounded: () => void } = $props();

  let realmName = $state("Aster");
  let regentName = $state("");
  let seed = $state("");
  let rivals = $state(3);
  let scenario = $state<"long" | "winter">("long");
  let seatCourt = $state(true);
  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);
  let progress = $state<SeatProgress[]>([]);

  async function found() {
    busy = "founding";
    error = null;
    progress = [];
    try {
      await client.newGame({ seed: seed.trim() || `regency-${Math.random().toString(36).slice(2, 8)}`, realmName, rivals, scenario, regentName: regentName.trim() || undefined });
      if (seatCourt) {
        busy = "seating";
        const view = await client.getGame();
        if (view.state) await seatTheCourt(client, view.state, (rows) => (progress = rows));
      }
      onFounded();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = null;
    }
  }
</script>

<section class="setup">
  <div class="scroll">
    <h1>Regency</h1>
    <p class="lede">
      The old king is dead and the heir is a child. You are the Regent: you cannot lift a sword, sign a treaty or levy a tax with your own hands. You rule by speaking to a council of ministers, each an agent with a name, a house, a portfolio and an ambition, and by sealing or vetoing what they bring you. Beyond your borders, rival sovereigns play their own courts and keep ambassadors in your antechamber. Bring the heir to their majority with the realm intact, or take the continent first.
    </p>
    <form onsubmit={(e) => { e.preventDefault(); void found(); }}>
      <div class="scenarios">
        <label class="scenario" class:picked={scenario === "long"}>
          <input type="radio" name="scenario" value="long" bind:group={scenario} />
          <strong>The Long Regency</strong>
          <small>Forty seasons from a quiet spring. Room to build, to bargain, and to make enemies slowly.</small>
        </label>
        <label class="scenario" class:picked={scenario === "winter"}>
          <input type="radio" name="scenario" value="winter" bind:group={scenario} />
          <strong>Winter Regency</strong>
          <small>Twelve seasons. Empty granaries, a hungry capital, an army on the border and a claimant abroad — from the first turn.</small>
        </label>
      </div>
      <div class="grid">
        <label>Name of the realm <input bind:value={realmName} maxlength="24" required /></label>
        <label>Your name as Regent <input bind:value={regentName} maxlength="32" placeholder="the Regent" /></label>
        <label>Seed <input bind:value={seed} placeholder="leave blank for a new world" /></label>
        <label>Rival realms <input type="number" min="1" max="5" bind:value={rivals} /></label>
      </div>
      <label class="check"><input type="checkbox" bind:checked={seatCourt} /> Seat the court now (creates the council, private chambers, rival sovereigns, ambassadors and a Lord Protector as agents)</label>
      <button class="primary" disabled={busy !== null}>{busy === "founding" ? "Founding…" : busy === "seating" ? "Seating the court…" : "Found the realm"}</button>
    </form>
    {#if progress.length}
      <ul class="progress">
        {#each progress as row (row.seat.role + row.seat.channelId)}
          <li class={row.status}>{row.seat.name} — {row.status}{row.error ? `: ${row.error}` : ""}</li>
        {/each}
      </ul>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
  </div>
</section>

<style>
  .setup { height: 100%; display: grid; place-items: center; padding: 24px; overflow: auto; background: radial-gradient(ellipse at top, rgba(216,166,58,0.22), transparent 60%); }
  .scroll { max-width: 600px; padding: 28px 32px; border-radius: 16px; background: var(--card-bg); border: 1px solid var(--border); box-shadow: 0 20px 60px rgba(0,0,0,0.18); }
  h1 { font-family: "Georgia", serif; font-size: 2.4rem; margin: 0 0 8px; letter-spacing: 1.5px; }
  .lede { color: var(--muted); line-height: 1.55; margin: 0 0 20px; }
  form { display: grid; gap: 12px; }
  .scenarios { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .scenario { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer; }
  .scenario.picked { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(216,166,58,0.25); }
  .scenario input { display: none; }
  .scenario small { color: var(--muted); font-size: 0.78rem; line-height: 1.35; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  label { display: grid; gap: 4px; font-size: 0.9rem; }
  label.check { grid-template-columns: auto 1fr; align-items: start; gap: 8px; }
  input:not([type="checkbox"]):not([type="radio"]) { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); }
  .primary { font: inherit; font-weight: 600; padding: 10px 16px; border-radius: 10px; border: none; background: var(--accent); color: var(--accent-fg); cursor: pointer; }
  .primary:disabled { opacity: 0.5; }
  .progress { margin: 16px 0 0; padding-left: 18px; font-size: 0.85rem; max-height: 200px; overflow: auto; }
  .progress .seated { color: #3a8f4a; }
  .progress .failed { color: #c0392b; }
  .error { color: #c0392b; }
</style>
