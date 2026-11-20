import { isDeepStrictEqual } from "node:util";
import type {
  ExampleDecision,
  ExampleReview,
  LivePortfolioRequest,
} from "../examples-review/types.js";
import type { prepareGardenReview } from "./live-garden.js";
import type { prepareRealmReview } from "./live-realm.js";
import { combineExampleFindings } from "./oracle.js";

export function preparePortfolioReview(
  request: LivePortfolioRequest,
  garden: ReturnType<typeof prepareGardenReview>,
  realm: ReturnType<typeof prepareRealmReview>,
  expectedDecisions: readonly ExampleDecision[],
) {
  if (
    !request.criteria.length ||
    request.criteria.some(
      ({ demo, claimIndex }) =>
        !Number.isInteger(claimIndex) ||
        claimIndex < 0 ||
        claimIndex >= request[demo].claims.length,
    )
  )
    throw new Error("Assign existing acceptance criteria in the game requests");
  const services = { ...garden.services, ...realm.services };

  function expected(
    gardenReport: ExampleReview,
    realmReport: ExampleReview,
  ): ExampleReview {
    const { components: gardenClaims } = gardenReport;
    const { components: realmClaims } = realmReport;
    if (!gardenClaims || !realmClaims)
      throw new Error("Review both live demos before deciding their readiness");
    const findings = { garden: gardenClaims, realm: realmClaims };
    const combined = combineExampleFindings(
      request.criteria.map(
        ({ demo, claimIndex }) => findings[demo][claimIndex]!,
      ),
    );
    return {
      ...combined,
      demos: {
        garden: { ...gardenReport, components: gardenClaims },
        realm: { ...realmReport, components: realmClaims },
      },
    };
  }

  async function verify(report: ExampleReview | null) {
    const gardenEvidence = garden.verify(report?.demos?.garden ?? null);
    const realmEvidence = await realm.verify(report?.demos?.realm ?? null);
    const reference =
      gardenEvidence.expected && realmEvidence.expected
        ? expected(gardenEvidence.expected, realmEvidence.expected)
        : null;
    const checks = {
      exactGarden: gardenEvidence.passed,
      exactRealm: realmEvidence.passed,
      scope:
        gardenEvidence.garden.slice("natlang-garden-".length) ===
        realmEvidence.realm.slice("natlang-realm-".length),
      assignedDecisions: isDeepStrictEqual(
        reference?.components?.map(({ decision }) => decision),
        expectedDecisions,
      ),
      exactReadiness:
        reference !== null && isDeepStrictEqual(report, reference),
    };
    return {
      passed: Object.values(checks).every(Boolean),
      request,
      checks,
      gardenEvidence,
      realmEvidence,
      expected: reference,
    };
  }

  return {
    services,
    verify,
    async qualify() {
      await services.gardenRead.observe();
      await services.realmRead.observe(request.realm.months);
      const report = expected(garden.expected(), realm.expected());
      const verification = await verify(report);
      const swapped = {
        ...report,
        components: [...report.components!].reverse(),
      };
      return {
        verification,
        rejectedAlteredEvidence: !(await verify(swapped)).passed,
      };
    },
  };
}
