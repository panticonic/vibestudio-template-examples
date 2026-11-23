import { issuedObservation } from "./issued-observation.js";
import { isDeepStrictEqual } from "node:util";
import { workers } from "@workspace/runtime";
import { regencyRealmRpcMethods } from "@workspace-workers/regency-realm/contract";
import type {
  ExampleDecision,
  ExampleReview,
  LiveRealmRequest,
  RealmObservations,
} from "../examples-review/types.js";
import { exampleReference } from "./oracle.js";
import { realmReadback } from "./realm-readback.js";

export function prepareRealmReview(
  realm: string,
  assignment: {
    request: LiveRealmRequest;
    expected: readonly ExampleDecision[];
    projectedTreasury: number;
  },
) {
  if (!/^natlang-realm-[0-9a-f-]{36}$/u.test(realm))
    throw new Error("Assign an owned realm");
  const owner = workers.durableObjectService(
    "examples.regency.v1",
    regencyRealmRpcMethods,
    realm,
  );
  const { request } = assignment;
  const read = () => owner.call("getGame");
  let before: Awaited<ReturnType<typeof read>> | undefined;
  let observed: RealmObservations | undefined;
  let exactBasis = false;
  const readObservation = issuedObservation(async () => {
    const months = request.months;
    before = await read();
    if (before.pending || before.painting || before.seated)
      throw new Error("The fixture needs a quiet Regency opening");
    const { basis, forecast } = await owner.call("previewSettlement", {
      months,
    });
    exactBasis = isDeepStrictEqual(basis, before.game.world);
    observed = {
      saved: realmReadback(`${realm}:saved`, basis),
      forecast: realmReadback(`${realm}:forecast:${months}`, forecast),
    };
    return structuredClone(observed);
  });
  async function observe(months: number) {
    if (months !== request.months) throw new Error("Use the assigned forecast horizon");
    return readObservation();
  }
  function expected() {
    if (!observed) throw new Error("Read the live realm first");
    const { saved, forecast } = observed;
    return exampleReference({
      kind: "composed",
      goal: request.goal,
      work: request.claims.map((claim) => ({
        kind: "realm",
        goal: "Check the assigned realm claim",
        review:
          claim.kind === "settlement"
            ? {
                kind: "settlement",
                check: claim.check,
                current: claim.source === "saved" ? saved : forecast,
              }
            : { ...claim, before: saved, after: forecast, basis: "forecast" },
      })),
    });
  }
  async function verify(report: ExampleReview | null) {
    const reference = observed ? expected() : null;
    const checks = {
      exactBasis,
      openingIntact: isDeepStrictEqual(await read(), before),
      exactForecast:
        observed?.saved.month === 0 &&
        observed.saved.treasury === 120 &&
        observed.forecast.month === request.months &&
        observed.forecast.treasury === assignment.projectedTreasury,
      assignedClaims: isDeepStrictEqual(
        reference?.components?.map(({ decision }) => decision),
        assignment.expected,
      ),
      exactReport: reference !== null && isDeepStrictEqual(report, reference),
    };
    return {
      passed: Object.values(checks).every(Boolean),
      realm,
      checks,
      observed,
      expected: reference,
    };
  }
  return {
    services: { realmRead: { observe } },
    expected,
    verify,
    async qualify() {
      let wrongHorizonDenied = false;
      try {
        await observe(request.months + 1);
      } catch (error) {
        wrongHorizonDenied =
          error instanceof Error &&
          error.message === "Use the assigned forecast horizon";
      }
      await observe(request.months);
      const report = expected();
      const verification = await verify(report);
      const changed = {
        ...report,
        evidenceIds: [`${realm}:different-horizon`],
      };
      return {
        verification,
        wrongHorizonDenied,
        rejectedAlteredEvidence: !(await verify(changed)).passed,
      };
    },
  };
}
