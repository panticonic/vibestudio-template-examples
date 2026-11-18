import { describe, expect, it } from "vitest";
import observations from "./observations.json" with { type: "json" };
import { captureExampleObservations } from "./capture.js";
import { exampleReference, verifyExampleWorld } from "./oracle.js";
import { exampleWorlds } from "./worlds.js";

describe("Examples template Natlang task bank", () => {
  it("replays original campaign, garden and realm engine readbacks", () => {
    expect(captureExampleObservations()).toEqual(observations);
  });

  it.each(exampleWorlds)(
    "$id verifies its authored evidence and rejects a wrong answer",
    (world) => {
      const report = exampleReference(world.request);
      expect(report).toEqual(world.expected);
      expect(verifyExampleWorld(world, report).passed).toBe(true);
      expect(
        verifyExampleWorld(world, {
          ...report,
          evidenceIds: ["unrelated-readback"],
        }).passed,
      ).toBe(false);
      expect(
        verifyExampleWorld(world, {
          ...report,
          decision:
            report.decision === "supported" ? "contradicted" : "supported",
        }).passed,
      ).toBe(false);
    },
  );

  it("cites equivalent renamed observations and rejects their original evidence ids", () => {
    const original = exampleWorlds.find(
      ({ id }) => id === "examples-post-reading-free",
    )!;
    const aliased = structuredClone(original);
    if (
      aliased.request.kind !== "adventure" ||
      aliased.request.review.kind !== "continuity"
    )
      throw new Error("missing continuity reference");
    const { before, after } = aliased.request.review;
    before.id = `alias-${before.id}`;
    after.id = `alias-${after.id}`;
    aliased.expected.evidenceIds = [before.id, after.id];
    expect(
      verifyExampleWorld(aliased, exampleReference(aliased.request)).passed,
    ).toBe(true);
    expect(
      verifyExampleWorld(aliased, exampleReference(original.request)).passed,
    ).toBe(false);
  });

  it("keeps distinct identities across each authored bank entry", () => {
    const ids = exampleWorlds.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(exampleWorlds.map(({ request }) => request.goal)).size).toBe(
      ids.length,
    );
  });
});
