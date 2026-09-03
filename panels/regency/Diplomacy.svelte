<script lang="ts">
  import { atWar, describePromiseCheck, realmProvinces, realmStrength, seasonLabel, tradeRoutes, treatyBetween, type GameState } from "@workspace/regency-engine";
  import type { GameClient, GameView } from "./lib/client.js";
  import { embassyChannel, openCourt, rivalCourtChannel } from "./lib/court.js";
  import Portrait from "./Portrait.svelte";

  let { view, client }: { view: GameView; client: GameClient } = $props();
  const world = $derived(view.state as GameState);
  const me = $derived(world.playerRealm);
  const rivals = $derived(Object.values(world.realms).filter((r) => r.id !== me));
  const pending = $derived(world.proposals.filter((p) => p.status === "pending"));
  const seated = (role: string) => view.participants.some((p) => p.role === role);
  const routesTo = (realm: string) => tradeRoutes(world, me).filter((r) => r.realm === realm).length;
  const promisesTo = (realm: string) => view.promises.filter((p) => p.to === realm);
  const brokenTo = (realm: string) => promisesTo(realm).filter((p) => p.status === "broken").length;
  let busy = $state(false);
  async function judge(id: string, status: "kept" | "broken") {
    busy = true;
    try {
      await client.settlePromise(id, status);
    } finally {
      busy = false;
    }
  }
</script>

<div class="diplomacy">
  {#each rivals as r (r.id)}
    {@const sov = world.court[`sovereign:${r.id}`]}
    {@const amb = world.court[`ambassador:${r.id}`]}
    <section class:dead={r.eliminated} style={`--c:${r.color}`}>
      <header>
        {#if sov}<Portrait seed={sov.portrait} color={r.color} size={48} name={sov.name} />{/if}
        <div>
          <strong>{r.name}</strong>
          <small>{sov ? `${sov.name}, ${sov.temperament}` : r.character}</small>
        </div>
      </header>
      <dl>
        <dt>Standing</dt><dd>{atWar(world, me, r.id) ? "⚔ at war" : "at peace"} · they regard us {r.relations[me] ?? 0}, we them {world.realms[me]!.relations[r.id] ?? 0}</dd>
        <dt>Treaties</dt><dd>{world.treaties.filter((t) => t.parties.includes(me) && t.parties.includes(r.id)).map((t) => t.kind.replace("_", "-")).join(", ") || "none"}</dd>
        <dt>Trade</dt><dd>{routesTo(r.id)} route{routesTo(r.id) === 1 ? "" : "s"} open{atWar(world, me, r.id) ? " (blockaded)" : ""}</dd>
        <dt>Our word</dt><dd class:bad={brokenTo(r.id) > 0}>{promisesTo(r.id).length === 0 ? "nothing promised" : `${promisesTo(r.id).filter((p) => p.status === "kept").length} kept, ${brokenTo(r.id)} broken, ${promisesTo(r.id).filter((p) => p.status === "pending").length} owed`}</dd>
        <dt>Realm</dt><dd>{realmProvinces(world, r.id).length} provinces · strength {Math.round(realmStrength(world, r.id))} · prestige {Math.round(r.prestige)} · infamy {Math.round(r.infamy)}{treatyBetween(world, me, r.id, "alliance") ? " · ally" : ""}</dd>
      </dl>
      {#if !r.eliminated}
        <div class="row">
          <button class="primary" disabled={!seated(`ambassador:${r.id}`)} onclick={() => void openCourt(embassyChannel(client.gameKey, r.id))}>Receive {amb ? amb.name.split(" ")[0] : "the ambassador"}</button>
          <button disabled={!seated(`sovereign:${r.id}`)} onclick={() => void openCourt(rivalCourtChannel(client.gameKey, r.id))} title="Watch their court deliberate (you may speak, but you are a guest)">Visit their court</button>
        </div>
      {/if}
    </section>
  {/each}
  <section>
    <h3>The Regent's word</h3>
    {#if view.promises.length === 0}
      <p class="muted">Nothing you have said to a foreign court has been written down. Ask the Herald or the Envoy to record a promise when you make one; the world then judges it for itself, and a broken word costs infamy and regard.</p>
    {/if}
    <ul class="promises">
      {#each view.promises as p (p.id)}
        <li class={p.status}>
          <div class="line"><span class="mark">{p.status === "kept" ? "✓" : p.status === "broken" ? "✗" : "…"}</span>
            <div>
              <strong>to {world.realms[p.to]?.name ?? p.to}</strong> <small>{seasonLabel({ season: p.season, startYear: world.startYear })} · recorded by the {p.recordedBy}</small>
              <p>“{p.text}”</p>
              <small class="check">kept when: {describePromiseCheck(world, p.check)}</small>
            </div>
          </div>
          {#if p.status === "pending" && p.check.kind === "free_text"}
            <div class="row">
              <button class="tiny" disabled={busy} onclick={() => void judge(p.id, "kept")}>I kept it</button>
              <button class="tiny" disabled={busy} onclick={() => void judge(p.id, "broken")}>I did not</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <h3>Proposals on the table</h3>
    {#if pending.length === 0}<p class="muted">None. The Envoy or an ambassador can put one forward.</p>{/if}
    {#each pending as p (p.id)}
      <article class="proposal">
        <strong>{world.realms[p.from]?.name}</strong> → <strong>{world.realms[p.to]?.name}</strong>: {p.kind.replace("_", "-")} <code>{JSON.stringify(p.terms)}</code>
        <p class="muted">“{p.message}” <small>[{p.id}]</small></p>
      </article>
    {/each}
  </section>
  {#if view.bribes.length}
    <section>
      <h3>Reported temptations</h3>
      {#each view.bribes as b (b.id)}
        <p class="muted small">{world.realms[b.fromRealm]?.name} set {b.gold} gold before the {b.targetRole} — {b.status}{b.note ? `: “${b.note}”` : ""}</p>
      {/each}
    </section>
  {/if}
</div>

<style>
  .diplomacy { display: grid; gap: 12px; }
  section { background: var(--card-bg); border: 1px solid var(--border); border-left: 4px solid var(--c, var(--border)); border-radius: 12px; padding: 12px 14px; }
  section.dead { opacity: 0.5; }
  header { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  header small { display: block; color: var(--muted); font-size: 0.78rem; line-height: 1.3; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 10px; margin: 0 0 8px; font-size: 0.82rem; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  button { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 0.85rem; }
  button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  h3 { margin: 0 0 8px; font-size: 0.95rem; }
  .proposal { border-top: 1px solid var(--border); padding: 6px 0; font-size: 0.85rem; }
  .proposal p { margin: 2px 0 0; font-style: italic; }
  code { font-size: 0.75rem; background: var(--code-bg); padding: 1px 4px; border-radius: 4px; }
  .muted { color: var(--muted); }
  .small { font-size: 0.8rem; margin: 4px 0; }
  dd.bad { color: #c0392b; }
  .promises { list-style: none; margin: 0; padding: 0; font-size: 0.83rem; }
  .promises li { border-top: 1px solid var(--border); padding: 7px 0; }
  .promises .line { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: start; }
  .promises .mark { font-weight: 700; }
  .promises li.kept .mark { color: #3a8f4a; }
  .promises li.broken .mark { color: #c0392b; }
  .promises li.pending .mark { color: var(--muted); }
  .promises p { margin: 2px 0; font-style: italic; }
  .promises small { color: var(--muted); font-size: 0.74rem; }
  .promises .check { display: block; }
  .tiny { font-size: 0.75rem; padding: 3px 8px; }
</style>
