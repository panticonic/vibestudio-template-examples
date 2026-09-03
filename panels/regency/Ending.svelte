<script lang="ts">
  import { dominantTraits, heirAge, seasonLabel, type GameState } from "@workspace/regency-engine";
  import { portraitSvg, crestSvg } from "./lib/portrait.js";
  import type { GameView } from "./lib/client.js";
  import { openCourt } from "./lib/court.js";

  let { view, onDismiss }: { view: GameView; onDismiss: () => void } = $props();
  const world = $derived(view.state as GameState);
  const player = $derived(world.realms[world.playerRealm]!);
  const outcome = $derived(world.outcome!);
  const traits = $derived(dominantTraits(world.heir));
  const tutor = $derived(world.heir.tutor ? world.court[world.heir.tutor] : null);
  let tab = $state<"scene" | "secrets">("scene");

  // The heir grown: the same procedural face, aged into an adult.
  const heirSeed = $derived(Math.abs(Math.round(world.startYear * 7919 + world.majoritySeason * 104729)) % 1_000_000);
  const heirFace = $derived(portraitSvg(heirSeed, player.color, 132, "adult"));
  const heirCrest = $derived(crestSvg(heirSeed, player.color, 46));
  const tutorFace = $derived(tutor ? portraitSvg(tutor.portrait, player.color, 84) : null);

  const KEY_KINDS = ["capture", "war", "treaty", "crisis", "revolt", "elimination", "victory", "defeat"];
  const turningPoints = $derived(
    view.events
      .filter((e) => KEY_KINDS.includes(e.kind) && (e.realms.length === 0 || e.realms.includes(world.playerRealm) || ["war", "treaty", "elimination"].includes(e.kind)))
      .slice(-14)
      .map((e) => ({ ...e, label: seasonLabel({ season: e.season, startYear: world.startYear }) })),
  );
  const ROLE_LABEL = (role: string) => world.court[role]?.name ?? role;
</script>

<div class="ending" class:victory={outcome.kind === "victory"}>
  <div class="page">
    <nav class="tabs">
      <button class:active={tab === "scene"} onclick={() => (tab = "scene")}>The verdict</button>
      <button class:active={tab === "secrets"} onclick={() => (tab = "secrets")}>Secret history</button>
      <button class="dismiss" onclick={onDismiss} title="Back to the map">Back to the realm</button>
    </nav>

    {#if tab === "scene"}
      <div class="illumination">
        <div class="figures">
          <figure class="heir">
            <span class="face">{@html heirFace}</span>
            <span class="crest">{@html heirCrest}</span>
            <figcaption>{world.heir.name}, {heirAge(world)}{traits.length ? ` — ${traits.join(" and ")}` : ""}</figcaption>
          </figure>
          {#if tutorFace && tutor}
            <figure class="tutor">
              <span class="face">{@html tutorFace}</span>
              <figcaption>{tutor.name}<br /><small>tutor, once the {tutor.role}</small></figcaption>
            </figure>
          {/if}
        </div>
        <div class="words">
          <h1><span class="dropcap">{outcome.title.charAt(0)}</span>{outcome.title.slice(1)}</h1>
          <p class="reason">{outcome.reason}</p>
          {#if outcome.verdict}<blockquote>{outcome.verdict}</blockquote>{/if}
          <dl class="tally">
            <div><dt>Provinces</dt><dd>{Object.values(world.provinces).filter((p) => p.owner === world.playerRealm).length}</dd></div>
            <div><dt>Legitimacy</dt><dd>{Math.round(player.legitimacy)}</dd></div>
            <div><dt>Prestige</dt><dd>{Math.round(player.prestige)}</dd></div>
            <div><dt>Infamy</dt><dd>{Math.round(player.infamy)}</dd></div>
            <div><dt>Reputation</dt><dd>{Math.round(world.regent.reputation)}</dd></div>
          </dl>
        </div>
      </div>

      <section class="timeline">
        <h2>Turning points</h2>
        <ol>
          {#each turningPoints as e (e.seq)}
            <li class={e.kind}><span class="when">{e.label}</span><span class="what">{e.text}</span></li>
          {/each}
          {#if turningPoints.length === 0}<li><span class="what">A Regency in which nothing turned.</span></li>{/if}
        </ol>
      </section>

      {#if view.chronicles.length}
        <section class="chronicle-prose">
          <h2>The chronicler's years</h2>
          {#each view.chronicles as c (c.year)}
            <article><h3>{c.year}</h3><p>{c.text}</p></article>
          {/each}
        </section>
      {/if}
    {:else}
      <section class="secrets">
        <h2>What you were not told</h2>
        {#if !view.secrets}
          <p class="muted">Nothing to open.</p>
        {:else}
          <h3>Gold set before your ministers</h3>
          {#if view.secrets.bribes.length === 0}
            <p class="muted">Not one of your ministers was ever approached. Either you were poor company or they were discreet.</p>
          {:else}
            <ul>
              {#each view.secrets.bribes as b (b.id)}
                <li class={b.status}>
                  <strong>{world.realms[b.fromRealm]?.name ?? b.fromRealm}</strong> set <strong>{b.gold}</strong> gold before {ROLE_LABEL(b.targetRole)}, the {b.targetRole}, in {seasonLabel({ season: b.season, startYear: world.startYear })} — <em>{b.status === "accepted" ? "and it was taken" : b.status === "reported" ? "and it was laid before you" : b.status === "expired" ? "and nothing came of it" : b.status}</em>{b.note ? `: “${b.note}”` : ""}
                </li>
              {/each}
            </ul>
          {/if}

          <h3>What the ambassadors wrote about you</h3>
          {#if view.secrets.dossiers.length === 0}<p class="muted">No dossier survives.</p>{/if}
          {#each view.secrets.dossiers as d (d.role)}
            <article class="quote"><h4>{world.court[d.role]?.name ?? d.role}</h4><p>{d.text}</p></article>
          {/each}

          <h3>What the rival courts told themselves</h3>
          {#if view.secrets.diaries.length === 0 && view.secrets.doctrines.length === 0}<p class="muted">The rival courts kept no book.</p>{/if}
          {#each view.secrets.doctrines as d (d.realm)}
            <article class="quote"><h4>{world.realms[d.realm]?.name ?? d.realm} — doctrine, {seasonLabel({ season: d.season, startYear: world.startYear })}</h4><p>{d.text}</p></article>
          {/each}
          {#each view.secrets.diaries as d (d.realm)}
            <article class="quote"><h4>{world.realms[d.realm]?.name ?? d.realm} — their book on you</h4><p>{d.text}</p></article>
          {/each}

          <h3>Your word</h3>
          {#if view.secrets.promises.length === 0}
            <p class="muted">You promised nothing that anyone wrote down.</p>
          {:else}
            <ul>
              {#each view.secrets.promises as p (p.id)}
                <li class={p.status}><strong>{p.status}</strong> — to {world.realms[p.to]?.name ?? p.to}: “{p.text}”</li>
              {/each}
            </ul>
          {/if}

          {#if view.secrets.chambers.length}
            <h3>The private chambers</h3>
            <p class="muted small">Every word your ministers spoke where you could not hear. They are ordinary conversations; you may read them now.</p>
            <div class="row">
              {#each view.secrets.chambers as c (c.channelId)}
                <button onclick={() => void openCourt(c.channelId)}>{ROLE_LABEL(c.role)}'s chamber</button>
              {/each}
            </div>
          {/if}

          {#if view.handovers.length}
            <h3>The Lord Protector's account</h3>
            {#each view.handovers as h (h.id)}
              <article class="quote"><h4>{seasonLabel({ season: h.season, startYear: world.startYear })} — “{h.mandate}”</h4><p>{h.text}</p></article>
            {/each}
          {/if}
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .ending { position: absolute; inset: 0; z-index: 8; overflow: auto; background: radial-gradient(ellipse at 50% -10%, rgba(216,166,58,0.28), transparent 60%), var(--bg); animation: open 700ms ease; }
  @keyframes open { from { opacity: 0; transform: scale(1.02); } to { opacity: 1; transform: none; } }
  .page { max-width: 900px; margin: 0 auto; padding: 20px 26px 60px; font-family: "Georgia", "Iowan Old Style", serif; }
  .tabs { display: flex; gap: 6px; margin-bottom: 18px; position: sticky; top: 0; padding: 8px 0; background: linear-gradient(var(--bg) 70%, transparent); z-index: 2; }
  .tabs button { font: inherit; font-size: 0.85rem; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--card-bg); color: var(--muted); cursor: pointer; }
  .tabs button.active { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
  .tabs .dismiss { margin-left: auto; }
  .illumination { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 24px; align-items: start; border: 1px solid var(--border); border-radius: 16px; padding: 22px; background: var(--card-bg); background-image: linear-gradient(135deg, rgba(216,166,58,0.16), transparent 55%); box-shadow: 0 12px 40px rgba(0,0,0,0.18); }
  @media (max-width: 720px) { .illumination { grid-template-columns: 1fr; } }
  .figures { display: grid; gap: 14px; justify-items: center; }
  figure { margin: 0; position: relative; text-align: center; }
  .face :global(svg) { display: block; border-radius: 18px; box-shadow: 0 6px 18px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.2); }
  .crest { position: absolute; right: -8px; bottom: 26px; }
  .crest :global(svg) { display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45)); }
  figcaption { margin-top: 8px; font-size: 0.85rem; color: var(--muted); }
  .tutor .face :global(svg) { opacity: 0.9; }
  h1 { margin: 0 0 6px; font-size: 1.9rem; line-height: 1.15; }
  .dropcap { font-size: 3.2rem; line-height: 0.8; float: left; padding: 6px 8px 0 0; color: var(--accent); }
  .reason { margin: 0 0 10px; font-size: 1rem; line-height: 1.55; }
  blockquote { margin: 12px 0; padding-left: 14px; border-left: 3px solid var(--accent); font-style: italic; line-height: 1.6; }
  .tally { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 14px 0 0; font-family: system-ui, sans-serif; }
  .tally div { display: grid; }
  .tally dt { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); }
  .tally dd { margin: 0; font-size: 1.2rem; font-family: "Georgia", serif; }
  section { margin-top: 22px; border: 1px solid var(--border); border-radius: 16px; padding: 18px 22px; background: var(--card-bg); }
  h2 { margin: 0 0 10px; font-size: 1.05rem; letter-spacing: 0.5px; color: var(--accent); }
  h3 { margin: 16px 0 6px; font-size: 0.95rem; }
  h4 { margin: 0 0 3px; font-size: 0.85rem; }
  .timeline ol { list-style: none; margin: 0; padding: 0; }
  .timeline li { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; padding: 7px 0; border-top: 1px solid var(--border); font-size: 0.88rem; line-height: 1.4; }
  .timeline .when { color: var(--accent); font-size: 0.8rem; }
  .timeline li.war, .timeline li.defeat { border-left: 3px solid #8b1e1e; padding-left: 8px; }
  .timeline li.treaty, .timeline li.victory { border-left: 3px solid #3a8f4a; padding-left: 8px; }
  .chronicle-prose article { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px; }
  .chronicle-prose p { line-height: 1.6; font-size: 0.92rem; }
  .secrets ul { margin: 0; padding-left: 18px; font-size: 0.88rem; line-height: 1.5; }
  .secrets li.accepted { color: #8b1e1e; }
  .secrets li.broken { color: #8b1e1e; }
  .secrets li.kept { color: #3a8f4a; }
  .quote { border-left: 3px solid var(--border); padding: 4px 0 4px 12px; margin: 8px 0; }
  .quote p { margin: 0; font-size: 0.88rem; line-height: 1.55; white-space: pre-wrap; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .row button { font: inherit; font-size: 0.82rem; padding: 5px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; }
  .muted { color: var(--muted); }
  .small { font-size: 0.8rem; }
</style>
