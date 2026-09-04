<script lang="ts">
  import { onMount } from "svelte";
  import { theme, stateArgs, setStateArgs } from "@workspace/svelte";
  import { seasonLabel, type EdictCondition, type GameState } from "@workspace/regency-engine";
  import { GameClient, type EventRow, type GameView } from "./lib/client.js";
  import { CourtCards } from "./lib/cards.js";
  import { courtChannel } from "./lib/court.js";
  import { playCue, closeAudio } from "./lib/sound.js";
  import Map from "./Map.svelte";
  import Setup from "./Setup.svelte";
  import Realm from "./Realm.svelte";
  import Council from "./Council.svelte";
  import Matters from "./Matters.svelte";
  import Diplomacy from "./Diplomacy.svelte";
  import Chronicle from "./Chronicle.svelte";
  import ProvinceCard from "./ProvinceCard.svelte";
  import Ending from "./Ending.svelte";

  const gameKey = $derived((($stateArgs as { gameKey?: string } | null)?.gameKey ?? "main").trim() || "main");
  const client = $derived(new GameClient(gameKey));
  const sound = $derived(Boolean(($stateArgs as { sound?: boolean } | null)?.sound));

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

  // The cinematic: marches → clashes → captures → harvest, then the banner.
  let beat = $state<"marches" | "clashes" | "captures" | "harvest" | null>(null);
  let beatCaption = $state<string | null>(null);
  let beatTimers: ReturnType<typeof setTimeout>[] = [];

  // Camera and edict light, driven from the side panel.
  let focusRequest = $state<{ province: string; nonce: number } | null>(null);
  let focusNonce = 0;
  let highlightEdict = $state<{ when: EdictCondition[] } | null>(null);
  let endingDismissed = $state(false);

  const pendingCount = $derived((view?.orders.filter((o) => o.status === "awaiting_seal").length ?? 0) + (view?.state?.crises.filter((c) => c.chosen === null).length ?? 0));
  const shownWorld = $derived(replayWorld ?? view?.state ?? null);
  const showEnding = $derived(Boolean(view?.state?.outcome) && !endingDismissed && replayWorld === null);

  function notice(text: string, kind: "info" | "error" = "info") {
    const id = ++noticeSeq;
    notices = [...notices, { id, text, kind }];
    setTimeout(() => (notices = notices.filter((n) => n.id !== id)), kind === "error" ? 8000 : 4000);
  }

  function focusProvince(id: string) {
    focusNonce += 1;
    focusRequest = { province: id, nonce: focusNonce };
  }

  function clearCinema() {
    for (const t of beatTimers) clearTimeout(t);
    beatTimers = [];
    beat = null;
    beatCaption = null;
  }

  /** Play the season that just resolved as four beats of about three quarters of a second each. */
  function runCinema(label: string, rows: EventRow[]) {
    clearCinema();
    const captionOf = (kinds: string[]) => rows.find((e) => kinds.includes(e.kind))?.text ?? null;
    const script: Array<{ beat: typeof beat; at: number; caption: string | null }> = [
      { beat: "marches", at: 0, caption: captionOf(["march"]) },
      { beat: "clashes", at: 900, caption: captionOf(["battle", "siege"]) },
      { beat: "captures", at: 1800, caption: captionOf(["capture", "colonize", "revolt"]) },
      { beat: "harvest", at: 2500, caption: captionOf(["famine", "growth", "economy"]) },
    ].filter((s, i) => i === 0 || s.caption !== null || rows.length === 0);
    if (rows.length === 0) {
      // Nothing happened worth watching; go straight to the banner.
      showBanner(label);
      return;
    }
    for (const step of script) {
      beatTimers.push(
        setTimeout(() => {
          beat = step.beat;
          beatCaption = step.caption;
          if (step.beat === "clashes" && step.caption) playCue("battle", sound);
        }, step.at),
      );
    }
    beatTimers.push(setTimeout(() => finishCinema(label), 3200));
  }

  function finishCinema(label: string) {
    clearCinema();
    showBanner(label);
  }

  function showBanner(label: string) {
    banner = label;
    playCue("season", sound);
    setTimeout(() => (banner = null), 2800);
    setTimeout(() => (effects = []), 5000);
  }

  function skipCinema() {
    if (beat === null) return;
    const label = view?.state ? seasonLabel(view.state) : "";
    finishCinema(label);
  }

  async function refresh() {
    try {
      const next = await client.getGame();
      if (next.state && lastSeason >= 0 && next.state.season !== lastSeason) {
        effects = next.events.filter((e) => e.season === next.state!.season - 1 && ["march", "battle", "siege", "capture", "colonize", "revolt", "famine", "growth"].includes(e.kind));
        runCinema(seasonLabel(next.state), effects);
        if (next.state.crises.some((c) => c.chosen === null && c.season === next.state!.season)) notice("A matter awaits the Regent's decision.");
      }
      if (previous && next.state && !previous.state?.outcome && next.state.outcome) endingDismissed = false;
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

  /**
   * The Regent points at the map and speaks. The subject rides along twice:
   * as metadata for anything that reads it, and as a closing line in words,
   * because the message reaches the Herald through the panel's own seat and
   * the Herald must be able to tell who spoke and about what from the text alone.
   */
  async function speak(text: string, about: { province?: string; army?: string }) {
    cards ??= new CourtCards(client, courtChannel(gameKey));
    const world = view?.state;
    const province = about.province && world?.provinces[about.province];
    const army = about.army && world?.armies[about.army];
    const subject = army && province
      ? `the ${army.name} (${army.id}) in ${province.name} (${province.id})`
      : province
        ? `${province.name} (${province.id})`
        : (about.army ?? about.province ?? "the map");
    try {
      await cards.speak(`${text.trim()}\n\n— said pointing at ${subject} on the map`, about);
      notice("The court has heard you.");
    } catch (err) {
      notice(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function sealTop() {
    const top = view?.orders.find((o) => o.status === "awaiting_seal");
    if (!top) {
      notice("Nothing awaits your seal.");
      return;
    }
    try {
      const res = await client.sealOrder(top.id, "seal");
      if (res.ok) {
        playCue("seal", sound);
        notice("Sealed.");
        await refresh();
      } else notice(res.reason ?? "refused", "error");
    } catch (err) {
      notice(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function closeSeason() {
    try {
      const res = await client.closeSeason();
      if (!res.resolved) notice(`The court is closed; waiting on ${res.waitingFor.length} court(s).`);
      await refresh();
    } catch (err) {
      notice(err instanceof Error ? err.message : String(err), "error");
    }
  }

  function walkProvinces(direction: 1 | -1) {
    const world = shownWorld;
    if (!world) return;
    const own = Object.values(world.provinces)
      .filter((p) => p.owner === world.playerRealm)
      .sort((a, b) => a.name.localeCompare(b.name));
    const all = own.length ? own : Object.values(world.provinces);
    if (all.length === 0) return;
    const at = all.findIndex((p) => p.id === selected);
    const next = all[(at + direction + all.length * 2) % all.length]!;
    selected = next.id;
    focusProvince(next.id);
  }

  function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
  }

  // Closing the season and sealing an act cannot be undone, so their keys
  // must be struck twice in a row: the first press says what the second will do.
  let armed: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;
  function armed_or_run(key: string, what: string, run: () => void) {
    if (armed?.key === key) {
      clearTimeout(armed.timer);
      armed = null;
      run();
      return;
    }
    if (armed) clearTimeout(armed.timer);
    armed = { key, timer: setTimeout(() => (armed = null), 2500) };
    notice(`Press ${key === " " ? "Space" : key.toUpperCase()} again to ${what}.`);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    if (!view?.state) return;
    if (beat !== null && (event.key === " " || event.key === "Escape")) {
      event.preventDefault();
      skipCinema();
      return;
    }
    // A focused button takes Space and Enter for itself.
    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (tag === "button" || tag === "a") return;
    switch (event.key) {
      case " ":
        event.preventDefault();
        armed_or_run(" ", "close the season", () => void closeSeason());
        break;
      case "s":
      case "S":
        event.preventDefault();
        armed_or_run("s", "seal the first act awaiting the seal", () => void sealTop());
        break;
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        walkProvinces(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        walkProvinces(-1);
        break;
      case "Escape":
        selected = null;
        highlightEdict = null;
        break;
      default:
        break;
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
    window.addEventListener("keydown", onKeydown);
    return () => {
      clearInterval(timer);
      if (armed) clearTimeout(armed.timer);
      clearCinema();
      closeAudio();
      window.removeEventListener("keydown", onKeydown);
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
          <Map
            world={shownWorld}
            bind:selected
            dark={$theme === "dark"}
            effects={replayWorld ? [] : effects}
            replay={replayWorld !== null}
            intents={replayWorld ? [] : view.intents}
            {beat}
            caption={beatCaption}
            onSkip={skipCinema}
            {focusRequest}
            {highlightEdict}
          />
        {/if}
        {#if banner}<div class="banner"><span>{banner}</span></div>{/if}
        {#if showEnding}
          <Ending {view} onDismiss={() => (endingDismissed = true)} />
        {/if}
      </div>
      <aside class="side">
        <nav class="tabs">
          <button class:active={tab === "realm"} onclick={() => (tab = "realm")}>Realm</button>
          <button class:active={tab === "matters"} onclick={() => (tab = "matters")}>Seal{#if pendingCount}<span class="dot">{pendingCount}</span>{/if}</button>
          <button class:active={tab === "council"} onclick={() => (tab = "council")}>Council</button>
          <button class:active={tab === "realms"} onclick={() => (tab = "realms")}>Realms</button>
          <button class:active={tab === "chronicle"} onclick={() => (tab = "chronicle")}>Chronicle</button>
        </nav>
        {#if view.state.outcome && endingDismissed}
          <button class="reopen" onclick={() => (endingDismissed = false)}>Read the verdict and the secret history again</button>
        {/if}
        {#if selected && shownWorld?.provinces[selected]}
          <ProvinceCard world={shownWorld} provinceId={selected} {gameKey} events={view.events} onClose={() => (selected = null)} onSpeak={speak} />
        {/if}
        {#if tab === "realm"}
          <Realm {view} {client} {refresh} {notice} bind:replaySeason {sound} onSound={(on) => void setStateArgs({ sound: on })} />
        {:else if tab === "matters"}
          <Matters {view} {client} {refresh} {notice} onFocusProvince={focusProvince} onHighlightEdict={(when) => (highlightEdict = when ? { when } : null)} />
        {:else if tab === "council"}
          <Council {view} {client} {refresh} {notice} />
        {:else if tab === "realms"}
          <Diplomacy {view} {client} />
        {:else}
          <Chronicle {view} onSelectProvince={(id) => { selected = id; focusProvince(id); }} />
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
  .reopen { font: inherit; font-size: 0.82rem; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--accent); background: transparent; color: var(--accent); cursor: pointer; }
  .banner { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; animation: fade 2.8s ease forwards; }
  .banner span { font-family: "Georgia", serif; font-size: 2.6rem; letter-spacing: 3px; color: #fff; text-shadow: 0 2px 14px rgba(0,0,0,0.75); padding: 10px 32px; border-top: 1px solid rgba(255,255,255,0.6); border-bottom: 1px solid rgba(255,255,255,0.6); }
  @keyframes fade { 0% { opacity: 0; transform: scale(0.96); } 15% { opacity: 1; transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
  .loading, .error-screen { height: 100%; display: grid; place-items: center; text-align: center; color: var(--muted); }
  .error-screen button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card-bg); color: var(--fg); cursor: pointer; }
  .notices { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: grid; gap: 6px; z-index: 9; }
  .notice { padding: 8px 14px; border-radius: 8px; background: rgba(20, 16, 8, 0.9); color: #f5eedc; font-size: 0.85rem; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
  .notice.error { background: #8b1e1e; }
</style>
