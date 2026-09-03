<script lang="ts">
  import { onMount } from "svelte";
  import { theme, stateArgs } from "@workspace/svelte";
  import { seasonLabel, type GameState } from "@workspace/regency-engine";
  import { GameClient, type EventRow, type GameView } from "./lib/client.js";
  import { CourtCards } from "./lib/cards.js";
  import { courtChannel } from "./lib/court.js";
  import Map from "./Map.svelte";
  import Setup from "./Setup.svelte";
  import Realm from "./Realm.svelte";
  import Council from "./Council.svelte";
  import Matters from "./Matters.svelte";
  import Diplomacy from "./Diplomacy.svelte";
  import Chronicle from "./Chronicle.svelte";
  import ProvinceCard from "./ProvinceCard.svelte";

  const gameKey = $derived((($stateArgs as { gameKey?: string } | null)?.gameKey ?? "main").trim() || "main");
  const client = $derived(new GameClient(gameKey));

  let view = $state<GameView | null>(null);
  let previous: GameView | null = null;
  let error = $state<string | null>(null);
  let tab = $state<"realm" | "matters" | "council" | "realms" | "chronicle">("realm");
  let selected = $state<string | null>(null);
  let banner = $state<string | null>(null);
  let effects = $state<EventRow[]>([]);
  let replaySeason = $state<number | null>(null);
  let replayWorld = $state<GameState | null>(null);
  let notices = $state<Array<{ id: number; text: string; kind: "info" | "error" }>>([]);
  let lastSeason = -1;
  let noticeSeq = 0;
  let cards: CourtCards | null = null;

  const pendingCount = $derived((view?.orders.filter((o) => o.status === "awaiting_seal").length ?? 0) + (view?.state?.crises.filter((c) => c.chosen === null).length ?? 0));
  const shownWorld = $derived(replayWorld ?? view?.state ?? null);

  function notice(text: string, kind: "info" | "error" = "info") {
    const id = ++noticeSeq;
    notices = [...notices, { id, text, kind }];
    setTimeout(() => (notices = notices.filter((n) => n.id !== id)), kind === "error" ? 8000 : 4000);
  }

  async function refresh() {
    try {
      const next = await client.getGame();
      if (next.state && lastSeason >= 0 && next.state.season !== lastSeason) {
        banner = seasonLabel(next.state);
        setTimeout(() => (banner = null), 2800);
        effects = next.events.filter((e) => e.season === next.state!.season - 1 && ["march", "battle", "siege", "capture", "colonize", "revolt"].includes(e.kind));
        setTimeout(() => (effects = []), 5000);
        if (next.state.crises.some((c) => c.chosen === null && c.season === next.state!.season)) notice("A matter awaits the Regent's decision.");
      }
      lastSeason = next.state?.season ?? -1;
      previous = view;
      view = next;
      error = null;
      if (next.state && next.participants.length > 0) {
        cards ??= new CourtCards(client, courtChannel(gameKey));
        void cards.sync(next, previous).catch(() => undefined);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  $effect(() => {
    const season = replaySeason;
    if (season === null) {
      replayWorld = null;
      return;
    }
    void client.getSnapshot(season).then((snap) => {
      if (replaySeason === season) replayWorld = snap;
    });
  });

  onMount(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      clearInterval(timer);
      void cards?.close();
    };
  });
</script>

<main class="regency" class:dark={$theme === "dark"}>
  {#if error && !view}
    <div class="error-screen"><h2>The realm is unreachable</h2><p>{error}</p><button onclick={() => void refresh()}>Try again</button></div>
  {:else if !view}
    <div class="loading">Unrolling the map…</div>
  {:else if !view.state}
    <Setup {client} onFounded={() => void refresh()} />
  {:else}
    <div class="layout">
      <div class="map-pane">
        {#if shownWorld}
          <Map world={shownWorld} bind:selected dark={$theme === "dark"} effects={replayWorld ? [] : effects} replay={replayWorld !== null} />
        {/if}
        {#if banner}<div class="banner"><span>{banner}</span></div>{/if}
      </div>
      <aside class="side">
        <nav class="tabs">
          <button class:active={tab === "realm"} onclick={() => (tab = "realm")}>Realm</button>
          <button class:active={tab === "matters"} onclick={() => (tab = "matters")}>Seal{#if pendingCount}<span class="dot">{pendingCount}</span>{/if}</button>
          <button class:active={tab === "council"} onclick={() => (tab = "council")}>Council</button>
          <button class:active={tab === "realms"} onclick={() => (tab = "realms")}>Realms</button>
          <button class:active={tab === "chronicle"} onclick={() => (tab = "chronicle")}>Chronicle</button>
        </nav>
        {#if selected && shownWorld?.provinces[selected]}
          <ProvinceCard world={shownWorld} provinceId={selected} {gameKey} onClose={() => (selected = null)} />
        {/if}
        {#if tab === "realm"}
          <Realm {view} {client} {refresh} {notice} bind:replaySeason />
        {:else if tab === "matters"}
          <Matters {view} {client} {refresh} {notice} />
        {:else if tab === "council"}
          <Council {view} {client} {refresh} {notice} />
        {:else if tab === "realms"}
          <Diplomacy {view} {client} />
        {:else}
          <Chronicle {view} onSelectProvince={(id) => (selected = id)} />
        {/if}
      </aside>
    </div>
  {/if}
  <div class="notices">
    {#each notices as n (n.id)}<div class={`notice ${n.kind}`}>{n.text}</div>{/each}
  </div>
</main>

<style>
  .regency {
    --bg: #f5efe2;
    --fg: #1f1a12;
    --muted: #6b6250;
    --card-bg: #fffcf4;
    --border: #e1d7c0;
    --accent: var(--accent-9, #b8862d);
    --accent-fg: var(--accent-contrast, #ffffff);
    --code-bg: rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    height: 100vh;
    margin: 0;
    background: var(--bg);
    background-image: radial-gradient(ellipse at 20% 0%, rgba(216,166,58,0.12), transparent 50%);
    color: var(--fg);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.45;
    overflow: hidden;
  }
  .regency.dark {
    --bg: #14130f;
    --fg: #ece5d3;
    --muted: #a49c88;
    --card-bg: #1e1c15;
    --border: #35322a;
    --accent: var(--accent-9, #d8a63a);
    --accent-fg: var(--accent-contrast, #15140f);
    --code-bg: rgba(255, 255, 255, 0.08);
  }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 12px; height: 100%; padding: 12px; box-sizing: border-box; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; grid-template-rows: 46vh 1fr; } }
  .map-pane { position: relative; min-height: 0; }
  .side { overflow: auto; min-height: 0; display: grid; gap: 12px; align-content: start; padding-right: 2px; }
  .tabs { display: flex; gap: 4px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 4px; position: sticky; top: 0; z-index: 2; }
  .tabs button { flex: 1; font: inherit; padding: 6px 4px; border-radius: 7px; border: none; background: transparent; color: var(--muted); cursor: pointer; position: relative; font-size: 0.85rem; }
  .tabs button.active { background: var(--accent); color: var(--accent-fg); font-weight: 600; }
  .dot { position: absolute; top: -4px; right: 2px; background: #c0392b; color: #fff; border-radius: 999px; font-size: 0.65rem; padding: 0 5px; }
  .banner { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; animation: fade 2.8s ease forwards; }
  .banner span { font-family: "Georgia", serif; font-size: 2.6rem; letter-spacing: 3px; color: #fff; text-shadow: 0 2px 14px rgba(0,0,0,0.75); padding: 10px 32px; border-top: 1px solid rgba(255,255,255,0.6); border-bottom: 1px solid rgba(255,255,255,0.6); }
  @keyframes fade { 0% { opacity: 0; transform: scale(0.96); } 15% { opacity: 1; transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
  .loading, .error-screen { height: 100%; display: grid; place-items: center; text-align: center; color: var(--muted); }
  .error-screen button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card-bg); color: var(--fg); cursor: pointer; }
  .notices { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: grid; gap: 6px; z-index: 5; }
  .notice { padding: 8px 14px; border-radius: 8px; background: rgba(20, 16, 8, 0.9); color: #f5eedc; font-size: 0.85rem; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
  .notice.error { background: #8b1e1e; }
</style>
