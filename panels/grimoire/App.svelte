<script lang="ts">
  /**
   * Grimoire — the panel.
   *
   * A left rail of rooms, the valley always in view on a wide screen, and the
   * room you are in beside it. The world Durable Object is the single source
   * of truth; the panel polls it and animates the differences.
   */
  import { onMount } from "svelte";
  import { stateArgs, setStateArgs, theme } from "@workspace/svelte";
  import type { Overview, RegionId, RegionView } from "@workspace/grimoire-engine";
  import { EstateClient, errorText } from "./lib/client.js";
  import { mintApprenticeId } from "./lib/estate.js";
  import { paletteFor } from "./lib/palette.js";
  import { playCue, closeAudio } from "./lib/sound.js";
  import FirstRun from "./FirstRun.svelte";
  import SkyStrip from "./SkyStrip.svelte";
  import Valley from "./Valley.svelte";
  import RegionMap from "./RegionMap.svelte";
  import Circle from "./Circle.svelte";
  import Study from "./Study.svelte";
  import Grimoire from "./Grimoire.svelte";
  import Spellbook from "./Spellbook.svelte";
  import Scry from "./Scry.svelte";
  import Chapel from "./Chapel.svelte";
  import Spirits from "./Spirits.svelte";
  import News from "./News.svelte";
  import Green from "./Green.svelte";

  type Room = "valley" | "circle" | "study" | "grimoire" | "spellbook" | "scry" | "chapel" | "spirits" | "news" | "green";
  const ROOMS: Array<{ id: Room; label: string; glyph: string; key: string }> = [
    { id: "valley", label: "the valley", glyph: "⌂", key: "1" },
    { id: "circle", label: "the circle", glyph: "◯", key: "2" },
    { id: "study", label: "the study", glyph: "❧", key: "3" },
    { id: "grimoire", label: "the grimoire", glyph: "✎", key: "4" },
    { id: "spellbook", label: "the spellbook", glyph: "❦", key: "5" },
    { id: "scry", label: "scrying", glyph: "◎", key: "6" },
    { id: "chapel", label: "the chapel", glyph: "✟", key: "7" },
    { id: "spirits", label: "the spirits", glyph: "✦", key: "8" },
    { id: "news", label: "the news", glyph: "✉", key: "9" },
    { id: "green", label: "the green", glyph: "❀", key: "0" },
  ];

  const args = $derived(($stateArgs ?? {}) as { estateKey?: string; apprentice?: string; sound?: boolean; view?: string });
  const estateKey = $derived((args.estateKey ?? "main").trim() || "main");
  let apprentice = $state<string | null>(null);
  const sound = $derived(args.sound === true);
  const client = $derived(new EstateClient(estateKey));

  let overview = $state<Overview | null>(null);
  let previous = $state<Overview | null>(null);
  let region = $state<RegionView | null>(null);
  let previousRegion = $state<RegionView | null>(null);
  let openRegion = $state<RegionId | null>(null);
  let room = $state<Room>("valley");
  let firstRun = $state<"unknown" | "needed" | "done">("unknown");
  let error = $state<string | null>(null);
  let busy = $state(false);
  let scryTarget = $state<{ kind: "spell" | "cell" | "entity" | "spirit"; ref: string; region?: RegionId; x?: number; y?: number } | null>(null);
  let focusCell = $state<{ region: RegionId; x: number; y: number } | null>(null);
  let echoVerse = $state<string>("");
  let deliberating = $state<string | null>(null);
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const palette = $derived(overview ? paletteFor(overview.sky.season, overview.sky.hour, $theme === "dark") : paletteFor("spring", 7, $theme === "dark"));
  const unread = $derived(overview?.news.unread ?? 0);
  const councilOpen = $derived(overview?.council ?? 0);
  const wide = $derived(typeof window !== "undefined" ? window.innerWidth >= 1180 : true);

  function say(line: string): void {
    toast = line;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 6000);
  }

  async function refresh(): Promise<void> {
    if (!apprentice) return;
    try {
      const next = await client.call("overview", { apprentice });
      previous = overview;
      overview = next;
      error = null;
      if (previous) {
        if (!previous.firstHour.hearthLit && next.firstHour.hearthLit) playCue("hearth", sound);
        if (previous.sky.festival !== next.sky.festival && next.sky.festival) playCue("bell", sound);
        if (previous.news.unread < next.news.unread) playCue("page", sound);
        if (previous.sky.weather !== "storm" && next.sky.weather === "storm") playCue("wind", sound);
        if (previous.deliberating.length && !next.deliberating.length) playCue("cast", sound);
      }
      if (openRegion) await refreshRegion();
    } catch (err) {
      const text = errorText(err);
      if (/No estate has been founded/.test(text)) { firstRun = "needed"; return; }
      error = text;
    }
  }

  async function refreshRegion(): Promise<void> {
    if (!openRegion) return;
    try {
      const next = await client.call("region", { id: openRegion });
      previousRegion = region;
      region = next;
    } catch (err) { error = errorText(err); }
  }

  async function advance(ticks: number): Promise<void> {
    busy = true;
    try { await client.call("advance", { ticks, reason: "the apprentice let time pass" }); await refresh(); }
    catch (err) { error = errorText(err); }
    finally { busy = false; }
  }

  function goto(next: Room): void {
    room = next;
    void setStateArgs({ ...args, view: next });
  }

  function enterRegion(id: RegionId): void {
    openRegion = id;
    region = null; previousRegion = null;
    void refreshRegion();
    void client.call("presence", { apprentice: apprentice!, present: true, region: id });
  }

  function leaveRegion(): void { openRegion = null; region = null; }

  function scry(target: NonNullable<typeof scryTarget>): void { scryTarget = target; goto("scry"); }

  function echo(verse: string): void { echoVerse = verse; goto("circle"); }

  function onKeydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (e.key === "Escape") { if (openRegion) leaveRegion(); else goto("valley"); return; }
    const r = ROOMS.find((x) => x.key === e.key);
    if (r && !e.metaKey && !e.ctrlKey && !e.altKey) goto(r.id);
  }

  async function boot(): Promise<void> {
    let id = args.apprentice?.trim() || "";
    if (!id) { id = mintApprenticeId(); await setStateArgs({ ...args, apprentice: id }); }
    apprentice = id;
    try {
      const ov = await client.call("overview", { apprentice: id });
      overview = ov;
      const known = ov.apprentices.some((a) => a.id === id);
      firstRun = known ? "done" : "needed";
      if (known) { await client.call("presence", { apprentice: id, present: true }); if (args.view && ROOMS.some((r) => r.id === args.view)) room = args.view as Room; }
    } catch (err) {
      const text = errorText(err);
      firstRun = /No estate has been founded/.test(text) ? "needed" : "needed";
      if (!/No estate/.test(text)) error = text;
    }
  }

  onMount(() => {
    void boot();
    const slow = setInterval(() => void refresh(), 2500);
    const fast = setInterval(() => { if (openRegion) void refreshRegion(); }, 1500);
    window.addEventListener("keydown", onKeydown);
    return () => {
      clearInterval(slow); clearInterval(fast); closeAudio();
      window.removeEventListener("keydown", onKeydown);
      if (apprentice) void client.call("presence", { apprentice, present: false });
    };
  });
</script>

<div class="app" class:dark={$theme === "dark"} style={`--paper:${palette.paper};--ink:${palette.ink};--faint:${palette.faint};--wash:${palette.wash};--season:${palette.accent};--night:${palette.night}`}>
  {#if firstRun === "needed" && apprentice}
    <FirstRun {client} {apprentice} hasEstate={!!overview} onDone={() => { firstRun = "done"; void refresh(); goto("valley"); }} />
  {:else if !overview}
    <div class="loading"><span class="ornament">✦</span> the valley is waking…{#if error}<p class="error">{error}</p>{/if}</div>
  {:else}
    <nav class="rail" aria-label="rooms">
      {#each ROOMS as r}
        <button class="room" class:active={room === r.id} onclick={() => goto(r.id)} title={`${r.label} (${r.key})`}>
          <span class="glyph">{r.glyph}</span><span class="label">{r.label}</span>
          {#if r.id === "news" && unread > 0}<span class="badge">{unread}</span>{/if}
          {#if r.id === "chapel" && councilOpen > 0}<span class="badge">{councilOpen}</span>{/if}
          {#if r.id === "circle" && overview.deliberating.length > 0}<span class="badge fire">✧</span>{/if}
        </button>
      {/each}
      <span class="grow"></span>
      <button class="room quiet" onclick={() => void setStateArgs({ ...args, sound: !sound })} title="sound">{sound ? "♪ sound on" : "♪ sound off"}</button>
      <div class="who">{overview.apprentices.find((a) => a.id === apprentice)?.name ?? apprentice}<br /><small>reserve {overview.apprentices.find((a) => a.id === apprentice)?.reserve ?? 0} / {overview.apprentices.find((a) => a.id === apprentice)?.reserveMax ?? 0} ether</small></div>
    </nav>
    <main class="main">
      <SkyStrip sky={overview.sky} onAdvance={(n) => void advance(n)} {busy} />
      {#if error}<div class="error-bar">{error}</div>{/if}
      <div class="stage" class:wide={wide && room !== "valley"}>
        {#if wide || room === "valley"}
          <section class="valley-pane">
            {#if openRegion && region}
              <RegionMap view={region} previous={previousRegion} {palette} sky={overview.sky} onBack={leaveRegion} onScry={(t) => scry(t)} onFocus={(c) => { focusCell = c; goto("circle"); }} onAdorn={async (cell, charm) => { await client.call("adorn", { apprentice: apprentice!, cell, charm }); await refreshRegion(); say("A small light, for whoever comes next."); }} apprentices={overview.apprentices} />
            {:else}
              <Valley {overview} {palette} onEnter={enterRegion} />
            {/if}
          </section>
        {/if}
        {#if room !== "valley"}
          <section class="room-pane">
            {#if room === "circle"}
              <Circle {client} apprentice={apprentice!} {overview} bind:echoVerse bind:focusCell bind:deliberating {sound} onScry={(id) => scry({ kind: "spell", ref: id })} onOpenRegion={enterRegion} />
            {:else if room === "study"}
              <Study {client} apprentice={apprentice!} {overview} onEcho={echo} />
            {:else if room === "grimoire"}
              <Grimoire {client} apprentice={apprentice!} {overview} onOpenRegion={enterRegion} onScry={(id) => scry({ kind: "spell", ref: id })} />
            {:else if room === "spellbook"}
              <Spellbook {client} apprentice={apprentice!} onScry={(id) => scry({ kind: "spell", ref: id })} onSaid={(line) => { say(line); void refresh(); }} />
            {:else if room === "scry"}
              <Scry {client} apprentice={apprentice!} target={scryTarget} {overview} onScry={(t) => (scryTarget = t)} />
            {:else if room === "chapel"}
              <Chapel {client} apprentice={apprentice!} {overview} onSaid={say} />
            {:else if room === "spirits"}
              <Spirits {client} apprentice={apprentice!} {overview} onSaid={say} onScry={(id) => scry({ kind: "spirit", ref: id })} />
            {:else if room === "news"}
              <News {client} apprentice={apprentice!} onOpenRegion={enterRegion} />
            {:else if room === "green"}
              <Green {client} apprentice={apprentice!} {overview} onSaid={say} />
            {/if}
          </section>
        {/if}
      </div>
    </main>
    {#if toast}<div class="toast">{toast}</div>{/if}
  {/if}
</div>

<style>
  :global(html), :global(body), :global(#root) { height: 100%; width: 100%; margin: 0; padding: 0; }
  :global(body) { overflow: hidden; }
  .app {
    --fg: var(--ink); --bg: var(--paper); --muted: color-mix(in srgb, var(--ink) 62%, var(--paper));
    --border: color-mix(in srgb, var(--ink) 18%, var(--paper)); --card-bg: color-mix(in srgb, var(--paper) 92%, white);
    --night-bg: color-mix(in srgb, var(--paper) 70%, #1d2233); --accent: var(--season); --accent-fg: #fffaf0; --ink-hand: color-mix(in srgb, var(--ink) 80%, #4a2f1c);
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --hand: "Apple Chancery", "Segoe Script", "URW Chancery L", cursive;
    --mono: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-family: var(--serif); color: var(--fg); background: var(--bg);
    height: 100%; display: grid; grid-template-columns: 11.5rem 1fr; transition: background 1.5s ease, color 1.5s ease;
    position: relative;
  }
  .app.dark { --card-bg: color-mix(in srgb, var(--paper) 88%, black); --border: color-mix(in srgb, var(--ink) 22%, var(--paper)); }
  .loading { grid-column: 1 / -1; display: grid; place-items: center; font-style: italic; color: var(--muted); }
  .ornament { color: var(--accent); margin-right: 0.4rem; }
  .rail { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.8rem 0.5rem; border-right: 1px solid var(--border); background: color-mix(in srgb, var(--paper) 94%, var(--ink)); }
  .room { display: flex; align-items: center; gap: 0.55rem; padding: 0.42rem 0.6rem; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--fg); font: inherit; text-align: left; cursor: pointer; position: relative; }
  .room:hover { border-color: var(--border); }
  .room.active { background: var(--card-bg); border-color: var(--border); box-shadow: 0 1px 0 rgba(0,0,0,0.04); }
  .room.quiet { color: var(--muted); font-size: 0.85rem; }
  .glyph { width: 1.2rem; text-align: center; color: var(--accent); }
  .badge { margin-left: auto; font-size: 0.72rem; background: var(--accent); color: var(--accent-fg); border-radius: 999px; padding: 0 0.42rem; line-height: 1.3; }
  .badge.fire { background: #e2792b; animation: pulse 1.4s ease-in-out infinite alternate; }
  .grow { flex: 1; }
  .who { padding: 0.6rem 0.6rem 0.2rem; font-size: 0.9rem; color: var(--muted); line-height: 1.3; }
  .main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .error-bar { background: #b3261e; color: white; padding: 0.3rem 0.8rem; font-size: 0.85rem; }
  .stage { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; }
  .stage.wide { grid-template-columns: minmax(0, 1.15fr) minmax(24rem, 0.85fr); }
  .valley-pane, .room-pane { min-width: 0; min-height: 0; overflow: auto; }
  .valley-pane { overflow: hidden; display: grid; }
  .room-pane { border-left: 1px solid var(--border); background: var(--card-bg); }
  .toast { position: absolute; left: 50%; bottom: 1.2rem; transform: translateX(-50%); background: var(--ink); color: var(--paper); padding: 0.5rem 1rem; border-radius: 999px; font-style: italic; box-shadow: 0 8px 30px rgba(0,0,0,0.2); animation: rise 500ms ease both; }
  .error { color: #b3261e; }
  @keyframes pulse { from { opacity: 0.6; } to { opacity: 1; } }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @media (max-width: 900px) { .app { grid-template-columns: 3.2rem 1fr; } .label, .who { display: none; } }
</style>
