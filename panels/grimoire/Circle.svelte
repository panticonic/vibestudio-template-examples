<script lang="ts">
  /**
   * The circle: verse in, one effect line out. The fire drawn in the margin
   * gutters while the familiar deliberates. The valley stays interactive.
   */
  import { onMount } from "svelte";
  import type { Overview, RegionId, SpeakResult, SpellRecord } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { circleChannelKey, openConversation } from "./lib/estate.js";
  import { shapeOf } from "./lib/verse.js";
  import { playCue } from "./lib/sound.js";
  import Flame from "./Flame.svelte";

  let { client, apprentice, overview, echoVerse = $bindable(""), focusCell = $bindable(null), deliberating = $bindable(null), sound, onScry, onOpenRegion }: {
    client: EstateClient; apprentice: string; overview: Overview; echoVerse: string; focusCell: { region: RegionId; x: number; y: number } | null; deliberating: string | null; sound: boolean;
    onScry: (spellId: string) => void; onOpenRegion: (id: RegionId) => void;
  } = $props();

  let verse = $state("");
  let line = $state<string>("");
  let lineKind = $state<"glance" | "effect" | "misfire" | "reject" | "quiet">("quiet");
  let recent = $state<SpellRecord[]>([]);
  let busy = $state(false);
  let lastSpell = $state<SpellRecord | null>(null);
  let poll: ReturnType<typeof setInterval> | null = null;

  const shape = $derived(shapeOf(verse));
  const lit = $derived(overview.firstHour.hearthLit);
  const guttering = $derived(deliberating !== null || overview.deliberating.length > 0);

  $effect(() => { if (echoVerse) { verse = echoVerse; echoVerse = ""; } });

  async function loadRecent(): Promise<void> {
    try {
      const book = await client.call("spellbook", { apprentice });
      const ids = book.spells.slice(0, 5).map((s) => s.id);
      const records = await Promise.all(ids.map((id) => client.call("spell", { id })));
      recent = records.filter((r): r is SpellRecord => !!r);
    } catch { /* the valley will still answer */ }
  }

  async function watch(spellId: string): Promise<void> {
    deliberating = spellId;
    if (poll) clearInterval(poll);
    poll = setInterval(async () => {
      const s = await client.call("spell", { id: spellId }).catch(() => null);
      if (!s) return;
      lastSpell = s;
      if (s.status === "deliberating" || s.status === "rehearsed" || s.status === "heard") return;
      if (poll) clearInterval(poll);
      poll = null;
      deliberating = null;
      const last = s.margin[s.margin.length - 1]?.text ?? "";
      if (s.status === "cast") { lineKind = "effect"; line = `${last} — ${s.receipts.filter((r) => r.status === "applied").length} change${s.receipts.filter((r) => r.status === "applied").length === 1 ? "" : "s"} in ${s.scope.join(", ")}.`; playCue("cast", sound); }
      else if (s.status === "misfired") { lineKind = "misfire"; line = `${last} (${s.misfire?.note ?? "a misfire"})`; playCue("misfire", sound); }
      else if (s.status === "rejected") { lineKind = "reject"; line = s.reject?.line ?? last; }
      else if (s.status === "sealed") { lineKind = "reject"; line = `${last} The chapel has a card for you.`; }
      void loadRecent();
    }, 1500);
  }

  async function speak(): Promise<void> {
    const text = verse.trim();
    if (!text || busy) return;
    busy = true;
    try {
      const result: SpeakResult = await client.call("speak", { apprentice, verse: text, room: "circle", focusCell: focusCell ?? undefined });
      if (result.kind === "gate") { lineKind = "glance"; line = result.line ?? "…"; if (result.studyOpened) line += " (the study door is open)"; }
      else if (result.kind === "instant") { lineKind = "effect"; line = `${result.line ?? "Yours."} — ${result.receipts?.length ?? 0} change${(result.receipts?.length ?? 0) === 1 ? "" : "s"}.`; verse = ""; playCue("cast", sound); if (result.spellId) lastSpell = await client.call("spell", { id: result.spellId }); void loadRecent(); }
      else if (result.kind === "deliberating") { lineKind = "quiet"; line = ""; verse = ""; if (result.spellId) void watch(result.spellId); }
      else if (result.kind === "silence") { lineKind = "reject"; line = result.line ?? "Nobody is at the hearth."; }
    } catch (err) { lineKind = "reject"; line = errorText(err); }
    finally { busy = false; }
  }

  function onKey(e: KeyboardEvent): void { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void speak(); } }

  onMount(() => { void loadRecent(); return () => { if (poll) clearInterval(poll); }; });
</script>

<div class="circle">
  <div class="margin"><Flame {lit} {guttering} size={72} /></div>
  <div class="page">
    <h2 class="quiet">the circle</h2>
    {#if !lit}<p class="hint">The hearth is cold. Anything with the shape of a verse will light it.</p>{/if}
    {#if focusCell}<p class="focus">speaking of {focusCell.region} {focusCell.x},{focusCell.y} <button class="link" onclick={() => (focusCell = null)}>(no)</button></p>{/if}
    <textarea bind:value={verse} onkeydown={onKey} placeholder={lit ? "speak verse; two lines are plenty" : "say anything, in lines"} rows="4" spellcheck="false"></textarea>
    <div class="row">
      <span class="shape">{shape.lines.length} line{shape.lines.length === 1 ? "" : "s"}, {shape.words} words{shape.hint ? ` — ${shape.hint}` : ""}</span>
      <span class="grow"></span>
      <button class="speak" onclick={() => void speak()} disabled={busy || !verse.trim()}>speak <kbd>⌃⏎</kbd></button>
    </div>
    {#if guttering}
      <p class="deliberating">The fire gutters. The familiar is carrying it. You may walk, read, or speak a known spell.</p>
    {/if}
    {#if line}
      <p class={`line ${lineKind}`}>{line}{#if lastSpell && (lineKind === "effect" || lineKind === "misfire")} <button class="link" onclick={() => onScry(lastSpell!.id)}>scry it</button>{#if lastSpell.scope[0]} <button class="link" onclick={() => onOpenRegion(lastSpell!.scope[0]!)}>look</button>{/if}{/if}</p>
    {/if}
    {#if recent.length}
      <h3 class="quiet">lately</h3>
      <ul class="recent">
        {#each recent as s}
          <li class={s.status}><span class="verse">{s.lines[0]}{s.lines.length > 1 ? " / …" : ""}</span><span class="status">{s.name ?? s.status}</span><button class="link" onclick={() => onScry(s.id)}>scry</button></li>
        {/each}
      </ul>
    {/if}
    <p class="conv"><button class="link" onclick={() => void openConversation(circleChannelKey(client.estateKey, apprentice))}>watch the familiar carry it (the circle conversation)</button></p>
  </div>
</div>

<style>
  .circle { display: grid; grid-template-columns: 5.5rem 1fr; height: 100%; }
  .margin { display: flex; justify-content: center; padding-top: 2rem; border-right: 1px dashed var(--border); }
  .page { padding: 1.4rem 1.6rem; max-width: 42rem; }
  h2.quiet, h3.quiet { font-weight: 500; color: var(--muted); font-size: 0.95rem; letter-spacing: 0.08em; text-transform: lowercase; margin: 0 0 0.8rem; }
  h3.quiet { margin-top: 1.6rem; }
  textarea { width: 100%; font: inherit; font-size: 1.15rem; line-height: 1.5; padding: 0.7rem 0.9rem; border: 1px solid var(--border); border-radius: 10px; background: transparent; color: var(--fg); resize: vertical; }
  textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
  .row { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.5rem; }
  .shape { color: var(--muted); font-size: 0.85rem; font-style: italic; }
  .grow { flex: 1; }
  .speak { font: inherit; padding: 0.4rem 1rem; border-radius: 999px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); cursor: pointer; }
  .speak:disabled { opacity: 0.5; cursor: not-allowed; }
  kbd { font-size: 0.7rem; opacity: 0.8; margin-left: 0.3rem; }
  .hint, .focus, .deliberating { color: var(--muted); font-style: italic; }
  .deliberating { animation: breathe 1.6s ease-in-out infinite alternate; }
  .line { font-size: 1.1rem; line-height: 1.5; margin: 1rem 0; padding-left: 0.8rem; border-left: 3px solid var(--border); }
  .line.effect { border-color: var(--accent); }
  .line.misfire { border-color: #e2792b; }
  .line.reject { border-color: #b3261e; }
  .line.glance { font-style: italic; }
  .recent { list-style: none; padding: 0; margin: 0; }
  .recent li { display: flex; gap: 0.6rem; align-items: baseline; padding: 0.25rem 0; border-bottom: 1px dotted var(--border); font-size: 0.92rem; }
  .recent .verse { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .recent .status { color: var(--muted); font-size: 0.8rem; }
  .recent li.misfired .status { color: #e2792b; }
  .link { font: inherit; font-size: 0.85rem; border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline dotted; }
  .conv { margin-top: 1.4rem; }
  @keyframes breathe { from { opacity: 0.6; } to { opacity: 1; } }
</style>
