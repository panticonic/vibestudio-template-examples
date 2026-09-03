<script lang="ts">
  import { seasonLabel, totalCompanies, type GameState } from "@workspace/regency-engine";
  import { layoutMap, decorationPath, HEX } from "./lib/geometry.js";
  import type { EventRow } from "./lib/client.js";

  let {
    world,
    selected = $bindable<string | null>(null),
    dark = false,
    effects = [],
    replay = false,
  }: { world: GameState; selected?: string | null; dark?: boolean; effects?: EventRow[]; replay?: boolean } = $props();

  const layout = $derived(layoutMap(world));
  const realmColor = (id: string): string | null => world.realms[id]?.color ?? (id === "rebels" ? "#8b1e1e" : null);
  const armiesByProvince = $derived.by(() => {
    const out = new Map<string, Array<{ id: string; realm: string; companies: number; besieging: boolean; morale: number }>>();
    for (const a of Object.values(world.armies)) {
      const list = out.get(a.province) ?? [];
      list.push({ id: a.id, realm: a.realm, companies: totalCompanies(a.units), besieging: a.besieging, morale: a.morale });
      out.set(a.province, list);
    }
    return out;
  });
  const shapes = $derived(layout.provinces.map((shape) => ({ shape, province: world.provinces[shape.id]! })));
  const marches = $derived(effects.filter((e) => e.kind === "march" && e.data && typeof e.data["from"] === "string" && typeof e.data["to"] === "string" && layout.centres[e.data["from"] as string] && layout.centres[e.data["to"] as string]));
  const battles = $derived(effects.filter((e) => (e.kind === "battle" || e.kind === "siege") && e.province && layout.centres[e.province]));
  const captures = $derived(effects.filter((e) => (e.kind === "capture" || e.kind === "colonize" || e.kind === "revolt") && e.province && layout.centres[e.province]));
  let hover = $state<string | null>(null);
  const hovered = $derived(hover ? world.provinces[hover] : null);
  const ink = $derived(dark ? "#f2e8d0" : "#3a2c16");
</script>

<div class="map" class:dark class:replay>
  <svg viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Map of ${world.title}`}>
    <defs>
      <radialGradient id="sea" cx="50%" cy="40%" r="80%">
        <stop offset="0%" stop-color={dark ? "#20415a" : "#9fd0e6"} />
        <stop offset="100%" stop-color={dark ? "#0b1622" : "#4f86ad"} />
      </radialGradient>
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.35 0 0 0 0 0.28 0 0 0 0 0.15 0 0 0 0.18 0" />
      </filter>
      <filter id="inner" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
        <feComposite in="blur" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="inset" />
        <feFlood flood-color="#000" flood-opacity="0.35" />
        <feComposite in2="inset" operator="in" />
        <feComposite in2="SourceGraphic" operator="over" />
      </filter>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="blur" />
        <feOffset in="blur" dx="0" dy="2" result="off" />
        <feComponentTransfer in="off" result="soft"><feFuncA type="linear" slope="0.5" /></feComponentTransfer>
        <feMerge><feMergeNode in="soft" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="cloud" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
      <pattern id="waves" width="34" height="16" patternUnits="userSpaceOnUse">
        <path d="M0 8 q8.5 -7 17 0 t17 0" fill="none" stroke={dark ? "#3b6a8c" : "#e6f4fb"} stroke-width="1" opacity="0.45" />
      </pattern>
    </defs>

    <rect width={layout.width} height={layout.height} fill="url(#sea)" />
    <rect width={layout.width} height={layout.height} fill="url(#waves)" />

    <g transform={`translate(${layout.offsetX} ${layout.offsetY})`}>
      <!-- coastal shelf -->
      <path d={layout.land} fill="none" stroke={dark ? "#3c5f7a" : "#c6e5f2"} stroke-width="14" stroke-opacity="0.55" stroke-linejoin="round" />
      <path d={layout.land} fill="none" stroke={dark ? "#4b7392" : "#e8f6fb"} stroke-width="5" stroke-opacity="0.7" stroke-linejoin="round" />
      <!-- parchment land -->
      <path d={layout.land} fill={dark ? "#5d5643" : "#efe6cf"} fill-rule="evenodd" filter="url(#inner)" />
      <path d={layout.land} fill={dark ? "#fff" : "#000"} fill-rule="evenodd" filter="url(#paper)" opacity={dark ? 0.08 : 0.35} style="mix-blend-mode: multiply" />

      <!-- realm tints and terrain art -->
      {#each shapes as { shape, province } (shape.id)}
        {@const color = realmColor(province.owner)}
        <g
          class="province"
          class:selected={selected === shape.id}
          class:hovered={hover === shape.id}
          class:famine={province.famineStreak > 0}
          role="button"
          tabindex="0"
          aria-label={`${province.name}, ${province.owner}`}
          onclick={() => (selected = selected === shape.id ? null : shape.id)}
          onkeydown={(e) => e.key === "Enter" && (selected = shape.id)}
          onmouseenter={() => (hover = shape.id)}
          onmouseleave={() => (hover = null)}
        >
          <path d={shape.path} class="tint" fill={color ?? "#000"} fill-opacity={color ? (dark ? 0.5 : 0.42) : 0.04} fill-rule="evenodd" />
          <g class="art" fill={dark ? "#1b1a14" : "#3a2c16"} stroke={dark ? "#1b1a14" : "#3a2c16"} opacity={dark ? 0.55 : 0.5} pointer-events="none">
            {#each shape.decorations as d, i (i)}
              {#if d.kind === "hill" || d.kind === "reed" || d.kind === "wheat"}
                <path d={decorationPath(d)} fill="none" stroke-width="1.1" stroke-linecap="round" />
              {:else}
                <path d={decorationPath(d)} stroke-width="0.6" />
              {/if}
            {/each}
          </g>
          {#if province.famineStreak > 0}
            <path d={shape.path} class="dust" fill="#6b4a1a" fill-rule="evenodd" pointer-events="none" />
          {/if}
          <path d={shape.path} class="border" fill="none" fill-rule="evenodd" stroke={ink} stroke-width={selected === shape.id ? 2.8 : 1.3} stroke-linejoin="round" stroke-opacity={selected === shape.id ? 1 : 0.8} filter={selected === shape.id ? "url(#glow)" : undefined} />
        </g>
      {/each}

      <!-- rivers and roads -->
      <g pointer-events="none">
        {#each layout.rivers as river, i (i)}
          <path d={river} fill="none" stroke={dark ? "#0b1622" : "#e8f6fb"} stroke-width="5" stroke-opacity="0.6" stroke-linecap="round" stroke-linejoin="round" />
          <path d={river} fill="none" stroke={dark ? "#6fb2d6" : "#4f86ad"} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        {/each}
        {#each layout.roads as road (road.key)}
          <path d={road.d} fill="none" stroke={ink} stroke-width="1.6" stroke-dasharray="4 3" stroke-opacity="0.7" stroke-linecap="round" />
        {/each}
        <path d={layout.coast} fill="none" stroke={dark ? "#dfe9ef" : "#2b4a63"} stroke-width="1.6" stroke-opacity="0.8" stroke-linejoin="round" />
      </g>

      <!-- labels and tokens -->
      {#each shapes as { shape, province } (shape.id)}
        {@const armies = armiesByProvince.get(shape.id) ?? []}
        <g pointer-events="none">
          {#if province.capitalOf}
            <text x={shape.label.x} y={shape.label.y - 13} text-anchor="middle" class="crown">♛</text>
          {/if}
          {#if province.buildings.fort}
            <text x={shape.label.x + 26} y={shape.label.y - 2} text-anchor="middle" class="fort">⛨{province.buildings.fort}</text>
          {/if}
          <text x={shape.label.x} y={shape.label.y + 2} text-anchor="middle" class="name" class:capital={!!province.capitalOf}>{province.name}</text>
          <text x={shape.label.x} y={shape.label.y + 13} text-anchor="middle" class="meta">{province.population.toFixed(0)}k{province.unrest >= 60 ? " ⚠" : ""}{province.famineStreak ? " 🌾" : ""}</text>
          {#each armies as army, i (army.id)}
            {@const cx = shape.centre.x + (i - (armies.length - 1) / 2) * 22}
            {@const cy = shape.centre.y + HEX * 0.85}
            <g class="army" class:enemy={army.realm !== province.owner} filter="url(#shadow)">
              <path d={`M${cx - 9},${cy - 10} h18 v12 q0 7 -9 10 q-9 -3 -9 -10 z`} fill={realmColor(army.realm) ?? "#555"} stroke={dark ? "#111" : "#fff"} stroke-width="1.2" />
              <path d={`M${cx - 9},${cy - 10} h18 v3 h-18 z`} fill="#fff" fill-opacity="0.35" />
              <text x={cx} y={cy + 4} text-anchor="middle" class="count">{army.companies}</text>
              {#if army.besieging}
                <text x={cx + 10} y={cy - 9} class="siege">⚔</text>
              {/if}
            </g>
          {/each}
        </g>
      {/each}

      <!-- effects of the season just passed -->
      <g class="effects" pointer-events="none">
        {#each marches as m (m.seq)}
          {@const from = layout.centres[m.data!["from"] as string]!}
          {@const to = layout.centres[m.data!["to"] as string]!}
          <path d={`M${from.x} ${from.y} L${to.x} ${to.y}`} class="trail" stroke={realmColor(String(m.data!["realm"] ?? "")) ?? ink} />
          <g class="marcher">
            <circle r="7" fill={realmColor(String(m.data!["realm"] ?? "")) ?? "#555"} stroke="#fff" stroke-width="1.5">
              <animateMotion dur="1.8s" begin="0s" fill="freeze" path={`M${from.x} ${from.y} L${to.x} ${to.y}`} />
            </circle>
          </g>
        {/each}
        {#each battles as b (b.seq)}
          {@const c = layout.centres[b.province!]!}
          <circle cx={c.x} cy={c.y} r="10" class="clash" />
          <text x={c.x} y={c.y + 5} text-anchor="middle" class="clash-glyph">⚔</text>
        {/each}
        {#each captures as cap (cap.seq)}
          {@const c = layout.centres[cap.province!]!}
          <circle cx={c.x} cy={c.y} r="10" class="ripple" stroke={realmColor(world.provinces[cap.province!]!.owner) ?? ink} />
        {/each}
      </g>
    </g>

    <!-- drifting clouds -->
    <g class="clouds" filter="url(#cloud)" opacity={dark ? 0.12 : 0.2}>
      <ellipse cx="18%" cy="22%" rx="90" ry="26" fill="#fff" />
      <ellipse cx="62%" cy="70%" rx="120" ry="30" fill="#fff" />
      <ellipse cx="85%" cy="18%" rx="70" ry="22" fill="#fff" />
    </g>

    <text x="18" y="28" class="title">{world.title}</text>
    <text x="18" y="46" class="subtitle">{seasonLabel(world)} · season {world.season + 1} of {world.majoritySeason}{replay ? " · replay" : ""}</text>
  </svg>

  {#if hovered}
    <div class="tooltip">
      <strong>{hovered.name}</strong> — {world.realms[hovered.owner]?.name ?? (hovered.owner === "rebels" ? "rebels" : "free folk")}
      <br />{hovered.terrain}{hovered.coastal ? ", coastal" : ""} · {hovered.population.toFixed(1)}k people · dev {hovered.development} · unrest {Math.round(hovered.unrest)}
      {#if hovered.resources.length}<br />{hovered.resources.join(", ")}{/if}
      {#if hovered.claims.length}<br />claimed by {hovered.claims.map((c) => world.realms[c]?.name ?? c).join(", ")}{/if}
    </div>
  {/if}

  <div class="legend">
    {#each Object.values(world.realms) as realm (realm.id)}
      <span class="swatch" style={`--c:${realm.color}`} class:dead={realm.eliminated}>{realm.name}</span>
    {/each}
    <span class="swatch" style="--c:#d9d3c1">free folk</span>
  </div>
</div>

<style>
  .map { position: relative; width: 100%; height: 100%; min-height: 320px; border-radius: 16px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.18); font-family: "Georgia", "Iowan Old Style", "Times New Roman", serif; }
  .map.replay { outline: 3px solid #d8a63a; outline-offset: -3px; }
  svg { width: 100%; height: 100%; display: block; }
  .province { cursor: pointer; outline: none; }
  .tint { transition: fill 1200ms ease, fill-opacity 600ms ease; }
  .province.hovered .tint { fill-opacity: 0.62; }
  .border { transition: stroke-width 200ms ease; }
  .dust { animation: dust 3s ease-in-out infinite; }
  @keyframes dust { 0%, 100% { fill-opacity: 0.12; } 50% { fill-opacity: 0.3; } }
  .name { font-size: 11.5px; fill: #1e1608; paint-order: stroke; stroke: rgba(255, 250, 235, 0.9); stroke-width: 3.5px; letter-spacing: 0.3px; }
  .name.capital { font-weight: 700; font-size: 12.5px; }
  .dark .name { fill: #f6efdc; stroke: rgba(20, 18, 12, 0.85); }
  .meta { font-size: 9px; fill: #3a2c16; paint-order: stroke; stroke: rgba(255, 250, 235, 0.85); stroke-width: 2.5px; font-family: system-ui, sans-serif; }
  .dark .meta { fill: #efe6d0; stroke: rgba(20, 18, 12, 0.85); }
  .crown { font-size: 14px; fill: #f3c04a; paint-order: stroke; stroke: rgba(40, 25, 0, 0.8); stroke-width: 1.5px; }
  .fort { font-size: 9px; fill: #3a2c16; paint-order: stroke; stroke: rgba(255,250,235,0.85); stroke-width: 2px; font-family: system-ui, sans-serif; }
  .dark .fort { fill: #efe6d0; stroke: rgba(20,18,12,0.85); }
  .count { font-size: 10px; font-weight: 700; fill: #fff; font-family: system-ui, sans-serif; }
  .siege { font-size: 10px; fill: #ffd166; }
  .army.enemy path:first-child { stroke-dasharray: 2 1.5; }
  .title { font-size: 20px; fill: #fff; paint-order: stroke; stroke: rgba(0,0,0,0.55); stroke-width: 3.5px; letter-spacing: 0.5px; }
  .subtitle { font-size: 12px; fill: #fff; paint-order: stroke; stroke: rgba(0,0,0,0.55); stroke-width: 3px; font-family: system-ui, sans-serif; }
  .clouds ellipse { animation: drift 60s linear infinite; }
  .clouds ellipse:nth-child(2) { animation-duration: 85s; animation-delay: -30s; }
  .clouds ellipse:nth-child(3) { animation-duration: 70s; animation-delay: -50s; }
  @keyframes drift { from { transform: translateX(-140px); } to { transform: translateX(140px); } }
  .trail { stroke-width: 2; stroke-dasharray: 3 4; stroke-opacity: 0.7; animation: fadeout 3s ease forwards; }
  .marcher { animation: fadeout 3.2s ease forwards; }
  .clash { fill: none; stroke: #ffd166; stroke-width: 3; animation: clash 1.6s ease-out 2; }
  .clash-glyph { font-size: 16px; fill: #ffd166; paint-order: stroke; stroke: rgba(0,0,0,0.6); stroke-width: 3px; animation: fadeout 4s ease forwards; }
  @keyframes clash { 0% { r: 6; stroke-opacity: 1; } 100% { r: 26; stroke-opacity: 0; } }
  .ripple { fill: none; stroke-width: 4; animation: ripple 2.4s ease-out 2; }
  @keyframes ripple { 0% { r: 8; stroke-opacity: 0.9; } 100% { r: 60; stroke-opacity: 0; } }
  @keyframes fadeout { 0% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
  .tooltip { position: absolute; right: 12px; top: 12px; max-width: 280px; padding: 8px 10px; border-radius: 8px; background: rgba(20, 16, 8, 0.88); color: #f5eedc; font-size: 12px; font-family: system-ui, sans-serif; pointer-events: none; line-height: 1.4; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
  .legend { position: absolute; left: 12px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; font-family: system-ui, sans-serif; font-size: 11px; }
  .swatch { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 4px; border-radius: 999px; background: rgba(255,255,255,0.88); color: #222; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
  .dark .swatch { background: rgba(0,0,0,0.6); color: #eee; }
  .swatch::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--c); border: 1px solid rgba(0,0,0,0.3); }
  .swatch.dead { opacity: 0.45; text-decoration: line-through; }
</style>
