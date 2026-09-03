<script lang="ts">
  import { atWar, realmProvinces, realmStrength, tradeRoutes, treatyBetween, type GameState } from "@workspace/regency-engine";
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
</style>
