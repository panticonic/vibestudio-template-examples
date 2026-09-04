<script lang="ts">
  /**
   * The scrying page: one readable manuscript page. The verse with the
   * concepts heard in the margin, the intent in plain words, the writing
   * under the words typeset as manuscript with the familiar's gloss, the
   * ancestry, the effects with before and after, the cost, the triggers,
   * and firings across time.
   */
  import type { Overview, RegionId, ScryPage } from "@workspace/grimoire-engine";
  import type { EstateClient } from "./lib/client.js";
  import { errorText } from "./lib/client.js";
  import { deltaBars } from "./lib/draw.js";
  import { LAYER_INK } from "./lib/palette.js";

  type Target = { kind: "spell" | "cell" | "entity" | "spirit"; ref: string; region?: RegionId; x?: number; y?: number };
  let { client, apprentice, target, overview, onScry }: { client: EstateClient; apprentice: string; target: Target | null; overview: Overview; onScry: (t: Target) => void } = $props();

  let page = $state<ScryPage | null>(null);
  let error = $state<string | null>(null);
  let hoverLine = $state<number | null>(null);
  let manual = $state("");

  $effect(() => {
    const t = target;
    if (!t) return;
    error = null; page = null;
    client.call("scry", { apprentice, kind: t.kind, ref: t.ref, region: t.region, x: t.x, y: t.y })
      .then((out) => { if ("error" in out) error = out.error; else page = out; })
      .catch((err) => (error = errorText(err)));
  });

  const codeLines = $derived(page?.spell.writing ? page.spell.writing.split("\n") : []);
  const marginWords = $derived(page ? page.words.filter((w) => w.concept || w.name) : []);
  function gloss(n: number): string | null { return page?.spell.gloss[String(n)] ?? page?.spell.gloss[String(n + 1)] ?? null; }
  function plain(line: string): string {
    const t = line.trim();
    if (!t || t.startsWith("//")) return t.replace(/^\/\/\s?/, "");
    if (/^for\s*\(/.test(t)) return "for each of these…";
    if (/^if\s*\(/.test(t)) return "only when…";
    if (/effect\.transmute/.test(t)) return "change a cell";
    if (/effect\.sluice/.test(t)) return "set a sluice";
    if (/effect\.adorn/.test(t)) return "a charm";
    if (/effect\.mark/.test(t)) return "a mark";
    if (/effect\.spawn/.test(t)) return "call a creature or seed";
    if (/effect\.push/.test(t)) return "push it a cell";
    if (/on\.(cell|sky|entity|speech|spell)/.test(t)) return "a ward: watch for this";
    if (/bind\./.test(t)) return "the golem's body";
    if (/voice\./.test(t)) return "speech to a spirit";
    if (/read\./.test(t)) return "read the world";
    if (/return/.test(t)) return "and answer";
    return "";
  }
</script>

<div class="scry">
  <header>
    <h2>scrying</h2>
    <form class="ask" onsubmit={(e) => { e.preventDefault(); if (manual.trim()) onScry({ kind: manual.startsWith("s-") || manual.startsWith("stale:") ? "spell" : overview.spirits.some((s) => s.id === manual.trim()) ? "spirit" : "entity", ref: manual.trim() }); }}>
      <input bind:value={manual} placeholder="a spell id, a creature's name, a spirit" />
      <button type="submit">scry</button>
    </form>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  {#if !target && !page}
    <p class="quiet">Ask of a spell, a cell, a creature, or a spirit what it did, who did it, why, and what was heard. Shallow scries are free; one deep scry of another's spell per bell hour.</p>
  {/if}
  {#if page}
    <article class={`page hand-${page.hand}`}>
      <div class="head">
        <div class="verse">
          {#each page.spell.lines as l}<div class="l">{l}</div>{/each}
        </div>
        <div class="who">{page.casterName} · {page.spell.tier} · tick {page.spell.castTick ?? page.spell.createdTick}{page.spell.name ? ` · ${page.spell.name}` : ""}<br /><small>status: {page.spell.status}{page.spell.fromCache ? " · spoken again" : ""}{page.deepLeft === 0 ? " · no deep scries left this bell" : ""}</small></div>
      </div>

      <section class="heard">
        <h3>what was heard</h3>
        <div class="words">
          {#each page.words as w}
            <span class="w" class:root={w.root} class:name={w.name} class:unsure={w.unsure} class:heard={!!w.concept} title={w.concept ? `${w.concept} (${Math.round(w.confidence * 100)}%)` : ""}>{w.word}{#if w.concept}<sup>{w.concept}</sup>{/if}</span>
          {/each}
        </div>
        {#if marginWords.some((w) => w.unsure)}<p class="note">marked words were guessed at; a mis-hearing is fair, and the margin says which.</p>{/if}
        {#if page.spell.intent}
          <p class="intent"><strong>intent:</strong> {page.spell.intent.effect} — {page.spell.intent.subject.kind} {page.spell.intent.subject.ref}{page.spell.intent.binding ? `, ${page.spell.intent.binding.kind} ${page.spell.intent.binding.condition}` : ""}{page.spell.intent.unsure.length ? ` · unsure of: ${page.spell.intent.unsure.join(", ")}` : ""}</p>
        {/if}
        {#if page.spell.resonance.unknown.length}<p class="note">no word for: {page.spell.resonance.unknown.join(", ")}</p>{/if}
      </section>

      {#if page.spell.margin.length}
        <section class="margin">
          {#each page.spell.margin as m}<p class={`m hand-${m.hand}`}>{m.text}</p>{/each}
          {#if page.echo}<p class="m hand-ysolde">{page.echo}</p>{/if}
        </section>
      {/if}

      {#if codeLines.length}
        <section class="writing">
          <h3>the writing under the words</h3>
          <div class="code">
            {#each codeLines as line, i}
              <div class="row" class:hovered={hoverLine === i} onmouseenter={() => (hoverLine = i)} onmouseleave={() => (hoverLine = null)} role="presentation">
                <span class="n">{i + 1}</span>
                <pre class="src">{line}</pre>
                <span class="g">{gloss(i) ?? (hoverLine === i ? plain(line) : "")}</span>
              </div>
            {/each}
          </div>
          {#if page.ancestry.length}<p class="note">drew on: {page.ancestry.map((a) => `${a.name} (${a.kind})`).join(", ")}</p>{/if}
          {#if page.spell.rehearsal}<p class="note">rehearsed: {page.spell.rehearsal.summary}{page.spell.rehearsal.error ? ` — ${page.spell.rehearsal.error}` : ""}</p>{/if}
        </section>
      {/if}

      {#if page.behaviour}
        <section class="writing">
          <h3>{page.behaviour.name}: what it does ({page.behaviour.lines} lines)</h3>
          <div class="code">
            {#each page.behaviour.source.split("\n") as line, i}<div class="row"><span class="n">{i + 1}</span><pre class="src">{line}</pre><span class="g">{plain(line)}</span></div>{/each}
          </div>
        </section>
      {/if}

      <section class="effects">
        <h3>what it did</h3>
        {#if page.spell.receipts.length}
          <div class="bars">
            {#each deltaBars(page.before, page.after) as b}<span class="bar" style={`--ink:${LAYER_INK[b.layer]}`}><i style={`width:${Math.min(100, Math.abs(b.after - b.before) * 4)}%`}></i><small>{b.layer} {b.before} → {b.after}</small></span>{/each}
          </div>
          <ul class="receipts">
            {#each page.spell.receipts.slice(0, 40) as r}
              <li class={r.status}>{r.effect.kind}{"cell" in r.effect ? ` at ${r.effect.cell.region} ${r.effect.cell.x},${r.effect.cell.y}` : "at" in r.effect && typeof r.effect.at === "object" ? ` at ${r.effect.at.region} ${r.effect.at.x},${r.effect.at.y}` : ""}{r.status === "rejected" ? ` — ${r.reason}` : ""}{r.etherCost ? ` · ${r.etherCost} ether` : ""}</li>
            {/each}
            {#if page.spell.receipts.length > 40}<li class="quiet">…and {page.spell.receipts.length - 40} more</li>{/if}
          </ul>
        {:else}
          <p class="quiet">nothing yet</p>
        {/if}
        {#if page.spell.misfire}<p class="misfire">misfire — {page.spell.misfire.kind}: {page.spell.misfire.note}</p>{/if}
        {#if page.spell.reject}<p class="misfire">not heard — {page.spell.reject.reason}: {page.spell.reject.line}</p>{/if}
        <p class="note">cost: {page.cost.ether} ether, from {page.cost.from}</p>
      </section>

      {#if page.triggeredBy.length || page.triggered.length}
        <section class="links">
          {#if page.triggeredBy.length}<p>set off by: {#each page.triggeredBy as t}<button class="link" onclick={() => onScry({ kind: "spell", ref: t.id })}>{t.name ?? t.verse.split("\n")[0]}</button>{/each}</p>{/if}
          {#if page.triggered.length}<p>set off: {#each page.triggered as t}<button class="link" onclick={() => onScry({ kind: "spell", ref: t.id })}>{t.name ?? t.verse.split("\n")[0]}</button>{/each}</p>{/if}
        </section>
      {/if}

      {#if page.spell.firings.length}
        <section class="firings">
          <h3>firings</h3>
          <div class="strip">
            {#each page.spell.firings as f}<span class="f" class:bad={!!f.error || !!f.misfire} title={`tick ${f.tick}: ${f.receipts.filter((r) => r.status === "applied").length} applied${f.error ? `; ${f.error}` : ""}`}></span>{/each}
          </div>
          <p class="note">{page.spell.firings.length} firing{page.spell.firings.length === 1 ? "" : "s"}; last at tick {page.spell.firings[page.spell.firings.length - 1]?.tick}{page.spell.firings[page.spell.firings.length - 1]?.error ? ` — ${page.spell.firings[page.spell.firings.length - 1]?.error}` : ""}</p>
        </section>
      {/if}
    </article>
  {/if}
</div>

<style>
  .scry { padding: 1.2rem 1.6rem 3rem; max-width: 52rem; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
  h2 { margin: 0; font-weight: 500; font-size: 1.2rem; letter-spacing: 0.06em; color: var(--muted); }
  h3 { font-weight: 500; margin: 0 0 0.4rem; color: var(--muted); font-size: 0.85rem; letter-spacing: 0.08em; text-transform: lowercase; }
  .ask { display: flex; gap: 0.4rem; }
  .ask input { font: inherit; font-size: 0.9rem; padding: 0.25rem 0.6rem; border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--fg); width: 18rem; }
  .ask button { font: inherit; font-size: 0.85rem; padding: 0.2rem 0.7rem; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
  .page { background: color-mix(in srgb, var(--paper) 88%, #fff8e6); border: 1px solid var(--border); border-radius: 4px; padding: 1.6rem 2rem; box-shadow: 0 12px 40px rgba(0,0,0,0.1); display: grid; gap: 1.2rem; }
  .head { display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: start; }
  .verse { font-family: var(--hand); font-size: 1.5rem; color: var(--ink-hand); line-height: 1.35; }
  .page.hand-ysolde .verse { color: #6b4a3a; }
  .who { text-align: right; font-size: 0.85rem; color: var(--muted); }
  .words { display: flex; flex-wrap: wrap; gap: 0.35rem 0.5rem; font-size: 1.05rem; }
  .w { position: relative; padding-bottom: 0.9rem; }
  .w sup { position: absolute; left: 0; bottom: 0; font-size: 0.65rem; color: var(--accent); white-space: nowrap; font-family: var(--serif); }
  .w.heard { border-bottom: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); }
  .w.root { font-weight: 600; }
  .w.name { letter-spacing: 0.05em; color: var(--accent); }
  .w.unsure sup { color: #e2792b; }
  .w.unsure { text-decoration: underline wavy #e2792b; text-underline-offset: 3px; }
  .intent { margin: 0.6rem 0 0; }
  .note, .quiet { color: var(--muted); font-size: 0.85rem; font-style: italic; margin: 0.4rem 0 0; }
  .margin { border-left: 3px solid var(--border); padding-left: 0.8rem; }
  .m { margin: 0.2rem 0; font-style: italic; color: var(--muted); }
  .m.hand-ysolde { font-family: var(--hand); font-style: normal; font-size: 1.15rem; color: #7a4d5f; }
  .m.hand-world { color: var(--fg); }
  .code { border: 1px solid var(--border); border-radius: 8px; overflow: auto; background: color-mix(in srgb, var(--paper) 96%, var(--ink)); }
  .row { display: grid; grid-template-columns: 2.2rem minmax(0, 1fr) minmax(8rem, 0.5fr); gap: 0.4rem; align-items: baseline; padding: 0.1rem 0.5rem; }
  .row.hovered { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .n { color: var(--muted); font-size: 0.72rem; text-align: right; }
  .src { margin: 0; font-family: var(--mono); font-size: 0.82rem; white-space: pre; }
  .g { font-size: 0.8rem; color: var(--muted); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bars { display: flex; flex-wrap: wrap; gap: 0.4rem 0.9rem; margin-bottom: 0.4rem; }
  .bar { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: var(--muted); }
  .bar i { display: inline-block; height: 5px; min-width: 6px; max-width: 80px; background: var(--ink); border-radius: 2px; }
  .receipts { list-style: none; padding: 0; margin: 0; font-size: 0.82rem; columns: 2; column-gap: 1.2rem; }
  .receipts li { padding: 0.1rem 0; break-inside: avoid; }
  .receipts li.rejected { color: #b3261e; }
  .misfire { color: #e2792b; font-style: italic; }
  .link { font: inherit; font-size: 0.9rem; border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0 0.3rem; text-decoration: underline dotted; }
  .strip { display: flex; gap: 2px; flex-wrap: wrap; }
  .f { width: 8px; height: 14px; background: var(--accent); opacity: 0.7; border-radius: 1px; }
  .f.bad { background: #e2792b; }
  .error { color: #b3261e; }
</style>
