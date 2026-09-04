/**
 * The valley, drawn as terrain on paper that has come alive.
 *
 * A drop-in for the plain Valley: every region is a patch of ground with its
 * own texture (tree stipple for the orchard, hatched slopes for the ridge,
 * stone for the mine, reeds for the marsh) and a live thumbnail of its water,
 * growth, rot and light from the world's coarse picture. The river is a
 * ribbon with banks; the wall is stones; the hearth glows across the manor
 * at night; the hour turns the paper gold at dawn on the ridge and dusk on
 * the western cards. What is wrong is drawn wrong. Awake spirits say what
 * they want beside the place they are bound to, and golems stand where they
 * stand.
 */
import type {
  Overview,
  RegionId,
  RegionSummary,
  SpiritId,
} from "@workspace/grimoire-engine";
import {
  VALLEY_LAYOUT,
  VALLEY_W,
  VALLEY_H,
  WALL_Y,
  RIVER_PATH,
  LEY_LINES,
  HEARTH_XY,
  placed,
} from "./lib/layout.js";
import { SPIRIT_INK, type Palette } from "./lib/palette.js";
import "./enhancements.css";

type Texture =
  | "trees"
  | "beds"
  | "slopes"
  | "stone"
  | "reeds"
  | "water"
  | "roof"
  | "grass"
  | "moor"
  | "graves"
  | "road"
  | "glass";
const TEXTURE: Record<RegionId, Texture> = {
  manor: "roof",
  garden: "beds",
  scriptorium: "roof",
  library: "roof",
  chapel: "roof",
  orchard: "trees",
  "cold-house": "glass",
  "hot-house": "glass",
  "night-house": "glass",
  "upper-reach": "water",
  mill: "roof",
  "lower-reach": "reeds",
  grate: "stone",
  "mine-upper": "stone",
  "mine-deep": "stone",
  "silver-seam": "stone",
  foundry: "roof",
  glassworks: "glass",
  "bell-tower": "roof",
  boneyard: "graves",
  ridge: "slopes",
  observatory: "roof",
  green: "grass",
  "near-moor": "moor",
  barrows: "graves",
  "far-fen": "moor",
  "road-out": "road",
};

function worst(r: RegionSummary): number {
  return r.ailments.reduce((m, a) => Math.max(m, a.severity), 0);
}
function note(r: RegionSummary): string {
  const a = [...r.ailments].sort((x, y) => y.severity - x.severity)[0];
  return a ? a.note : r.restored ? "well" : "quiet";
}
function has(r: RegionSummary, kind: string): boolean {
  return r.ailments.some((a) => a.kind === kind);
}

/** Live thumbnail: one small rect per coarse cell. */
function cells(
  r: RegionSummary,
  p: { x: number; y: number; w: number; h: number },
): Array<{
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  o: number;
}> {
  const t = r.thumb;
  if (!t || !t.w) return [];
  const cw = p.w / t.w,
    ch = p.h / t.h;
  const out: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    fill: string;
    o: number;
  }> = [];
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      const i = y * t.w + x;
      const water = t.water[i] ?? 0,
        rot = t.rot[i] ?? 0,
        growth = t.growth[i] ?? 0,
        light = t.light[i] ?? 0,
        heat = t.heat[i] ?? 0,
        stone = t.stone[i] ?? 0;
      let fill = "",
        o = 0;
      if (rot >= 1) {
        fill = "#6b4a8a";
        o = Math.min(0.8, 0.25 + rot * 0.12);
      } else if (water >= 2) {
        fill = "#4a7fa5";
        o = Math.min(0.75, 0.2 + water * 0.1);
      } else if (heat >= 4) {
        fill = "#d7642c";
        o = Math.min(0.6, 0.15 + heat * 0.06);
      } else if (growth >= 1.5) {
        fill = "#5f8f5a";
        o = Math.min(0.55, 0.1 + growth * 0.09);
      } else if (stone >= 6) {
        fill = "#6b6a66";
        o = 0.35;
      } else if (light <= 0.5) {
        fill = "#1d2233";
        o = 0.28;
      } else continue;
      out.push({
        x: p.x + x * cw,
        y: p.y + y * ch,
        w: cw + 0.3,
        h: ch + 0.3,
        fill,
        o,
      });
    }
  return out;
}

export function HeroValley({
  overview,
  palette,
  onEnter,
  onSpirit,
}: {
  overview: Overview;
  palette: Palette;
  onEnter: (id: RegionId) => void;
  onSpirit?: (id: SpiritId) => void;
}) {
  const byId = new Map(overview.regions.map((r) => [r.id, r]));
  const lit = overview.firstHour.hearthLit;
  const night = palette.night;
  const hour = overview.sky.hour;
  const dawn = hour >= 5 && hour <= 8 ? 1 - Math.abs(hour - 6.5) / 2 : 0;
  const dusk = hour >= 17 && hour <= 20 ? 1 - Math.abs(hour - 18.5) / 2 : 0;
  const storm =
    overview.sky.weather === "storm" || overview.sky.weather === "rain";
  const spiritsOnMap = overview.spirits
    .filter((s) => s.awake && s.id !== "moor" && placed(s.anchor.region))
    .map((s) => {
      const p = placed(s.anchor.region)!;
      const r = byId.get(s.anchor.region);
      const ax =
        p.x +
        Math.min(p.w - 8, (s.anchor.x / Math.max(1, (r?.w ?? 1) - 1)) * p.w);
      const ay =
        p.y +
        Math.min(p.h - 6, (s.anchor.y / Math.max(1, (r?.h ?? 1) - 1)) * p.h);
      return {
        ...s,
        ax,
        ay,
        ink: SPIRIT_INK[s.id as SpiritId] ?? {
          colour: palette.accent,
          ornament: "✦",
        },
      };
    });
  const golemsOnMap = (overview.golems ?? [])
    .filter((g) => placed(g.region))
    .map((g) => {
      const p = placed(g.region)!;
      const r = byId.get(g.region);
      return {
        ...g,
        gx: p.x + 6 + (g.x / Math.max(1, r?.w ?? 1)) * (p.w - 12),
        gy: p.y + 6 + (g.y / Math.max(1, r?.h ?? 1)) * (p.h - 12),
      };
    });
  const ink = palette.ink;
  return (
    <div
      className="g-valley g-hero-valley"
      style={{ ["--night" as string]: night }}
    >
      <svg
        viewBox={`0 0 ${VALLEY_W} ${VALLEY_H}`}
        className="hv-map"
        role="img"
        aria-label="Map of the valley"
      >
        <defs>
          <filter id="hv-paper">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="3"
              seed="7"
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0.09" />
            </feComponentTransfer>
          </filter>
          <filter id="hv-ink-edge" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.08"
              numOctaves="2"
              result="t"
              seed="3"
            />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="2.2" />
          </filter>
          <filter id="hv-bleed" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.05"
              numOctaves="2"
              result="t"
            />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="7" />
          </filter>
          <filter id="hv-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id="hv-hearth-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb347" stopOpacity="0.75" />
            <stop offset="45%" stopColor="#e8a24a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#e8a24a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hv-dawn" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd27a" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#ffd27a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hv-dusk" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c8401f" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#6b4a8a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1d2233" stopOpacity="0" />
          </linearGradient>
          <pattern
            id="hv-tx-trees"
            width="14"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="4" cy="5" r="3" fill={ink} opacity="0.16" />
            <circle cx="11" cy="9" r="2.4" fill={ink} opacity="0.13" />
            <path d="M4 8v3M11 11v1" stroke={ink} strokeOpacity="0.3" />
          </pattern>
          <pattern
            id="hv-tx-beds"
            width="12"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 4h12"
              stroke={ink}
              strokeOpacity="0.16"
              strokeDasharray="3 2"
            />
          </pattern>
          <pattern
            id="hv-tx-slopes"
            width="16"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 10 L8 2 L16 10"
              fill="none"
              stroke={ink}
              strokeOpacity="0.22"
            />
          </pattern>
          <pattern
            id="hv-tx-stone"
            width="12"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <rect
              x="1"
              y="1"
              width="6"
              height="4"
              rx="1"
              fill="none"
              stroke={ink}
              strokeOpacity="0.22"
            />
            <rect
              x="6"
              y="5"
              width="5"
              height="4"
              rx="1"
              fill="none"
              stroke={ink}
              strokeOpacity="0.18"
            />
          </pattern>
          <pattern
            id="hv-tx-reeds"
            width="10"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M2 12v-8M5 12v-10M8 12v-7"
              stroke="#5f8f5a"
              strokeOpacity="0.35"
            />
          </pattern>
          <pattern
            id="hv-tx-water"
            width="16"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 4q4-3 8 0t8 0"
              fill="none"
              stroke="#4a7fa5"
              strokeOpacity="0.35"
            />
          </pattern>
          <pattern
            id="hv-tx-roof"
            width="10"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 6 L5 1 L10 6"
              fill="none"
              stroke={ink}
              strokeOpacity="0.14"
            />
          </pattern>
          <pattern
            id="hv-tx-grass"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <path d="M2 6l1-3M5 7l1-3" stroke="#5f8f5a" strokeOpacity="0.35" />
          </pattern>
          <pattern
            id="hv-tx-moor"
            width="14"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M1 8q3-4 6 0M8 5q3-4 5 0"
              fill="none"
              stroke="#6b4a8a"
              strokeOpacity="0.3"
            />
          </pattern>
          <pattern
            id="hv-tx-graves"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <rect
              x="4"
              y="3"
              width="4"
              height="7"
              rx="2"
              fill="none"
              stroke={ink}
              strokeOpacity="0.22"
            />
          </pattern>
          <pattern
            id="hv-tx-road"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M5 0v10"
              stroke={ink}
              strokeOpacity="0.2"
              strokeDasharray="3 3"
            />
          </pattern>
          <pattern
            id="hv-tx-glass"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 0h8v8H0z"
              fill="none"
              stroke="#7fb2c9"
              strokeOpacity="0.3"
            />
          </pattern>
        </defs>
        <rect width={VALLEY_W} height={VALLEY_H} fill={palette.paper} />
        <rect
          width={VALLEY_W}
          height={VALLEY_H}
          filter="url(#hv-paper)"
          opacity="0.9"
        />
        <rect
          x="0"
          y="0"
          width={VALLEY_W}
          height="120"
          fill={ink}
          opacity="0.04"
        />
        <rect
          x="0"
          y={WALL_Y}
          width={VALLEY_W}
          height={VALLEY_H - WALL_Y}
          fill="#6b4a8a"
          opacity={0.05 + overview.moor.pressure * 0.004}
        />
        {LEY_LINES.map((d, i) => (
          <path
            key={d}
            d={d}
            className={`hv-ley${i === 2 && !byId.get("ridge")?.restored ? " bent" : ""}`}
            stroke={palette.accent}
          />
        ))}
        <path d={RIVER_PATH} className="hv-bank" stroke={ink} />
        <path
          d={RIVER_PATH}
          className={`hv-river${byId.get("mill")?.restored ? " sings" : ""}`}
          stroke="#4a7fa5"
        />
        <path d={RIVER_PATH} className="hv-river-light" stroke="#cfe4f2" />
        {Array.from({ length: 62 }).map((_, i) => (
          <rect
            key={i}
            x={20 + i * 12}
            y={WALL_Y - 4 + (i % 2) * 2}
            width="10"
            height="7"
            rx="1.5"
            fill={ink}
            opacity={i > 30 && i < 34 ? 0.12 : 0.42}
          />
        ))}
        <text x="24" y={WALL_Y - 9} className="hv-tiny" fill={palette.faint}>
          Ilvane's wall
        </text>
        <text x="392" y={WALL_Y - 9} className="hv-tiny" fill={palette.faint}>
          the gate
        </text>
        {VALLEY_LAYOUT.map((p) => {
          const r = byId.get(p.id);
          if (!r) return null;
          return (
            <g
              key={p.id}
              className={`hv-region${worst(r) > 0 ? " ailing" : ""}${r.restored ? " restored" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onEnter(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onEnter(p.id);
              }}
            >
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx="7"
                fill={palette.paper}
                stroke={ink}
                strokeOpacity="0.7"
                strokeWidth="1.2"
                filter="url(#hv-ink-edge)"
              />
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx="7"
                fill={`url(#hv-tx-${TEXTURE[p.id]})`}
              />
              <g
                className="hv-thumb"
                filter={has(r, "rot") ? "url(#hv-bleed)" : undefined}
              >
                {cells(r, p).map((c, i) => (
                  <rect
                    key={i}
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    fill={c.fill}
                    opacity={c.o}
                  />
                ))}
              </g>
              {has(r, "flooded") &&
                [0, 1, 2].map((k) => (
                  <path
                    key={k}
                    d={`M ${p.x + 8 + k * 18} ${p.y + p.h - 12 - k * 7} q 6 -4 12 0 t 12 0 t 12 0 t 12 0`}
                    className="hv-ripple"
                    style={{ animationDelay: `${k * 0.6}s` }}
                    stroke="#4a7fa5"
                  />
                ))}
              {has(r, "still") && (
                <text
                  x={p.x + p.w / 2}
                  y={p.y + p.h / 2 + 8}
                  textAnchor="middle"
                  className="hv-still"
                  fill={ink}
                >
                  ⊘
                </text>
              )}
              {has(r, "stale-ward") && (
                <text
                  x={p.x + p.w - 12}
                  y={p.y + 16}
                  className="hv-sigil"
                  fill={ink}
                >
                  ◌
                </text>
              )}
              {has(r, "locked") && (
                <text
                  x={p.x + p.w - 12}
                  y={p.y + 16}
                  className="hv-locked"
                  fill={ink}
                >
                  ⚿
                </text>
              )}
              {has(r, "vermin") &&
                [0, 1, 2, 3].map((k) => (
                  <circle
                    key={k}
                    cx={p.x + 20 + k * 17}
                    cy={p.y + p.h - 14 + (k % 2) * 4}
                    r="1.6"
                    fill={ink}
                    className="hv-vermin"
                    style={{ animationDelay: `${k * 0.35}s` }}
                  />
                ))}
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height="18"
                rx="7"
                fill={palette.paper}
                opacity="0.55"
              />
              <text x={p.x + 8} y={p.y + 13} className="hv-label" fill={ink}>
                {p.label}
              </text>
              <text
                x={p.x + 8}
                y={p.y + p.h - 6}
                className="hv-note"
                fill={palette.faint}
              >
                {note(r)}
              </text>
              {r.wards > 0 && (
                <text
                  x={p.x + p.w - 8}
                  y={p.y + p.h - 6}
                  textAnchor="end"
                  className="hv-tiny"
                  fill={palette.faint}
                >
                  {r.wards} ward{r.wards === 1 ? "" : "s"}
                </text>
              )}
              {r.apprentices.map((a, i) => (
                <circle
                  key={a}
                  cx={p.x + p.w - 10 - i * 10}
                  cy={p.y + 9}
                  r="3.2"
                  fill={palette.accent}
                  stroke={palette.paper}
                />
              ))}
            </g>
          );
        })}
        {golemsOnMap.map((g) => (
          <g
            key={g.name}
            className={`hv-golem${g.mode === "stale" ? " stale" : ""}${g.mode === "charter" ? " chartered" : ""}`}
          >
            <rect
              x={g.gx - 2.5}
              y={g.gy - 5}
              width="5"
              height="9"
              rx="1"
              fill={
                g.body === "wood"
                  ? "#8a6a3a"
                  : g.body === "bone"
                    ? "#d9d2c3"
                    : "#6b6a66"
              }
              stroke={ink}
              strokeWidth="0.6"
            />
            <title>{`${g.name}: ${g.last || g.mode || "unbound"}`}</title>
            {g.mode === "charter" && (
              <text x={g.gx + 5} y={g.gy + 1} className="hv-tiny" fill={ink}>
                {g.name}
              </text>
            )}
          </g>
        ))}
        {spiritsOnMap.map((s) => (
          <g
            key={s.id}
            className="hv-want"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSpirit?.(s.id as SpiritId);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSpirit?.(s.id as SpiritId);
            }}
          >
            <circle
              cx={s.ax}
              cy={s.ay}
              r="7"
              fill={palette.paper}
              stroke={s.ink.colour}
              strokeWidth="1.2"
            />
            <text
              x={s.ax}
              y={s.ay + 3.5}
              textAnchor="middle"
              className="hv-ornament"
              fill={s.ink.colour}
            >
              {s.ink.ornament}
            </text>
            <text
              x={s.ax + 11}
              y={s.ay + 3.5}
              className="hv-want-line"
              fill={s.ink.colour}
              style={{ ["--paper" as string]: palette.paper }}
            >
              {s.unmet ? s.wants : "content"}
            </text>
          </g>
        ))}
        <g className={`hv-hearth${lit ? " lit" : ""}`}>
          <circle
            cx={HEARTH_XY.x}
            cy={HEARTH_XY.y}
            r={lit ? 70 + night * 60 : 0}
            fill="url(#hv-hearth-glow)"
            filter="url(#hv-soft)"
          />
          <circle
            cx={HEARTH_XY.x}
            cy={HEARTH_XY.y}
            r="4"
            fill={lit ? "#ffb347" : palette.faint}
          />
        </g>
        <rect
          width={VALLEY_W}
          height={VALLEY_H}
          fill="url(#hv-dawn)"
          opacity={dawn}
          pointerEvents="none"
        />
        <rect
          width={VALLEY_W}
          height={VALLEY_H}
          fill="url(#hv-dusk)"
          opacity={dusk}
          pointerEvents="none"
        />
        <rect
          width={VALLEY_W}
          height={VALLEY_H}
          fill="#1d2233"
          opacity={night * 0.42}
          pointerEvents="none"
        />
        {storm && (
          <rect
            width={VALLEY_W}
            height={VALLEY_H}
            fill="#3e4a5a"
            opacity="0.18"
            pointerEvents="none"
            className="hv-rain"
          />
        )}
        <text
          x={VALLEY_W - 12}
          y={VALLEY_H - 10}
          textAnchor="end"
          className="hv-tiny"
          fill={palette.faint}
        >
          {overview.estateName ?? "the estate"} · {palette.name}
        </text>
      </svg>
    </div>
  );
}
