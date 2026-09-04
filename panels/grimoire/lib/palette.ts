/**
 * The valley's palette: a limited set of inks shifting with season and hour.
 * Spring greens and wet greys; summer gold; autumn rust and the Moor's
 * violet; winter blue-white with the hearth's orange the only warm thing.
 */
import type { Layer, Season, SpiritId } from "@workspace/grimoire-engine";

export interface Palette {
  paper: string;
  ink: string;
  faint: string;
  wash: string;
  accent: string;
  night: number; // 0..1 how dark the hour is
  name: string;
}

const SEASON_INK: Record<Season, { paper: string; ink: string; wash: string; accent: string; name: string }> = {
  spring: { paper: "#f3f0e4", ink: "#2c3a2e", wash: "#9fb59a", accent: "#5f8f5a", name: "spring" },
  summer: { paper: "#f7efd8", ink: "#3a2f1a", wash: "#d9b95a", accent: "#c08a2a", name: "summer" },
  autumn: { paper: "#f2e6d4", ink: "#3d2418", wash: "#b8653a", accent: "#8d4b6b", name: "autumn" },
  winter: { paper: "#eef1f5", ink: "#243040", wash: "#b9c7d6", accent: "#d97a2a", name: "winter" },
};

/** Blend two hex colours. t in 0..1. */
export function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function hex(color: string): [number, number, number] {
  const s = color.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((ch) => ch + ch).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(color: string, alpha: number): string {
  const [r, g, b] = hex(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** How dark it is at an hour (0 = noon, 1 = midnight), softened for readability. */
export function nightness(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h <= 17) return 0;
  if (h > 17 && h < 21) return (h - 17) / 4 * 0.75;
  if (h >= 21 || h < 4) return 0.75;
  return (1 - (h - 4) / 3) * 0.75;
}

export function paletteFor(season: Season, hour: number, dark: boolean): Palette {
  const base = SEASON_INK[season];
  const night = nightness(hour);
  const paper = dark ? mix("#1c1a17", base.paper, 0.12) : mix(base.paper, "#2a2f45", night * 0.55);
  const ink = dark ? mix("#e9e2d2", base.paper, 0.2) : mix(base.ink, "#dfe4f0", night * 0.6);
  return {
    paper,
    ink,
    faint: rgba(ink, dark ? 0.32 : 0.28),
    wash: base.wash,
    accent: base.accent,
    night,
    name: base.name,
  };
}

export const LAYER_INK: Record<Layer, string> = {
  heat: "#d7642c",
  water: "#4d7fb6",
  stone: "#8a8378",
  growth: "#5f8f5a",
  air: "#a9b7c6",
  light: "#f1d77a",
  rot: "#6a3d78",
  ether: "#8f7bd6",
  steam: "#d5dde6",
  silt: "#b39a6b",
  ash: "#5e5a55",
  frost: "#bfe0f2",
  spore: "#8d5c96",
  silver: "#c9ccd1",
  glass: "#a8e0dd",
};

export const LAYER_LABEL: Record<Layer, string> = {
  heat: "heat", water: "water", stone: "stone", growth: "growth", air: "air", light: "light", rot: "rot", ether: "ether",
  steam: "steam", silt: "silt", ash: "ash", frost: "frost", spore: "spore", silver: "silver", glass: "glass",
};

export const SPECIES_INK: Record<string, string> = {
  grass: "#8fb573",
  apple: "#4f8a4b",
  reed: "#8a9a52",
  moonbloom: "#c9c2ea",
  firethorn: "#c0552e",
  lichen: "#7e8f78",
  "blight-cap": "#6a3d78",
};

export const SPIRIT_INK: Record<SpiritId | "moor", { colour: string; ornament: string }> = {
  hearth: { colour: "#d97a2a", ornament: "✦" },
  river: { colour: "#4d7fb6", ornament: "≈" },
  library: { colour: "#7a5c3a", ornament: "❧" },
  foundry: { colour: "#c0392b", ornament: "⚒" },
  mill: { colour: "#8a8378", ornament: "✱" },
  bell: { colour: "#b8862d", ornament: "♩" },
  glass: { colour: "#7fc4c0", ornament: "◇" },
  orchard: { colour: "#5f8f5a", ornament: "❀" },
  deep: { colour: "#3f4a5a", ornament: "▾" },
  boneyard: { colour: "#a39d93", ornament: "☗" },
  ridge: { colour: "#6f7f9a", ornament: "△" },
  moor: { colour: "#6a3d78", ornament: "✶" },
  echo: { colour: "#9b8ea0", ornament: "〰" },
};

export const MOON_GLYPHS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

export const WEATHER_LABEL: Record<string, string> = {
  clear: "clear", overcast: "overcast", rain: "rain", storm: "a storm", snow: "snow", fog: "fog", wind: "wind off the ridge",
};

export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "midnight";
  if (h < 5) return "the small hours";
  if (h < 7) return "before dawn";
  if (h === 7) return "dawn";
  if (h < 12) return "morning";
  if (h === 12) return "noon";
  if (h < 17) return "afternoon";
  if (h < 19) return "dusk";
  if (h < 22) return "evening";
  return "night";
}
