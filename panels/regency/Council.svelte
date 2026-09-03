<script lang="ts">
  import { onMount } from "svelte";
  import { moodOf, seasonLabel, type GameState } from "@workspace/regency-engine";
  import { fs } from "@workspace/runtime";
  import type { GameClient, GameView, MandateLevel } from "./lib/client.js";
  import { chambersChannel, courtChannel, MINISTERS, openCourt, seatTheCourt, type SeatProgress } from "./lib/court.js";
  import Portrait from "./Portrait.svelte";

  let { view, client, refresh, notice }: { view: GameView; client: GameClient; refresh: () => Promise<void>; notice: (text: string, kind?: "info" | "error") => void } = $props();
  const world = $derived(view.state as GameState);
  const player = $derived(world.realms[world.playerRealm]!);
  const council = $derived(view.participants.filter((p) => p.realm === world.playerRealm && p.kind !== "chambers"));
  const seated = (role: string) => council.some((p) => p.role === role);
  const latest = (role: string) => [...view.orders].reverse().find((o) => o.actor === role);
  let busy = $state<string | null>(null);
  let seatProgress = $state<SeatProgress[]>([]);
  let mandate = $state("Keep the peace, feed the provinces, and refer any war to me.");
  let seasons = $state(2);
  let limits = $state({ maySealWar: false, maySealLaws: true, maySealTreaties: true, mayDecideCrises: true, mayCloseSeason: true });
  const MANDATES: MandateLevel[] = ["advise", "act", "plenary"];
  const ROLES = ["herald", ...MINISTERS] as const;

  // The workshop: what the ministers have actually written for themselves.
  let workshop = $state<Array<{ role: string; files: string[] }>>([]);
  let workshopError = $state<string | null>(null);
  async function readWorkshop() {
    try {
      const roots = await fs.readdir("projects/regency");
      const rows: Array<{ role: string; files: string[] }> = [];
      for (const entry of roots) {
        if (entry.includes(".")) continue; // legend.md and other loose files
        try {
          const files = await fs.readdir(`projects/regency/${entry}`);
          rows.push({ role: entry, files: files.slice(0, 12) });
        } catch {
          // a folder we cannot read is simply not shown
        }
      }
      workshop = rows;
      workshopError = null;
    } catch (err) {
      workshop = [];
      workshopError = err instanceof Error ? err.message : String(err);
    }
  }
  onMount(() => {
    void readWorkshop();
  });

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

<div class="council">
  {#if council.length === 0}
    <section>
      <h3>The court is empty</h3>
      <p class="muted">Seat the council, the rival sovereigns and their ambassadors as agents.</p>
      <button class="primary" disabled={busy !== null} onclick={() => run("seat", () => seatTheCourt(client, world, (rows) => (seatProgress = rows)))}>Seat the court</button>
      {#if seatProgress.length}
        <ul class="progress">{#each seatProgress as row (row.seat.role)}<li class={row.status}>{row.seat.name}: {row.status}{row.error ? ` — ${row.error}` : ""}</li>{/each}</ul>
      {/if}
    </section>
  {:else}
    <button class="primary wide" onclick={() => void openCourt(courtChannel(client.gameKey))}>Speak to the council</button>
  {/if}

  <section class="faces">
    {#each ROLES as role (role)}
      {@const c = world.court[role]}
      {#if c}
        <article class="courtier" class:absent={!seated(role)}>
          <Portrait seed={c.portrait} color={player.color} size={64} name={c.name} />
          <div class="who">
            <strong>{c.name}</strong>
            <small class="role">{role} · house {c.house}</small>
            <small class="mood {moodOf(c.standing)}">{moodOf(c.standing)} · standing {Math.round(c.standing)}</small>
            <div class="track"><div class="fill" style={`width:${c.standing}%`}></div></div>
            <small class="temper">{c.temperament}{c.rival ? `; no friend of the ${c.rival}` : ""}</small>
            {#if latest(role)}<small class="counsel">Latest: {latest(role)!.rationale || latest(role)!.status}</small>{/if}
          </div>
          <div class="controls">
            {#if role !== "herald"}
              <select value={view.mandates[role] ?? "act"} onchange={(e) => run("mandate", () => client.setMandate(role, (e.currentTarget as HTMLSelectElement).value as MandateLevel))}>
                {#each MANDATES as m (m)}<option value={m}>{m}</option>{/each}
              </select>
              <button class="tiny" disabled={!seated(role)} onclick={() => void openCourt(chambersChannel(client.gameKey, role))} title="A private conversation the court does not hear">In private</button>
            {:else}
              <small class="muted">interprets · seals on your word</small>
            {/if}
          </div>
        </article>
      {/if}
    {/each}
  </section>
  <p class="muted small">Mandates: <em>advise</em> may only counsel; <em>act</em> issues orders but sensitive acts need your seal; <em>plenary</em> acts without the seal. Standing rises and falls with each minister's cause and colours how they speak.</p>

  <section class="workshop">
    <h3>The workshop</h3>
    <p class="muted small">Each minister keeps a folder at <code>projects/regency/&lt;role&gt;/</code> for the scripts they write to answer their own questions — odds, forecasts, food balances. Their prompts tell them to work there and to reuse what is already in it.</p>
    {#if workshop.length === 0}
      <p class="muted small">{workshopError ? "No workshop folder yet — the ministers have not written anything, or this panel cannot read the project folder." : "Nothing written yet. Ask a minister to work something out and it will appear here."}</p>
    {:else}
      <ul class="files">
        {#each workshop as row (row.role)}
          <li><strong>{world.court[row.role]?.name ?? row.role}</strong> <small>({row.role})</small><span>{row.files.join(" · ")}</span></li>
        {/each}
      </ul>
    {/if}
    <button class="tiny" onclick={() => void readWorkshop()}>Look again</button>
  </section>

  {#if view.handovers.length}
    <section class="handover">
      <h3>The Lord Protector's account</h3>
      {#each [...view.handovers].reverse() as h (h.id)}
        <article>
          <small class="muted">{seasonLabel({ season: h.season, startYear: world.startYear })} · mandate: “{h.mandate}”</small>
          <p>{h.text}</p>
        </article>
      {/each}
    </section>
  {/if}

  <section class="protector">
    <h3>The Lord Protector</h3>
    {#if view.protectorate?.active}
      <p><strong>In office</strong> for {view.protectorate.seasonsLeft} more season{view.protectorate.seasonsLeft === 1 ? "" : "s"} under the mandate: “{view.protectorate.mandate}”</p>
      <p class="muted small">Powers: {Object.entries(view.protectorate.limits).filter(([, v]) => v).map(([k]) => k.replace(/^may/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase()).join(", ") || "none"}.</p>
      <button disabled={busy !== null} onclick={() => run("dismiss", () => client.dismissProtector())}>Resume the seal</button>
    {:else}
      <p class="muted small">Delegate the Regency to an agent for a few seasons under a written mandate. The game enforces the limits; you can resume the seal at any time.{seated("protector") ? "" : " (Seat the court first.)"}</p>
      <textarea bind:value={mandate} rows="2"></textarea>
      <div class="limits">
        <label><input type="checkbox" bind:checked={limits.maySealWar} /> may seal war</label>
        <label><input type="checkbox" bind:checked={limits.maySealLaws} /> may seal laws and taxes</label>
        <label><input type="checkbox" bind:checked={limits.maySealTreaties} /> may seal treaties</label>
        <label><input type="checkbox" bind:checked={limits.mayDecideCrises} /> may decide matters</label>
        <label><input type="checkbox" bind:checked={limits.mayCloseSeason} /> may close the season</label>
        <label>seasons <input type="number" min="1" max="12" bind:value={seasons} /></label>
      </div>
      <button class="primary" disabled={busy !== null || !seated("protector")} onclick={() => run("appoint", () => client.appointProtector({ mandate, seasons, limits }))}>Appoint the Lord Protector</button>
    {/if}
  </section>
</div>

<style>
  .council { display: grid; gap: 12px; }
  section { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  h3 { margin: 0 0 8px; font-size: 0.95rem; font-family: "Georgia", serif; }
  .faces { display: grid; gap: 10px; }
  .courtier { display: grid; grid-template-columns: 64px 1fr auto; gap: 12px; align-items: start; padding: 8px 0; border-top: 1px solid var(--border); }
  .courtier:first-child { border-top: none; }
  .courtier.absent { opacity: 0.55; }
  .who { display: grid; gap: 2px; min-width: 0; }
  .who strong { font-family: "Georgia", serif; }
  .role { color: var(--muted); font-size: 0.75rem; text-transform: capitalize; }
  .mood { font-size: 0.75rem; text-transform: capitalize; }
  .mood.favoured { color: #3a8f4a; }
  .mood.content { color: #5b8f3a; }
  .mood.uneasy { color: #b8862d; }
  .mood.slighted { color: #c0392b; }
  .mood.embittered { color: #8b1e1e; font-weight: 600; }
  .track { height: 5px; border-radius: 3px; background: var(--code-bg); overflow: hidden; max-width: 180px; }
  .fill { height: 100%; background: var(--accent); transition: width 900ms ease; }
  .temper { color: var(--muted); font-size: 0.74rem; line-height: 1.3; }
  .counsel { font-size: 0.74rem; font-style: italic; }
  .controls { display: grid; gap: 4px; justify-items: end; }
  select, textarea, input[type="number"] { font: inherit; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); padding: 4px 6px; }
  textarea { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
  button { font: inherit; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; }
  button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
  button.wide { width: 100%; }
  button.tiny { font-size: 0.75rem; padding: 3px 8px; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .limits { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; font-size: 0.8rem; margin-bottom: 8px; }
  .limits input[type="number"] { width: 60px; }
  .progress { font-size: 0.8rem; padding-left: 18px; }
  .progress .seated { color: #3a8f4a; }
  .progress .failed { color: #c0392b; }
  .muted { color: var(--muted); }
  .small { font-size: 0.78rem; margin: 0; }
  code { font-size: 0.75rem; background: var(--code-bg); padding: 1px 4px; border-radius: 4px; }
  .files { list-style: none; margin: 8px 0; padding: 0; font-size: 0.82rem; display: grid; gap: 4px; }
  .files li { display: grid; gap: 1px; border-top: 1px solid var(--border); padding-top: 5px; }
  .files span { color: var(--muted); font-size: 0.76rem; font-family: ui-monospace, monospace; }
  .handover article { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px; }
  .handover p { margin: 4px 0 0; font-size: 0.85rem; line-height: 1.55; white-space: pre-wrap; }
</style>
