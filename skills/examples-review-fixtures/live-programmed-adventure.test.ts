import { describe, expect, it, vi } from "vitest";
import type {
  AdventureTransitionObservations,
  LiveAdventureTransitionRequest,
} from "../examples-review/types.js";

vi.mock("@workspace/runtime", () => ({ workers: {} }));
import { programmedAdventureReference } from "./live-programmed-adventure.js";

const request: LiveAdventureTransitionRequest = {
  kind: "live-adventure-transition",
  goal: "Review the committed lamp change",
  covering: "oilskin-wrap",
  lamp: "harbour-lamp",
};
const frame = {
  location: "landing",
  asset: "replacement",
  tick: 1,
  narration: "turn-narration",
  light: "Light is blocked by a covering",
};
const view = { place: "landing", entities: [], inventory: [], exits: [] };
const observed: AdventureTransitionObservations = {
  before: { ...view, id: "before", tick: 0, signature: "lit" },
  current: { ...view, id: "current", tick: 1, signature: "covered" },
  openingArtwork: { id: "opening", place: "landing", signature: "lit" },
  replacementArtwork: {
    id: frame.asset,
    place: "landing",
    signature: "covered",
  },
  covering: { id: "cover", from: request.covering, to: request.lamp },
  effectiveLight: false,
  repaint: frame,
  reload: { ...frame, id: "reloaded" },
};
describe("reviewing the programmed Adventure transition", () => {
  it("joins changed scene, worker relation and reloaded panel without merging their evidence", () => {
    const report = programmedAdventureReference(request, observed);
    expect(
      report.components.map(({ decision, finding }) => [decision, finding]),
    ).toEqual([
      ["supported", "journey-time"],
      ["supported", "same-location"],
      ["supported", "lamp-covering"],
      ["contradicted", "illustration-stale"],
      ["supported", "illustration-current"],
      ["supported", "persistent-rendered-covering"],
    ]);
    expect(report.evidenceIds).toEqual([
      "before",
      "current",
      "cover",
      "opening",
      "replacement",
      "reloaded",
    ]);
  });
  it("rejects a different cover and a loaded old image after reload", () => {
    const report = programmedAdventureReference(request, {
      ...observed,
      covering: { ...observed.covering!, from: "canvas-cover" },
      reload: { ...observed.reload, asset: observed.openingArtwork.id },
    });
    expect(report.components[2]?.decision).toBe("contradicted");
    expect(report.components[5]?.decision).toBe("contradicted");
  });
});
