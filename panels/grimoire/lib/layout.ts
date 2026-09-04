/**
 * Where each region sits on the valley overview (a 1000×700 drawing), laid
 * out after the design's map: ridge and cairns along the top, the manor at
 * the ley crossing, the river falling from the weir through the mill to the
 * marsh and out under the wall, the moor below.
 */
import type { RegionId } from "@workspace/grimoire-engine";

export interface Placed { id: RegionId; x: number; y: number; w: number; h: number; label: string }

export const VALLEY_W = 1000;
export const VALLEY_H = 700;

export const VALLEY_LAYOUT: Placed[] = [
  { id: "ridge", x: 30, y: 20, w: 560, h: 70, label: "ridge & cairns" },
  { id: "observatory", x: 760, y: 20, w: 150, h: 110, label: "observatory" },
  { id: "bell-tower", x: 30, y: 110, w: 70, h: 90, label: "bell tower" },
  { id: "upper-reach", x: 340, y: 110, w: 250, h: 60, label: "upper reach & weir" },
  { id: "manor", x: 120, y: 190, w: 200, h: 120, label: "manor & hearth" },
  { id: "garden", x: 330, y: 190, w: 100, h: 90, label: "kitchen garden" },
  { id: "scriptorium", x: 120, y: 320, w: 90, h: 50, label: "scriptorium" },
  { id: "mill", x: 460, y: 190, w: 110, h: 90, label: "mill" },
  { id: "glassworks", x: 590, y: 190, w: 100, h: 70, label: "glassworks" },
  { id: "foundry", x: 590, y: 280, w: 110, h: 80, label: "foundry" },
  { id: "library", x: 220, y: 320, w: 150, h: 90, label: "sunken library" },
  { id: "mine-upper", x: 720, y: 220, w: 130, h: 80, label: "mine: upper galleries" },
  { id: "mine-deep", x: 720, y: 320, w: 130, h: 80, label: "mine: the deep" },
  { id: "silver-seam", x: 870, y: 320, w: 100, h: 80, label: "silver seam" },
  { id: "chapel", x: 30, y: 420, w: 100, h: 80, label: "chapel of names" },
  { id: "orchard", x: 150, y: 420, w: 180, h: 110, label: "orchard" },
  { id: "cold-house", x: 350, y: 420, w: 90, h: 50, label: "cold house" },
  { id: "hot-house", x: 350, y: 480, w: 90, h: 50, label: "hot house" },
  { id: "night-house", x: 350, y: 540, w: 90, h: 50, label: "night house" },
  { id: "green", x: 460, y: 300, w: 110, h: 100, label: "the green" },
  { id: "boneyard", x: 30, y: 520, w: 100, h: 70, label: "boneyard" },
  { id: "lower-reach", x: 460, y: 420, w: 230, h: 110, label: "lower reach & marsh" },
  { id: "grate", x: 700, y: 470, w: 50, h: 50, label: "the grate" },
  { id: "near-moor", x: 30, y: 620, w: 500, h: 60, label: "near moor" },
  { id: "barrows", x: 560, y: 620, w: 200, h: 60, label: "the barrows" },
  { id: "far-fen", x: 780, y: 560, w: 190, h: 120, label: "the far fen" },
  { id: "road-out", x: 870, y: 440, w: 100, h: 90, label: "the road out" },
];

/** Ilvane's wall, drawn between the valley and the moor. */
export const WALL_Y = 606;

/** The river as a polyline through the layout, weir → mill → marsh → grate → under the wall. */
export const RIVER_PATH = "M 470 90 C 470 140, 480 150, 500 175 L 515 190 L 515 280 C 515 330, 540 380, 560 420 L 590 470 L 700 495 L 750 495 C 790 500, 800 560, 800 600 L 800 620";

/** The three ley lines. */
export const LEY_LINES = [
  "M 780 260 L 220 250 L 40 280",         // mine → hearth → (west)
  "M 220 250 L 835 75",                   // hearth → observatory
  "M 80 460 L 300 60",                    // chapel → far cairn
];

export const HEARTH_XY = { x: 220, y: 250 };

export function placed(id: RegionId): Placed | undefined {
  return VALLEY_LAYOUT.find((p) => p.id === id);
}
