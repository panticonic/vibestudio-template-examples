<script lang="ts">
  import { armiesIn, foodNeeded, foodProduced, tradeRoutes, totalCompanies, type GameState } from "@workspace/regency-engine";
  import { openCourt, courtChannel } from "./lib/court.js";
  import type { EventRow } from "./lib/client.js";
  import Why from "./Why.svelte";

  let {
    world,
    provinceId,
    gameKey,
    events = [],
    onClose,
    onSpeak = undefined,
  }: {
    world: GameState;
    provinceId: string;
    gameKey: string;
    events?: EventRow[];
    onClose: () => void;
    /** Send a message to the council about this province (or one of its armies). */
    onSpeak?: ((text: string, about: { province?: string; army?: string }) => Promise<void>) | undefined;
  } = $props();

  const p = $derived(world.provinces[provinceId]!);
  const owner = $derived(world.realms[p.owner]?.name ?? (p.owner === "rebels" ? "rebels" : "free folk"));
  const food = $derived(foodNeeded(p) > 0 ? foodProduced(p) / foodNeeded(p) : 2);
  const armies = $derived(armiesIn(world, p.id));
  const buildings = $derived(Object.entries(p.buildings).filter(([, n]) => n > 0));
  const routes = $derived(p.buildings.market > 0 && p.owner in world.realms ? tradeRoutes(world, p.owner).filter((r) => r.from === p.id) : []);

  let speaking = $state<null | { about: { province?: string; army?: string }; subject: string }>(null);
  let draft = $state("");
  let sending = $state(false);

  function openSpeech(about: { province?: string; army?: string }, subject: string, suggestion: string) {
    speaking = { about, subject };
    draft = suggestion;
  }

  async function send() {
    if (!speaking || !onSpeak || !draft.trim()) return;
    sending = true;
    try {
      await onSpeak(draft.trim(), speaking.about);
      speaking = null;
      draft = "";
      await openCourt(courtChannel(gameKey));
    } finally {
      sending = false;
    }
  }
</script>

<section class="card">
  <header>
    <div><h3>{p.name} <small>[{p.id}]</small></h3><small>{owner}{p.capitalOf ? " · capital" : ""} · {p.terrain}{p.coastal ? ", coastal" : ""}</small></div>
    <button class="close" onclick={onClose} aria-label="close">×</button>
  </header>
  <dl>
    <dt>People</dt><dd>{p.population.toFixed(1)}k · development {p.development} · fertility {p.fertility}</dd>
    <dt>Bread</dt>
    <dd class:bad={food < 1}>{food.toFixed(2)} of need · granary {p.granary.toFixed(1)}{p.famineStreak ? ` · famine ${p.famineStreak}` : ""}
      <Why {world} {events} subject={{ kind: "province", province: p.id, aspect: "hunger" }} /></dd>
    <dt>Unrest</dt>
    <dd class:bad={p.unrest >= 60}>{Math.round(p.unrest)}
      <Why {world} {events} subject={{ kind: "province", province: p.id, aspect: "unrest" }} /></dd>
    <dt>Walls</dt><dd>{p.buildings.fort ? `level ${p.buildings.fort}, ${Math.ceil(p.fortHp)}/${p.buildings.fort * 10}` : "none"}</dd>
    <dt>Resources</dt><dd>{p.resources.join(", ") || "—"}</dd>
    <dt>Buildings</dt><dd>{buildings.map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(", ") || "—"}</dd>
    {#if routes.length}<dt>Trade</dt><dd>{routes.length} route{routes.length > 1 ? "s" : ""}: {routes.map((r) => `${world.provinces[r.to]!.name} (${r.kind})`).join(", ")}</dd>{/if}
    <dt>Claims</dt><dd>{p.claims.map((c) => world.realms[c]?.name ?? c).join(", ") || "—"}</dd>
    <dt>Neighbours</dt><dd>{p.neighbors.map((n) => world.provinces[n]!.name).join(", ")}</dd>
  </dl>
  {#if armies.length}
    <h4>Armies</h4>
    <ul>
      {#each armies as a (a.id)}
        <li>
          <strong>{a.name}</strong> ({world.realms[a.realm]?.name ?? a.realm}) — {totalCompanies(a.units)} companies: levy {a.units.levy}, regular {a.units.regular}, cavalry {a.units.cavalry}, siege {a.units.siege}; morale {a.morale}{a.besieging ? "; besieging" : ""}
          <Why {world} {events} subject={{ kind: "army", army: a.id }} label="why here?" />
          {#if onSpeak && a.realm === world.playerRealm}
            <button class="link" onclick={() => openSpeech({ army: a.id, province: p.id }, a.name, `Marshal — about ${a.name} in ${p.name}: `)}>Speak about it</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if speaking}
    <div class="speech">
      <label for="speech-draft">To the council, about <strong>{speaking.subject}</strong></label>
      <textarea id="speech-draft" bind:value={draft} rows="3"></textarea>
      <div class="row">
        <button class="primary" disabled={sending || !draft.trim()} onclick={() => void send()}>{sending ? "Sending…" : "Say it in council"}</button>
        <button onclick={() => (speaking = null)}>Never mind</button>
      </div>
      <p class="muted small">The Herald receives it with {speaking.about.army ? "the army" : "the province"} attached, so nobody has to guess which one you meant.</p>
    </div>
  {:else}
    <div class="row">
      {#if onSpeak}
        <button class="primary" onclick={() => openSpeech({ province: p.id }, p.name, `Herald — about ${p.name}: `)}>Speak about {p.name}</button>
      {/if}
      <button class="ghost" onclick={() => void openCourt(courtChannel(gameKey))}>Open the council</button>
    </div>
  {/if}
</section>

<style>
  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; }
  h3 { margin: 0; font-family: "Georgia", serif; }
  h3 small { color: var(--muted); font-weight: 400; font-size: 0.75rem; }
  header small { color: var(--muted); font-size: 0.8rem; }
  .close { font: inherit; font-size: 1.2rem; background: none; border: none; color: var(--muted); cursor: pointer; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 10px; margin: 10px 0 0; font-size: 0.83rem; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  dd.bad { color: #c0392b; }
  h4 { margin: 10px 0 4px; font-size: 0.85rem; }
  ul { margin: 0; padding-left: 16px; font-size: 0.8rem; }
  ul li { margin-bottom: 4px; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  button { font: inherit; font-size: 0.85rem; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; }
  button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
  button.ghost { background: transparent; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .link { font-size: 0.72rem; padding: 0 4px; border: none; background: none; color: var(--accent); }
  .speech { margin-top: 10px; display: grid; gap: 6px; }
  .speech label { font-size: 0.78rem; color: var(--muted); }
  textarea { font: inherit; font-size: 0.85rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); padding: 6px 8px; width: 100%; box-sizing: border-box; resize: vertical; }
  .muted { color: var(--muted); }
  .small { font-size: 0.74rem; margin: 0; }
</style>
