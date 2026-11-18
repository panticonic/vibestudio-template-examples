import { workers } from "@workspace/runtime";
import { grimoireWorldRpcMethods } from "@workspace-workers/grimoire-world/contract";
import type {
  ExampleReview,
  ExampleDecision,
  GardenObservations,
  GardenReadback,
  LiveGardenClaim,
} from "../examples-review/types.js";
import { gardenReadback } from "./garden-readback.js";
import { exampleReference } from "./oracle.js";

export async function observeGarden(
  garden: string,
  stage: "before" | "current",
) {
  const owner = workers.durableObjectService(
    "examples.grimoire.v1",
    grimoireWorldRpcMethods,
    garden,
  );
  const view = await owner.call("getGame");
  if (view.pending)
    throw new Error(
      "Finish the pending garden turn before reviewing committed evidence.",
    );
  return gardenReadback(`${garden}:${stage}`, view.garden);
}

export function prepareGardenReview(
  garden: string,
  before: GardenReadback,
  claims: LiveGardenClaim[],
  expectedDecisions: ExampleDecision[],
  visits: string[],
) {
  if (before.id !== `${garden}:before`)
    throw new Error("Garden baseline belongs to another session");
  let observed: GardenObservations | undefined;
  let readStarted = false;
  async function observe() {
    if (readStarted)
      throw new Error("Read the live garden once for the joint claim review");
    readStarted = true;
    observed = { before, current: await observeGarden(garden, "current") };
    return structuredClone(observed);
  }
  function expected() {
    if (!observed)
      throw new Error("A garden review needs the installed service readback");
    const { before, current } = observed;
    return exampleReference({
      kind: "composed",
      goal: "Check every garden claim",
      work: claims.map((claim) => ({
        kind: "garden",
        goal: "Qualify the assigned claim",
        review:
          claim.kind === "habitat"
            ? { ...claim, current }
            : { ...claim, before, after: current },
      })),
    });
  }
  function verify(report: ExampleReview | null) {
    const expectedReport = observed ? expected() : null;
    const same = (result: ExampleReview | undefined, wanted: ExampleReview) =>
      result?.decision === wanted.decision &&
      result.finding === wanted.finding &&
      JSON.stringify(result.evidenceIds) === JSON.stringify(wanted.evidenceIds);
    const checks = {
      persistedVisits: Boolean(
        observed &&
        observed.before.residents.length ===
          observed.current.residents.length &&
        visits.every((id) =>
          observed?.before.residents.some((resident) => resident.id === id),
        ) &&
        observed.before.residents.every((resident) => {
          const current = observed?.current.residents.find(
            ({ id }) => id === resident.id,
          );
          return (
            current &&
            (visits.includes(resident.id)
              ? current.lastVisit === observed?.current.day &&
                current.attachment > resident.attachment
              : current.lastVisit === resident.lastVisit &&
                current.attachment === resident.attachment)
          );
        }),
      ),
      assignedClaims:
        JSON.stringify(
          expectedReport?.components?.map(({ decision }) => decision),
        ) === JSON.stringify(expectedDecisions),
      readOwnedGarden: observed?.current.id === `${garden}:current`,
      matchedJudgment: Boolean(
        report && expectedReport && same(report, expectedReport),
      ),
      matchedClaims: Boolean(
        report?.components &&
        expectedReport?.components &&
        report.components.length === expectedReport.components.length &&
        expectedReport.components.every((wanted, index) =>
          same(report.components?.[index], wanted),
        ),
      ),
    };
    return {
      passed: Object.values(checks).every(Boolean),
      checks,
      garden,
      observed,
      expected: expectedReport,
    };
  }
  return { services: { gardenRead: { observe } }, expected, verify };
}
