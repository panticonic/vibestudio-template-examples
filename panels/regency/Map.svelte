<script lang="ts">
  import { atWar, seasonLabel, totalCompanies, tradeRoutes, treatyBetween, type GameState, type StagedIntent } from "@workspace/regency-engine";
  import { layoutMap, decorationPath, snowPath, HEX } from "./lib/geometry.js";
  import { matchingProvinces } from "./lib/laws.js";
  import type { EventRow } from "./lib/client.js";

  let {
    world,
    selected = $bindable<string | null>(null),
    dark = false,
    effects = [],
    replay = false,
    intents = [],
    beat = null,
    caption = null,
    onSkip = undefined,
    focusRequest = null,
    highlightEdict = null,
  }: {
    world: GameState;
    selected?: string | null;
    dark?: boolean;
    effects?: EventRow[];
    replay?: boolean;
    intents?: StagedIntent[];
    /** Which beat of the resolution is playing: marches, clashes, captures, harvest. */
    beat?: "marches" | "clashes" | "captures" | "harvest" | null;
    caption?: string | null;
    onSkip?: (() => void) | undefined;
    /** Province the rest of the panel wants the camera on; set to focus. */
    focusRequest?: { province: string; nonce: number } | null;
    /** Conditions of an edict being read; the provinces it touches light up. */
    highlightEdict?: { when: import("@workspace/regency-engine").EdictCondition[] } | null;
  } = $props();

  const layout = $derived(layoutMap(world));
  const realmColor = (id: string): string | null => world.realms[id]?.color ?? (id === "rebels" ? "#8b1e1e" : null);
  const season = $derived(world.season % 4);
  const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
  const seasonClass = $derived(SEASONS[season]!);
  const armiesByProvince = $derived.by(() => {
    const out = new Map<string, Array<{ id: string; name: string; realm: string; companies: number; besieging: boolean; morale: number }>>();
    for (const a of Object.values(world.armies)) {
      const list = out.get(a.province) ?? [];
      list.push({ id: a.id, name: a.name, realm: a.realm, companies: totalCompanies(a.units), besieging: a.besieging, morale: a.morale });
      out.set(a.province, list);
    }
    return out;
  });
  const shapes = $derived(layout.provinces.map((shape) => ({ shape, province: world.provinces[shape.id]! })));
  const marches = $derived(effects.filter((e) => e.kind === "march" && e.data && typeof e.data["from"] === "string" && typeof e.data["to"] === "string" && layout.centres[e.data["from"] as string] && layout.centres[e.data["to"] as string]));
  const battles = $derived(effects.filter((e) => (e.kind === "battle" || e.kind === "siege") && e.province && layout.centres[e.province]));
  const captures = $derived(effects.filter((e) => (e.kind === "capture" || e.kind === "colonize" || e.kind === "revolt") && e.province && layout.centres[e.province]));

  // Staged intents: what the council means to do, before it is an order.
  const intentMarches = $derived(intents.filter((i) => i.kind === "march" && i.payload.from && i.payload.to && layout.centres[i.payload.from] && layout.centres[i.payload.to]));
  const intentOffers = $derived(intents.filter((i) => i.kind === "offer" && i.payload.target && world.realms[i.payload.target] && world.realms[i.realm] && layout.centres[world.realms[i.payload.target]!.capital] && layout.centres[world.realms[i.realm]!.capital]));
  const intentWorks = $derived(intents.filter((i) => (i.kind === "build" || i.kind === "muster") && i.payload.province && layout.centres[i.payload.province]));
  const intentEdictProvinces = $derived.by(() => {
    const out = new Map<string, string>();
    for (const i of intents) {
      if (i.kind !== "edict" || !i.payload.when?.length) continue;
      for (const id of matchingProvinces(world, { when: i.payload.when }, i.realm)) out.set(id, i.label);
    }
    return out;
  });
  // Trade: every route the Regent's markets reach, drawn as a thread that moves.
  const trade = $derived.by(() => {
    if (!world.realms[world.playerRealm]) return [];
    return tradeRoutes(world, world.playerRealm)
      .filter((r) => layout.centres[r.from] && layout.centres[r.to])
      .map((r) => {
        const a = layout.centres[r.from]!;
        const b = layout.centres[r.to]!;
        const bend = r.kind === "sea" ? 0.28 : 0.1;
        const mid = { x: (a.x + b.x) / 2 + (b.y - a.y) * bend, y: (a.y + b.y) / 2 - (b.x - a.x) * bend };
        return { key: `${r.from}>${r.to}`, kind: r.kind, d: `M${a.x} ${a.y} Q${mid.x} ${mid.y} ${b.x} ${b.y}` };
      });
  });
  const edictLit = $derived(new Set(highlightEdict?.when?.length ? matchingProvinces(world, { when: highlightEdict.when }) : []));

  let hover = $state<string | null>(null);
  let hoverArmy = $state<string | null>(null);
  const hovered = $derived(hover ? world.provinces[hover] : null);
  const ink = $derived(dark ? "#f2e8d0" : "#3a2c16");

  // ── Camera ────────────────────────────────────────────────────────────────
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let dragging = $state(false);
  let dragFrom = { x: 0, y: 0, panX: 0, panY: 0 };
  /** Set once a press has travelled far enough to be a pan; the click that ends it must not select a province. */
  let panned = false;
  let easing = $state(false);
  let svgEl = $state<SVGSVGElement | null>(null);

  const clampZoom = (z: number) => Math.max(0.6, Math.min(4, z));

  function setZoom(next: number, about?: { x: number; y: number }) {
    const z = clampZoom(next);
    if (about) {
      // Keep the point under the cursor where it is.
      panX = about.x - ((about.x - panX) * z) / zoom;
      panY = about.y - ((about.y - panY) * z) / zoom;
    }
    zoom = z;
  }

  function svgPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = svgEl?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: layout.width / 2, y: layout.height / 2 };
    const scale = Math.min(rect.width / layout.width, rect.height / layout.height);
    const offX = (rect.width - layout.width * scale) / 2;
    const offY = (rect.height - layout.height * scale) / 2;
    return { x: (event.clientX - rect.left - offX) / scale, y: (event.clientY - rect.top - offY) / scale };
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), svgPoint(event));
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    dragging = true;
    panned = false;
    easing = false;
    dragFrom = { x: event.clientX, y: event.clientY, panX, panY };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    if (!panned && Math.hypot(event.clientX - dragFrom.x, event.clientY - dragFrom.y) < 5) return;
    panned = true;
    const rect = svgEl?.getBoundingClientRect();
    const scale = rect && rect.width ? Math.min(rect.width / layout.width, rect.height / layout.height) : 1;
    panX = dragFrom.panX + (event.clientX - dragFrom.x) / scale;
    panY = dragFrom.panY + (event.clientY - dragFrom.y) / scale;
  }

  function endDrag() {
    dragging = false;
  }

  /** Ease the camera onto a province. Called by the chronicle, the cards and selection. */
  export function focusOn(provinceId: string, scale = 2): void {
    const centre = layout.centres[provinceId];
    if (!centre) return;
    easing = true;
    zoom = clampZoom(scale);
    panX = layout.width / 2 - (centre.x + layout.offsetX) * zoom;
    panY = layout.height / 2 - (centre.y + layout.offsetY) * zoom;
    setTimeout(() => (easing = false), 700);
  }

  function resetCamera(): void {
    easing = true;
    zoom = 1;
    panX = 0;
    panY = 0;
    setTimeout(() => (easing = false), 700);
  }

  let lastFocusNonce = -1;
  $effect(() => {
    const request = focusRequest;
    if (!request || request.nonce === lastFocusNonce) return;
    lastFocusNonce = request.nonce;
    focusOn(request.province);
  });
</script>

<div class="map {seasonClass}" class:dark class:replay class:cinema={beat !== null}>
  <svg
    bind:this={svgEl}
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label={`Map of ${world.title}`}
    class:dragging
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  >
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
      <marker id="ghost-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
      </marker>
    </defs>

    <rect width={layout.width} height={layout.height} fill="url(#sea)" />
    <rect width={layout.width} height={layout.height} fill="url(#waves)" />

    <g class="camera" class:easing transform={`translate(${panX} ${panY}) scale(${zoom}) translate(${layout.offsetX} ${layout.offsetY})`}>
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
          class:staged={intentEdictProvinces.has(shape.id)}
          class:lit={edictLit.has(shape.id)}
          role="button"
          tabindex="0"
          aria-label={`${province.name}, ${province.owner}`}
          onclick={() => {
            if (panned) return;
            selected = selected === shape.id ? null : shape.id;
          }}
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
          {#if season === 3}
            <!-- snow settles on the high ground -->
            <g class="snow" pointer-events="none">
              {#each shape.decorations as d, i (i)}
                {#if d.kind === "peak" || d.kind === "hill"}
                  <path d={snowPath(d)} fill="#ffffff" fill-opacity="0.85" stroke="none" />
                {/if}
              {/each}
            </g>
          {/if}
          {#if province.famineStreak > 0}
            <path d={shape.path} class="dust" fill="#6b4a1a" fill-rule="evenodd" pointer-events="none" />
          {/if}
          {#if intentEdictProvinces.has(shape.id) || edictLit.has(shape.id)}
            <path d={shape.path} class="edict-wash" fill="#7a4fb0" fill-rule="evenodd" pointer-events="none" />
          {/if}
          <path d={shape.path} class="border" fill="none" fill-rule="evenodd" stroke={ink} stroke-width={selected === shape.id ? 2.8 : 1.3} stroke-linejoin="round" stroke-opacity={selected === shape.id ? 1 : 0.8} filter={selected === shape.id ? "url(#glow)" : undefined} />
        </g>
      {/each}

      <!-- the season lies over the whole land: green, gold, brown, frost -->
      <path class="weather" d={layout.land} fill-rule="evenodd" pointer-events="none" />

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

      <!-- trade: gold threads between markets, moving while the routes are open -->
      <g class="trade" pointer-events="none">
        {#each trade as t (t.key)}
          <path d={t.d} fill="none" stroke={dark ? "#0b0a06" : "#fff8e6"} stroke-width="3" stroke-opacity="0.5" stroke-linecap="round" />
          <path d={t.d} class="thread" class:sea={t.kind === "sea"} fill="none" stroke={t.kind === "sea" ? (dark ? "#8fd0f0" : "#2f7fb0") : (dark ? "#f0c35a" : "#b8862d")} stroke-width="1.4" stroke-dasharray="3 9" stroke-linecap="round" />
        {/each}
      </g>

      <!-- what the council means to do, before it is an order -->
      <g class="intents" pointer-events="none">
        {#each intentMarches as i (i.id)}
          {@const from = layout.centres[i.payload.from!]!}
          {@const to = layout.centres[i.payload.to!]!}
          {@const mid = { x: (from.x + to.x) / 2 + (to.y - from.y) * 0.18, y: (from.y + to.y) / 2 - (to.x - from.x) * 0.18 }}
          <g class="ghost" style={`color:${realmColor(i.realm) ?? ink}`}>
            <path d={`M${from.x} ${from.y} Q${mid.x} ${mid.y} ${to.x} ${to.y}`} fill="none" stroke="currentColor" stroke-width="3.4" stroke-dasharray="7 6" stroke-linecap="round" marker-end="url(#ghost-head)" />
            <text x={mid.x} y={mid.y - 6} text-anchor="middle" class="intent-label">{i.label}</text>
          </g>
        {/each}
        {#each intentOffers as i (i.id)}
          {@const from = layout.centres[world.realms[i.realm]!.capital]!}
          {@const to = layout.centres[world.realms[i.payload.target!]!.capital]!}
          <g class="ghost offer">
            <path d={`M${from.x} ${from.y} L${to.x} ${to.y}`} fill="none" stroke={realmColor(i.payload.target!) ?? ink} stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round" />
            <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} text-anchor="middle" class="intent-label">✉ {i.label}</text>
          </g>
        {/each}
        {#each intentWorks as i (i.id)}
          {@const c = layout.centres[i.payload.province!]!}
          <g class="ghost work">
            <circle cx={c.x} cy={c.y - HEX * 0.9} r="11" fill="rgba(255,255,255,0.85)" stroke={ink} stroke-width="1.2" stroke-dasharray="3 2" />
            <text x={c.x} y={c.y - HEX * 0.9 + 5} text-anchor="middle" class="work-glyph">{i.kind === "build" ? "⚒" : "⚑"}</text>
            <text x={c.x} y={c.y - HEX * 1.6} text-anchor="middle" class="intent-label">{i.label}</text>
          </g>
        {/each}
      </g>

      <!-- labels and tokens -->
      {#each shapes as { shape, province } (shape.id)}
        {@const armies = armiesByProvince.get(shape.id) ?? []}
        {@const besieged = armies.some((a) => a.besieging)}
        <g pointer-events="none">
          {#if besieged}
            <!-- a ring of tents around the walls -->
            <g class="siege-camp">
              {#each [0, 1, 2, 3, 4, 5] as t (t)}
                {@const angle = (t / 6) * Math.PI * 2}
                {@const tx = shape.centre.x + Math.cos(angle) * HEX * 1.25}
                {@const ty = shape.centre.y + Math.sin(angle) * HEX * 1.25}
                <path d={`M${tx - 5} ${ty + 4} L${tx} ${ty - 5} L${tx + 5} ${ty + 4} z`} fill="#e8ded0" stroke="#3a2c16" stroke-width="0.8" />
              {/each}
            </g>
          {/if}
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
            <g class="army" class:enemy={army.realm !== province.owner} class:named={hoverArmy === army.id} filter="url(#shadow)" pointer-events="all" role="presentation" onmouseenter={() => (hoverArmy = army.id)} onmouseleave={() => (hoverArmy = null)}>
              <path d={`M${cx - 9},${cy - 10} h18 v12 q0 7 -9 10 q-9 -3 -9 -10 z`} fill={realmColor(army.realm) ?? "#555"} stroke={dark ? "#111" : "#fff"} stroke-width="1.2" />
              <path d={`M${cx - 9},${cy - 10} h18 v3 h-18 z`} fill="#fff" fill-opacity="0.35" />
              <text x={cx} y={cy + 4} text-anchor="middle" class="count">{army.companies}</text>
              {#if army.besieging}
                <text x={cx + 10} y={cy - 9} class="siege">⚔</text>
              {/if}
              <!-- the pennant: a little banner in the crest colour, with the name -->
              <g class="pennant">
                <path d={`M${cx + 8} ${cy - 11} v-12 h22 l-5 4 l5 4 h-22`} fill={realmColor(army.realm) ?? "#555"} stroke={dark ? "#111" : "#fff"} stroke-width="0.9" />
                <text x={cx + 8} y={cy - 26} class="banner">{army.name}</text>
              </g>
            </g>
          {/each}
        </g>
      {/each}

      <!-- effects of the season just passed, sequenced beat by beat -->
      <g class="effects" pointer-events="none">
        {#if beat === null || beat === "marches" || beat === "clashes" || beat === "captures" || beat === "harvest"}
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
        {/if}
        {#if beat === null || beat === "clashes" || beat === "captures" || beat === "harvest"}
          {#each battles as b (b.seq)}
            {@const c = layout.centres[b.province!]!}
            <circle cx={c.x} cy={c.y} r="10" class="clash" />
            <text x={c.x} y={c.y + 5} text-anchor="middle" class="clash-glyph">⚔</text>
          {/each}
        {/if}
        {#if beat === null || beat === "captures" || beat === "harvest"}
          {#each captures as cap (cap.seq)}
            {@const c = layout.centres[cap.province!]!}
            <circle cx={c.x} cy={c.y} r="10" class="ripple" stroke={realmColor(world.provinces[cap.province!]!.owner) ?? ink} />
          {/each}
        {/if}
      </g>
      {#if beat === "harvest"}
        <path class="harvest-wash" d={layout.land} fill-rule="evenodd" />
      {/if}
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

  {#if beat !== null}
    <button class="caption-strip" onclick={() => onSkip?.()} title="Click to skip">
      <span class="beat">{beat === "marches" ? "The armies move" : beat === "clashes" ? "They meet" : beat === "captures" ? "The banners change" : "The harvest is counted"}</span>
      {#if caption}<span class="caption-text">{caption}</span>{/if}
      <span class="skip">skip ▸</span>
    </button>
  {/if}

  {#if hovered}
    <div class="tooltip">
      <strong>{hovered.name}</strong> — {world.realms[hovered.owner]?.name ?? (hovered.owner === "rebels" ? "rebels" : "free folk")}
      <br />{hovered.terrain}{hovered.coastal ? ", coastal" : ""} · {hovered.population.toFixed(1)}k people · dev {hovered.development} · unrest {Math.round(hovered.unrest)}
      {#if hovered.resources.length}<br />{hovered.resources.join(", ")}{/if}
      {#if hovered.claims.length}<br />claimed by {hovered.claims.map((c) => world.realms[c]?.name ?? c).join(", ")}{/if}
      {#if intentEdictProvinces.has(hovered.id)}<br /><em>staged: {intentEdictProvinces.get(hovered.id)}</em>{/if}
    </div>
  {/if}

  <div class="camera-controls">
    <button onclick={() => setZoom(zoom * 1.25)} title="Closer" aria-label="zoom in">＋</button>
    <button onclick={() => setZoom(zoom / 1.25)} title="Further off" aria-label="zoom out">－</button>
    <button onclick={resetCamera} title="The whole map" aria-label="fit the map">⌂</button>
  </div>

  <div class="legend">
    {#each Object.values(world.realms) as realm (realm.id)}
      {@const war = realm.id !== world.playerRealm && !realm.eliminated && atWar(world, world.playerRealm, realm.id)}
      {@const allied = realm.id !== world.playerRealm && !realm.eliminated && Boolean(treatyBetween(world, world.playerRealm, realm.id, "alliance"))}
      <span class="swatch" style={`--c:${realm.color}`} class:dead={realm.eliminated} class:war class:allied title={war ? `at war with ${realm.name}` : allied ? `allied with ${realm.name}` : realm.eliminated ? `${realm.name} is no more` : realm.name}>
        {realm.name}{#if war}<em>⚔</em>{:else if allied}<em>✦</em>{/if}
      </span>
    {/each}
    <span class="swatch" style="--c:#d9d3c1">free folk</span>
    <span class="swatch season-swatch">{["Spring", "Summer", "Autumn", "Winter"][season]}</span>
  </div>
</div>

<style>
  .map { position: relative; width: 100%; height: 100%; min-height: 320px; border-radius: 16px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2), 0 12px 40px rgba(0,0,0,0.18); font-family: "Georgia", "Iowan Old Style", "Times New Roman", serif; }
  .map.replay { outline: 3px solid #d8a63a; outline-offset: -3px; }
  svg { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
  svg.dragging { cursor: grabbing; }
  .camera.easing { transition: transform 650ms cubic-bezier(0.22, 0.61, 0.36, 1); }
  /* The season lies over the land as a wash and a filter. */
  .weather { pointer-events: none; transition: fill 1400ms ease, fill-opacity 1400ms ease; }
  .spring .weather { fill: #6fae4a; fill-opacity: 0.24; }
  .summer .weather { fill: #e8b53a; fill-opacity: 0.22; }
  .autumn .weather { fill: #a3541f; fill-opacity: 0.3; }
  .winter .weather { fill: #cfe3ee; fill-opacity: 0.38; }
  .spring .art { filter: hue-rotate(-8deg) saturate(1.15); }
  .autumn .art { filter: sepia(0.45); }
  .winter .art { opacity: 0.35; }
  .snow path { animation: settle 1400ms ease both; }
  @keyframes settle { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
  .province { cursor: pointer; outline: none; }
  .tint { transition: fill 1200ms ease, fill-opacity 600ms ease; }
  .province.hovered .tint { fill-opacity: 0.62; }
  .border { transition: stroke-width 200ms ease; }
  .dust { animation: dust 3s ease-in-out infinite; }
  @keyframes dust { 0%, 100% { fill-opacity: 0.12; } 50% { fill-opacity: 0.3; } }
  .edict-wash { animation: wash 2.4s ease-in-out infinite; }
  @keyframes wash { 0%, 100% { fill-opacity: 0.14; } 50% { fill-opacity: 0.34; } }
  .harvest-wash { fill: #d7a13a; pointer-events: none; animation: harvest 1400ms ease forwards; }
  @keyframes harvest { 0% { fill-opacity: 0; } 40% { fill-opacity: 0.4; } 100% { fill-opacity: 0.1; } }
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
  .siege-camp path { animation: settle 900ms ease both; }
  .army.enemy path:first-child { stroke-dasharray: 2 1.5; }
  .pennant { opacity: 0; transition: opacity 160ms ease; }
  .army.named .pennant { opacity: 1; }
  .banner { font-size: 9px; fill: #1e1608; paint-order: stroke; stroke: rgba(255,250,235,0.92); stroke-width: 3px; font-family: system-ui, sans-serif; }
  .dark .banner { fill: #f6efdc; stroke: rgba(20,18,12,0.9); }
  .intent-label { font-size: 9.5px; fill: #2b1d12; paint-order: stroke; stroke: rgba(255,250,235,0.9); stroke-width: 3px; font-family: system-ui, sans-serif; }
  .dark .intent-label { fill: #f6efdc; stroke: rgba(20,18,12,0.9); }
  .work-glyph { font-size: 12px; fill: #3a2c16; }
  .trade .thread { animation: flow 5s linear infinite; }
  .replay .trade .thread { animation: none; }
  @keyframes flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -120; } }
  .ghost { animation: breathe 2.6s ease-in-out infinite; }
  @keyframes breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.95; } }
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
  .caption-strip { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: baseline; gap: 12px; padding: 12px 18px; border: none; text-align: left; background: linear-gradient(0deg, rgba(12,9,4,0.92), rgba(12,9,4,0)); color: #f6eddb; font-family: "Georgia", serif; cursor: pointer; animation: rise 400ms ease; }
  @keyframes rise { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
  .caption-strip .beat { font-size: 1.05rem; letter-spacing: 1.5px; text-transform: uppercase; opacity: 0.75; flex: none; }
  .caption-strip .caption-text { font-size: 1rem; flex: 1; min-width: 0; }
  .caption-strip .skip { font-size: 0.75rem; opacity: 0.6; font-family: system-ui, sans-serif; flex: none; }
  .cinema svg { pointer-events: none; }
  .camera-controls { position: absolute; right: 12px; bottom: 12px; display: grid; gap: 4px; }
  .camera-controls button { width: 28px; height: 28px; border-radius: 7px; border: none; background: rgba(255,255,255,0.9); color: #222; cursor: pointer; font-size: 0.95rem; line-height: 1; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
  .dark .camera-controls button { background: rgba(0,0,0,0.65); color: #eee; }
  .legend { position: absolute; left: 12px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; font-family: system-ui, sans-serif; font-size: 11px; max-width: 70%; }
  .swatch { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 4px; border-radius: 999px; background: rgba(255,255,255,0.88); color: #222; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
  .swatch em { font-style: normal; font-size: 10px; margin-left: 2px; }
  .swatch.war { box-shadow: 0 0 0 1.5px #b3261e, 0 1px 3px rgba(0,0,0,0.25); }
  .swatch.war em { color: #b3261e; }
  .swatch.allied em { color: #2b7a3b; }
  .dark .swatch { background: rgba(0,0,0,0.6); color: #eee; }
  .swatch::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--c); border: 1px solid rgba(0,0,0,0.3); }
  .swatch.season-swatch::before { background: currentColor; opacity: 0.5; }
  .swatch.dead { opacity: 0.45; text-decoration: line-through; }
</style>
