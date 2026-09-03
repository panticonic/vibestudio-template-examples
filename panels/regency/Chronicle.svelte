<script lang="ts">
  import { seasonLabel, type GameState } from "@workspace/regency-engine";
  import type { GameView } from "./lib/client.js";

  let { view, onSelectProvince }: { view: GameView; onSelectProvince: (id: string) => void } = $props();
  const world = $derived(view.state as GameState);
  const ICONS: Record<string, string> = { season: "❧", battle: "⚔", siege: "⛨", capture: "🏴", war: "🔥", treaty: "📜", proposal: "✉", law: "⚖", council: "🕯", famine: "🌾", revolt: "✊", build: "🏗", muster: "🛡", march: "➶", legitimacy: "♛", victory: "🏆", defeat: "☠", elimination: "✝", colonize: "⚑", growth: "✿", unrest: "⚠", economy: "◈", crisis: "❗", court: "👑", trade: "⚖" };
  let filter = $state("all");
  const groups = $derived.by(() => {
    const rows = [...view.events].reverse().filter((e) => filter === "all" || e.kind === filter || (filter === "regent" && (e.kind === "council" || e.kind === "crisis")));
    const out: Array<{ season: number; label: string; rows: typeof rows }> = [];
    for (const e of rows) {
      const last = out[out.length - 1];
      if (last && last.season === e.season) last.rows.push(e);
      else out.push({ season: e.season, label: seasonLabel({ season: e.season, startYear: world.startYear }), rows: [e] });
    }
    return out;
  });
</script>

<div class="ledger">
  <div class="bar">
    <select bind:value={filter}>
      <option value="all">the whole chronicle</option>
      <option value="regent">the Regent's decisions</option>
      {#each Object.keys(ICONS) as k (k)}<option value={k}>{k}</option>{/each}
    </select>
  </div>
  {#if world.digest.length}
    <section class="digest">
      <h4>What changed, and why</h4>
      <p><span class="dropcap">{world.digest[world.digest.length - 1]!.charAt(0)}</span>{world.digest[world.digest.length - 1]!.slice(1)}</p>
    </section>
  {/if}
  {#each groups as g (g.season)}
    <section class="season">
      <h4>❧ {g.label}</h4>
      <ol>
        {#each g.rows as e (e.seq)}
          <li class={e.kind} class:decision={e.kind === "council" || e.kind === "crisis"}>
            <span class="icon">{ICONS[e.kind] ?? "•"}</span>
            <div>
              <p>{e.text}</p>
              {#if e.province}<button class="link" onclick={() => onSelectProvince(e.province!)}>{world.provinces[e.province]?.name}</button>{/if}
            </div>
          </li>
        {/each}
      </ol>
    </section>
  {/each}
</div>

<style>
  .ledger { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; background-image: linear-gradient(90deg, rgba(216,166,58,0.12), transparent 40px); }
  .bar { margin-bottom: 8px; }
  select { font: inherit; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); padding: 4px 6px; }
  .digest { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; background: linear-gradient(135deg, rgba(216,166,58,0.14), transparent); }
  .digest h4 { margin: 0 0 4px; font-family: "Georgia", serif; font-size: 0.95rem; }
  .digest p { margin: 0; font-size: 0.86rem; line-height: 1.5; }
  .dropcap { float: left; font-family: "Georgia", serif; font-size: 2.4rem; line-height: 0.8; padding: 4px 6px 0 0; color: var(--accent); }
  .season h4 { margin: 10px 0 4px; font-family: "Georgia", serif; font-size: 0.9rem; color: var(--accent); letter-spacing: 0.5px; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; gap: 10px; padding: 5px 0; border-top: 1px solid var(--border); font-size: 0.84rem; }
  li.decision { background: linear-gradient(90deg, rgba(216,166,58,0.16), transparent); border-radius: 6px; padding-left: 4px; }
  .icon { width: 20px; text-align: center; flex: none; }
  p { margin: 1px 0 0; line-height: 1.35; }
  .link { font: inherit; font-size: 0.75rem; background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; }
</style>
