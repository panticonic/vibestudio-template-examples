<script lang="ts">
  import { dominantTraits, heirAge, seasonLabel, type GameState } from "@workspace/regency-engine";
  import type { GameClient, GameView } from "./lib/client.js";
  import Why from "./Why.svelte";

  let {
    view,
    client,
    refresh,
    notice,
    replaySeason = $bindable<number | null>(null),
    sound = false,
    onSound = undefined,
  }: {
    view: GameView;
    client: GameClient;
    refresh: () => Promise<void>;
    notice: (text: string, kind?: "info" | "error") => void;
    replaySeason?: number | null;
    sound?: boolean;
    onSound?: ((on: boolean) => void) | undefined;
  } = $props();
  const world = $derived(view.state as GameState);
  const player = $derived(world.realms[world.playerRealm]!);
  const awaiting = $derived(view.orders.filter((o) => o.status === "awaiting_seal").length);
  const undecided = $derived(world.crises.filter((c) => c.chosen === null).length);
  const failedBriefings = $derived(view.briefings.filter((b) => b.status === "failed"));
  let busy = $state<string | null>(null);
  const ESTATE_LABEL: Record<string, string> = { peasants: "Peasants", burghers: "Burghers", clergy: "Clergy", nobles: "Nobles" };
  const TRAIT_LABEL: Record<string, string> = { bold: "bold", cautious: "cautious", just: "just", greedy: "greedy", pious: "pious" };

  async function run(label: string, fn: () => Promise<unknown>) {
    busy = label;
    try {
      await fn();
      await refresh();
    } catch (err) {
      notice(err instanceof Error ? err.message : String(err), "error");
    } finally {
      busy = null;
    }
  }
</script>

<div class="realm">
  <section class="stats">
    <div class="stat"><span>Treasury <Why world={world} events={view.events} subject={{ kind: "treasury" }} /></span><strong>{player.treasury.toFixed(0)}</strong><small>{player.ledger.net >= 0 ? "+" : ""}{player.ledger.net}/season</small></div>
    <div class="stat"><span>Legitimacy <Why world={world} events={view.events} subject={{ kind: "legitimacy" }} /></span><strong class:low={player.legitimacy < 40}>{Math.round(player.legitimacy)}</strong><small>need ≥ 40</small></div>
    <div class="stat"><span>Prestige</span><strong>{Math.round(player.prestige)}</strong><small>infamy {Math.round(player.infamy)}</small></div>
    <div class="stat"><span>Reputation</span><strong>{Math.round(world.regent.reputation)}</strong><small>{world.regent.name}</small></div>
  </section>

  <section class="clock">
    <div>
      <strong>{seasonLabel(world)}</strong>
      <small>{world.phase === "closing" ? `court closed; waiting on ${view.waitingFor.map((r) => world.realms[r]?.name).join(", ")}` : world.phase === "finished" ? "the game is over" : `${world.majoritySeason - world.season} seasons to the majority`}</small>
      {#if awaiting || undecided}<small class="warn">{awaiting ? `${awaiting} act${awaiting > 1 ? "s" : ""} await the seal` : ""}{awaiting && undecided ? " · " : ""}{undecided ? `${undecided} matter${undecided > 1 ? "s" : ""} undecided` : ""}</small>{/if}
    </div>
    <div class="actions">
      {#if world.phase === "orders"}
        <button class="primary" disabled={busy !== null || awaiting > 0} title={awaiting ? "Seal or veto the pending acts first" : "Close the court and let the season resolve"} onclick={() => run("close", () => client.closeSeason())}>Close the season</button>
      {:else if world.phase === "closing"}
        <button class="primary" disabled={busy !== null} onclick={() => run("proceed", () => client.proceedWithoutPending())}>Proceed without them</button>
      {/if}
      {#if failedBriefings.length}
        <button disabled={busy !== null} onclick={() => run("redeliver", () => client.redeliverBriefings())} title={failedBriefings.map((b) => `${b.role}: ${b.error}`).join("\n")}>Re-send {failedBriefings.length} briefing{failedBriefings.length > 1 ? "s" : ""}</button>
      {/if}
    </div>
  </section>

  {#if world.outcome}
    <section class="outcome" class:victory={world.outcome.kind === "victory"}>
      <h3>{world.outcome.title}</h3>
      <p>{world.outcome.reason}</p>
      {#if world.outcome.verdict}<p class="verdict">{world.outcome.verdict}</p>{/if}
    </section>
  {/if}

  <section>
    <h3>The estates</h3>
    <div class="bars">
      {#each Object.entries(player.estates) as [estate, value] (estate)}
        <div class="bar"><span>{ESTATE_LABEL[estate] ?? estate}</span><div class="track"><div class="fill" class:low={value < 40} style={`width:${value}%`}></div></div><em>{Math.round(value)}</em></div>
      {/each}
    </div>
    <p class="muted small">Legitimacy is the estates' weighted consent. Taxes, hunger, wars, laws, shrines and markets move them; below 15 the Regent is deposed.</p>
  </section>

  <section class="heir">
    <h3>The heir, {world.heir.name}</h3>
    <p class="muted small">Age {heirAge(world)}{world.heir.tutor ? ` · tutored by the ${world.heir.tutor}` : " · no tutor yet"}{dominantTraits(world.heir).length ? ` · growing ${dominantTraits(world.heir).map((t) => TRAIT_LABEL[t]).join(" and ")}` : " · unformed"}</p>
    <div class="bars">
      {#each Object.entries(world.heir.traits) as [trait, value] (trait)}
        <div class="bar"><span>{TRAIT_LABEL[trait] ?? trait}</span><div class="track"><div class="fill trait" style={`width:${Math.min(100, value * 12)}%`}></div></div><em>{value}</em></div>
      {/each}
    </div>
    <p class="muted small">Every seal, veto and decision teaches the heir something. At the majority the heir judges the Regency.</p>
  </section>

  {#if world.digest.length}
    <section class="digest">
      <h3>Last season, in brief</h3>
      <p>{world.digest[world.digest.length - 1]}</p>
    </section>
  {/if}

  <section class="comforts">
    <h3>Comforts</h3>
    <label class="toggle"><input type="checkbox" checked={sound} onchange={(e) => onSound?.((e.currentTarget as HTMLInputElement).checked)} /> Sound: a horn when the season turns, steel when armies meet, a stamp when the seal falls</label>
    <p class="muted small">Keys: <kbd>Space</kbd> closes the season · <kbd>S</kbd> seals the topmost act · <kbd>←</kbd><kbd>→</kbd> walk the provinces · <kbd>Esc</kbd> clears the selection. They do nothing while you are typing.</p>
  </section>

  {#if view.snapshots.length > 1}
    <section>
      <h3>Replay</h3>
      <input type="range" min={view.snapshots[0]} max={view.snapshots[view.snapshots.length - 1]} step="1" value={replaySeason ?? view.snapshots[view.snapshots.length - 1]} oninput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); replaySeason = v === view.snapshots[view.snapshots.length - 1] ? null : v; }} />
      <p class="muted small">{replaySeason === null ? "Showing the present. Drag to replay past seasons on the map." : `Showing ${seasonLabel({ season: replaySeason, startYear: world.startYear })}.`}</p>
    </section>
  {/if}
</div>

<style>
  .realm { display: grid; gap: 12px; }
  section { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  h3 { margin: 0 0 8px; font-size: 0.95rem; font-family: "Georgia", serif; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 10px; }
  .stat { display: grid; text-align: center; }
  .stat span { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); }
  .stat strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; font-family: "Georgia", serif; }
  .stat strong.low { color: #c0392b; }
  .stat small { color: var(--muted); font-size: 0.7rem; }
  .clock { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .clock small { display: block; color: var(--muted); }
  .clock small.warn { color: #b8862d; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  button { font: inherit; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; }
  button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .outcome { border-color: #c0392b; }
  .outcome.victory { border-color: #d8a63a; background: linear-gradient(135deg, rgba(216,166,58,0.18), transparent); }
  .verdict { font-style: italic; }
  .bars { display: grid; gap: 5px; }
  .bar { display: grid; grid-template-columns: 70px 1fr 28px; align-items: center; gap: 8px; font-size: 0.8rem; }
  .track { height: 8px; border-radius: 4px; background: var(--code-bg); overflow: hidden; }
  .fill { height: 100%; background: var(--accent); transition: width 900ms ease; }
  .fill.low { background: #c0392b; }
  .fill.trait { background: #7a4fb0; }
  em { font-style: normal; color: var(--muted); font-variant-numeric: tabular-nums; text-align: right; }
  .digest { background: linear-gradient(135deg, rgba(216,166,58,0.14), transparent); }
  .digest p { margin: 0; font-size: 0.86rem; line-height: 1.5; }
  input[type="range"] { width: 100%; accent-color: var(--accent); }
  .muted { color: var(--muted); }
  .small { font-size: 0.78rem; margin: 6px 0 0; }
  .toggle { display: flex; gap: 8px; align-items: flex-start; font-size: 0.82rem; line-height: 1.4; cursor: pointer; }
  .toggle input { margin-top: 3px; }
  kbd { font-family: ui-monospace, monospace; font-size: 0.72rem; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: var(--bg); }
</style>
