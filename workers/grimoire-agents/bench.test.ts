import { describe, expect, it } from "vitest";
import { BENCH, checkPromptAnchors, runBench } from "./bench.js";

describe("the familiar's bench", () => {
  it("keeps the ground under the familiar steady: gate, resonance, tier and intent for every reference verse", () => {
    const results = runBench(BENCH);
    const failed = results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.id}: ${r.notes.join("; ")}`)).toEqual([]);
  });

  it("keeps the familiar's voice anchors in the prompt", () => {
    expect(checkPromptAnchors()).toEqual([]);
  });
});
