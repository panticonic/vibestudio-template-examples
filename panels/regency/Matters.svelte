<script lang="ts">
  import { describeEffects, describeOrder, type EdictCondition, type GameState, type Order } from "@workspace/regency-engine";
  import type { Forecast, GameClient, GameView } from "./lib/client.js";
  import { edictDiff, edictLines } from "./lib/laws.js";
  import Portrait from "./Portrait.svelte";

  let {
    view,
    client,
    refresh,
    notice,
    onFocusProvince = undefined,
    onHighlightEdict = undefined,
  }: {
    view: GameView;
    client: GameClient;
    refresh: () => Promise<void>;
    notice: (text: string, kind?: "info" | "error") => void;
    onFocusProvince?: ((province: string) => void) | undefined;
    onHighlightEdict?: ((when: EdictCondition[] | null) => void) | undefined;
  } = $props();
  const world = $derived(view.state as GameState);
  const player = $derived(world.realms[world.playerRealm]!);
  const awaiting = $derived(view.orders.filter((o) => o.status === "awaiting_seal"));
  const others = $derived(view.orders.filter((o) => o.status !== "awaiting_seal"));
  const pending = $derived(world.crises.filter((c) => c.chosen === null));
  let busy = $state<string | null>(null);
  let forecasts = $state<Record<string, Forecast | "loading">>({});
  let directOrder = $state('{"kind":"build","province":"p1","building":"farm"}');
  let directError = $state<string | null>(null);
  const debates = $derived(view.debates.filter((d) => d.status === "open" || d.season >= world.season - 1));
  const proposedLaws = $derived(awaiting.filter((o) => o.order.kind === "enact_edict" || o.order.kind === "repeal_edict").map((o) => o.order));
  const lawDiff = $derived(proposedLaws.length ? edictDiff(player.laws.edicts, proposedLaws) : []);
  let openEdict = $state<string | null>(null);
  function readEdict(id: string, when: EdictCondition[] | null) {
    openEdict = openEdict === id ? null : id;
    onHighlightEdict?.(openEdict ? when : null);
  }

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
  async function preview(key: string, input: { includeOrderIds?: string[]; orders?: Order[] }) {
    forecasts = { ...forecasts, [key]: "loading" };
    try {
      const fc = await client.forecast(input);
      forecasts = { ...forecasts, [key]: fc };
    } catch (err) {
      notice(err instanceof Error ? err.message : String(err), "error");
      const { [key]: _gone, ...rest } = forecasts;
      forecasts = rest;
    }
  }
  const delta = (b: number, a: number) => `${a >= b ? "+" : ""}${Math.round((a - b) * 10) / 10}`;
</script>

<div class="matters">
  <section>
    <h3>Matters of state {#if pending.length}<span class="pill">{pending.length}</span>{/if}</h3>
    {#if pending.length === 0}<p class="muted">Nothing awaits a decision. Matters arise with the seasons; undecided ones take their default when the court closes.</p>{/if}
    {#each pending as c (c.id)}
      <article class="matter">
        <header><strong>{c.title}</strong><small>{c.province ? world.provinces[c.province]?.name : ""}</small></header>
        <p>{c.text}</p>
        <div class="options">
          {#each c.options as o (o.id)}
            <div class="option" class:default={o.id === c.defaultOption}>
              <div class="head">
                {#if o.adviser && world.court[o.adviser]}<Portrait seed={world.court[o.adviser]!.portrait} color={player.color} size={28} crest={false} name={world.court[o.adviser]!.name} />{/if}
                <strong>{o.label}</strong>{#if o.id === c.defaultOption}<em class="tag">default</em>{/if}
              </div>
              <small>{o.text}</small>
              <small class="fx">{describeEffects(world, o.effects)}</small>
              <button class="primary tiny" disabled={busy !== null} onclick={() => run("decide", () => client.decideCrisis(c.id, o.id))}>Choose</button>
            </div>
          {/each}
        </div>
      </article>
    {/each}
  </section>

  <section>
    <h3>The Regent's seal {#if awaiting.length}<span class="pill">{awaiting.length}</span>{/if}</h3>
    {#if awaiting.length === 0}<p class="muted">Nothing awaits your seal. Speak to the council and they will bring you acts to decide.</p>{/if}
    {#each awaiting as o (o.id)}
      {@const fc = forecasts[o.id]}
      <article class="act">
        <header>
          {#if world.court[o.actor]}<Portrait seed={world.court[o.actor]!.portrait} color={player.color} size={36} crest={false} name={world.court[o.actor]!.name} />{/if}
          <div><strong>{world.court[o.actor]?.name ?? o.actor}</strong> asks to <em>{describeOrder(world, o.order)}</em></div>
        </header>
        {#if o.rationale}<p class="rationale">“{o.rationale}”</p>{/if}
        {#if o.order.kind === "enact_edict"}
          {@const proposed = o.order.edict}
          <pre class="code">{#each edictLines(proposed) as line, i (i)}<span class="lead">{line.lead}</span>{#each line.tokens as t, j (j)}<span class={`tok ${t.kind}`}>{t.text}</span>{/each}{"\n"}{/each}</pre>
          <button class="ghost tiny" onmouseenter={() => onHighlightEdict?.(proposed.when)} onmouseleave={() => onHighlightEdict?.(null)} onclick={() => onHighlightEdict?.(proposed.when)}>Light the provinces it would touch</button>
        {/if}
        {#if "province" in o.order && typeof o.order.province === "string" && onFocusProvince}
          {@const target = o.order.province}
          <button class="ghost tiny" onclick={() => onFocusProvince(target)}>Show me {world.provinces[target]?.name ?? target}</button>
        {/if}
        {#if fc && fc !== "loading"}
          <div class="forecast">
            <span>treasury {delta(fc.treasury.before, fc.treasury.after)}</span>
            <span>legitimacy {delta(fc.legitimacy.before, fc.legitimacy.after)}</span>
            <span>provinces {delta(fc.provinces.before, fc.provinces.after)}</span>
            {#if fc.wars.length}<span>wars: {fc.wars.join("; ")}</span>{/if}
            {#if fc.events.length}<small>{fc.events.slice(0, 4).join(" · ")}</small>{/if}
            <small class="muted">{fc.assumption}</small>
          </div>
        {/if}
        <div class="row">
          <button class="primary" disabled={busy !== null} onclick={() => run("seal", () => client.sealOrder(o.id, "seal"))}>Seal</button>
          <button disabled={busy !== null} onclick={() => run("veto", () => client.sealOrder(o.id, "veto"))}>Veto</button>
          <button class="ghost" disabled={fc === "loading"} onclick={() => void preview(o.id, { includeOrderIds: [o.id] })}>{fc === "loading" ? "Forecasting…" : "Forecast"}</button>
        </div>
      </article>
    {/each}
  </section>

  {#if debates.length}
    <section>
      <h3>The council debates</h3>
      {#each debates as d (d.id)}
        <article class="debate" class:open={d.status === "open"}>
          <header><strong>{d.question}</strong><small>{d.status === "open" ? `${d.lines.length} of 4 have answered` : "closed"}</small></header>
          <ul class="counsel">
            {#each d.lines as l (l.role)}
              <li>
                {#if world.court[l.role]}<Portrait seed={world.court[l.role]!.portrait} color={player.color} size={26} crest={false} name={l.name} />{/if}
                <div><strong>{l.name}</strong> <small>({l.role})</small><p>{l.text}</p></div>
              </li>
            {/each}
            {#each ["chancellor", "treasurer", "marshal", "envoy"].filter((r) => !d.lines.some((l) => l.role === r)) as role (role)}
              <li class="waiting"><div><small>the {role} has not spoken</small></div></li>
            {/each}
          </ul>
          {#if d.status === "open"}
            <button class="ghost tiny" disabled={busy !== null} onclick={() => run("close-debate", () => client.closeDebate(d.id))}>Close the debate</button>
          {/if}
        </article>
      {/each}
      <p class="muted small">Ask the Herald to “put it to the council” and each minister answers on the record.</p>
    </section>
  {/if}

  <section>
    <h3>The law book</h3>
    {#if player.laws.edicts.length === 0 && lawDiff.length === 0}
      <p class="muted">Three standing laws — tax {Math.round(player.laws.taxRate * 100)}%, conscription {player.laws.conscription}, granary reserve {Math.round(player.laws.granaryReserve * 100)}% — and no edicts. The Chancellor writes edicts as data; ask for one.</p>
    {:else}
      <p class="muted small">tax {Math.round(player.laws.taxRate * 100)}% · conscription {player.laws.conscription} · granary reserve {Math.round(player.laws.granaryReserve * 100)}%</p>
    {/if}
    {#each player.laws.edicts as e (e.id)}
      <article class="edict" class:reading={openEdict === e.id}>
        <button class="edict-head" onclick={() => readEdict(e.id, e.when)} aria-expanded={openEdict === e.id}>
          <span class="title">{e.title}</span>
          <small>[{e.id}] · by the {e.author}</small>
        </button>
        {#if openEdict === e.id}
          <pre class="code">{#each edictLines(e) as line, i (i)}<span class="lead">{line.lead}</span>{#each line.tokens as t, j (j)}<span class={`tok ${t.kind}`}>{t.text}</span>{/each}{"\n"}{/each}</pre>
          <p class="muted small">The provinces it touches are lit on the map.</p>
        {/if}
      </article>
    {/each}
    {#if lawDiff.length}
      <h4>If you seal what is waiting</h4>
      <ul class="diff">
        {#each lawDiff as row (row.kind + row.id)}
          <li class={row.kind}><span class="sign">{row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "}</span>{row.title}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Order book</h3>
    {#if others.length === 0}<p class="muted">No orders yet this season.</p>{/if}
    <ul class="orders">
      {#each others as o (o.id)}
        <li class={o.status}><span class="who">{world.court[o.actor]?.name ?? o.actor}</span> {describeOrder(world, o.order)} <span class="status">{o.status}{o.reason ? ` — ${o.reason}` : ""}</span></li>
      {/each}
    </ul>
    <button class="ghost tiny" disabled={forecasts["season"] === "loading"} onclick={() => void preview("season", {})}>{forecasts["season"] === "loading" ? "Forecasting…" : "Forecast the season as it stands"}</button>
    {#if forecasts["season"] && forecasts["season"] !== "loading"}
      {@const fc = forecasts["season"]}
      <div class="forecast">
        <span>treasury {fc.treasury.before} → {fc.treasury.after}</span>
        <span>legitimacy {fc.legitimacy.before} → {fc.legitimacy.after}</span>
        <span>provinces {fc.provinces.before} → {fc.provinces.after}</span>
        {#if fc.events.length}<small>{fc.events.slice(0, 6).join(" · ")}</small>{/if}
        {#if fc.rejected.length}<small class="bad">would fail: {fc.rejected.join("; ")}</small>{/if}
      </div>
    {/if}
  </section>

  <details>
    <summary>The Regent's own hand</summary>
    <p class="muted small">Bypasses the council. Useful when no minister is seated. An order is JSON as described in the rules.</p>
    <textarea bind:value={directOrder} rows="3"></textarea>
    {#if directError}<p class="bad">{directError}</p>{/if}
    <button disabled={busy !== null} onclick={() => run("direct", async () => {
      directError = null;
      let order: Order;
      try { order = JSON.parse(directOrder) as Order; } catch { directError = "not valid JSON"; return; }
      const res = await client.submitOrder({ realm: world.playerRealm, actor: "regent", order });
      if (!res.ok) directError = res.reason; else notice(`Ordered: ${res.summary}`);
    })}>Submit</button>
  </details>
</div>

<style>
  .matters { display: grid; gap: 12px; }
  .debate { border-top: 1px solid var(--border); padding: 10px 0; }
  .debate.open { border-left: 3px solid var(--accent); padding-left: 8px; }
  .debate header { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .debate header strong { font-family: "Georgia", serif; font-size: 0.9rem; }
  .debate header small { color: var(--muted); flex: none; }
  .counsel { list-style: none; margin: 8px 0 6px; padding: 0; display: grid; gap: 8px; }
  .counsel li { display: grid; grid-template-columns: 26px 1fr; gap: 8px; align-items: start; font-size: 0.82rem; }
  .counsel li.waiting { grid-template-columns: 1fr; color: var(--muted); font-style: italic; }
  .counsel p { margin: 2px 0 0; line-height: 1.4; }
  .counsel small { color: var(--muted); }
  .edict { border-top: 1px solid var(--border); }
  .edict-head { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; text-align: left; background: none; border: none; padding: 7px 0; cursor: pointer; color: inherit; }
  .edict-head .title { font-weight: 600; font-size: 0.86rem; }
  .edict-head small { color: var(--muted); font-size: 0.72rem; }
  .edict.reading { border-left: 3px solid #7a4fb0; padding-left: 8px; }
  .code { font-size: 0.74rem; background: var(--code-bg); padding: 8px 10px; border-radius: 8px; overflow: auto; max-height: 180px; line-height: 1.6; white-space: pre; }
  .lead { display: inline-block; width: 42px; color: var(--muted); font-style: italic; }
  .tok.field { color: #2d6b8f; font-weight: 600; }
  .tok.op { color: #8b5e00; }
  .tok.value { color: #3a8f4a; }
  .tok.action { color: #7a4fb0; font-weight: 600; }
  .tok.key { color: var(--muted); }
  .diff { list-style: none; margin: 6px 0 0; padding: 0; font-size: 0.82rem; font-family: ui-monospace, monospace; }
  .diff li { padding: 3px 6px; border-radius: 5px; }
  .diff li.added { background: rgba(58,143,74,0.16); }
  .diff li.removed { background: rgba(192,57,43,0.16); text-decoration: line-through; }
  .diff .sign { display: inline-block; width: 14px; font-weight: 700; }
  h4 { margin: 12px 0 4px; font-size: 0.85rem; }
  section { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  h3 { margin: 0 0 8px; font-size: 0.95rem; font-family: "Georgia", serif; display: flex; align-items: center; gap: 8px; }
  .pill { background: var(--accent); color: var(--accent-fg); border-radius: 999px; font-size: 0.7rem; padding: 1px 7px; font-family: system-ui, sans-serif; }
  .matter { border-top: 1px solid var(--border); padding: 10px 0; }
  .matter header { display: flex; justify-content: space-between; gap: 8px; }
  .matter header strong { font-family: "Georgia", serif; }
  .matter header small { color: var(--muted); }
  .matter p { margin: 4px 0 8px; font-size: 0.86rem; line-height: 1.45; }
  .options { display: grid; gap: 6px; }
  .option { display: grid; gap: 3px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; font-size: 0.82rem; }
  .option.default { border-style: dashed; }
  .option .head { display: flex; align-items: center; gap: 8px; }
  .option .tag { font-size: 0.7rem; color: var(--muted); font-style: normal; border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; }
  .option .fx { color: var(--muted); }
  .act { border-top: 1px solid var(--border); padding: 10px 0; }
  .act header { display: flex; gap: 10px; align-items: center; font-size: 0.9rem; }
  .rationale { margin: 4px 0; color: var(--muted); font-style: italic; font-size: 0.85rem; }
  .row { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
  pre { font-size: 0.7rem; background: var(--code-bg); padding: 6px; border-radius: 6px; overflow: auto; max-height: 120px; }
  .forecast { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.8rem; margin: 6px 0; padding: 6px 8px; border-radius: 8px; background: var(--code-bg); }
  .forecast small { width: 100%; }
  button { font: inherit; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; }
  button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
  button.ghost { background: transparent; }
  button.tiny { font-size: 0.78rem; padding: 4px 9px; justify-self: start; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .orders { list-style: none; margin: 0 0 8px; padding: 0; font-size: 0.83rem; }
  .orders li { padding: 4px 0; border-top: 1px solid var(--border); }
  .orders .who { font-weight: 600; }
  .orders .status { color: var(--muted); font-size: 0.75rem; }
  .orders li.rejected .status, .orders li.vetoed .status { color: #c0392b; }
  .orders li.resolved .status { color: #3a8f4a; }
  textarea { font: inherit; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); padding: 4px 6px; width: 100%; box-sizing: border-box; }
  .muted { color: var(--muted); }
  .small { font-size: 0.78rem; }
  .bad { color: #c0392b; font-size: 0.85rem; }
  details { background: var(--card-bg); border: 1px dashed var(--border); border-radius: 12px; padding: 10px 14px; }
  summary { cursor: pointer; font-size: 0.9rem; }
</style>
