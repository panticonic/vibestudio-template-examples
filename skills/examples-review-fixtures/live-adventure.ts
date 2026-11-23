import { issuedObservation } from "./issued-observation.js";
import { isDeepStrictEqual } from "node:util";
import { workers } from "@workspace/runtime";
import type { ServiceView } from "@workspace/adventure-engine";
import { adventureWorldRpcMethods } from "@workspace-workers/adventure-world/contract";
import type {
  AdventureObservations,
  ExampleDecision,
  ExampleReview,
  LiveAdventureRequest,
} from "../examples-review/types.js";
import { adventureReadback, sceneDigest } from "./adventure-readback.js";
import { exampleReference } from "./oracle.js";

function owner(journey: string) {
  if (!/^natlang-adventure-[0-9a-f-]{36}$/u.test(journey))
    throw new Error("Assign an owned Adventure journey");
  return workers.durableObjectService(
    "examples.adventure.v1",
    adventureWorldRpcMethods,
    journey,
  );
}

function opening(
  journey: string,
  stage: "before" | "current",
  data: ServiceView,
) {
  if (data.pending || data.seated || data.background.scene)
    throw new Error(
      "Review an unseated Adventure opening without pending work",
    );
  const view = adventureReadback(
    `${journey}:${stage}`,
    data.view,
    data.world.tick,
    data.visual.signature,
  );
  const id = data.world.artwork[view.place]?.id;
  if (id && !data.visual.artworkSignature)
    throw new Error("Stored artwork is missing its canonical scene signature");
  return {
    campaign: data.world.campaign,
    revision: data.world.revision,
    view,
    artwork:
      typeof id === "string" && data.visual.artworkSignature
        ? {
            id,
            place: view.place,
            signature: sceneDigest(data.visual.artworkSignature),
          }
        : null,
  };
}

export async function inspectAdventureOpening(journey: string) {
  return opening(journey, "before", await readAdventureGame(journey));
}

export function readAdventureGame(journey: string) {
  return owner(journey).call("getGame");
}

export function prepareAdventureReview(
  journey: string,
  before: Awaited<ReturnType<typeof inspectAdventureOpening>>,
  panel: {
    location: string;
    asset: string;
    tick: number;
  },
  world: {
    campaign: string;
    place: string;
    painted: boolean;
    request: LiveAdventureRequest;
    expected: ExampleDecision[];
  },
) {
  async function readCurrent() {
    return opening(journey, "current", await owner(journey).call("getGame"));
  }
  if (
    before.campaign !== world.campaign ||
    before.view.id !== `${journey}:before` ||
    before.view.place !== world.place ||
    before.view.tick !== 0
  )
    throw new Error("Adventure baseline does not match the assigned opening");
  let observation: ReturnType<typeof opening> | undefined;
  let observed: AdventureObservations | undefined;
  const observe = issuedObservation(async () => {
    observation = await readCurrent();
    observed = {
      before: before.view,
      current: observation.view,
      artwork: observation.artwork,
    };
    return structuredClone(observed);
  });
  function expected(): ExampleReview {
    if (!observed) throw new Error("Read the installed Adventure worker first");
    const { before, current, artwork } = observed;
    return exampleReference({
      kind: "composed",
      goal: world.request.goal,
      work: world.request.claims.map((claim) => ({
        kind: "adventure",
        goal: "Check the assigned Adventure claim",
        review:
          claim.kind === "continuity"
            ? { ...claim, before, after: current }
            : claim.kind === "artwork"
              ? { ...claim, current, artwork }
              : { ...claim, current },
      })),
    });
  }
  async function verify(report: ExampleReview | null) {
    const persisted = await readCurrent();
    const reference = observed ? expected() : null;
    const checks = {
      ownedOpening:
        observation?.campaign === world.campaign &&
        observation.revision === before.revision &&
        observation.view.place === world.place &&
        isDeepStrictEqual(observation.artwork, before.artwork) &&
        isDeepStrictEqual(observation.view, {
          ...before.view,
          id: `${journey}:current`,
        }),
      artwork:
        panel.location === world.place &&
        panel.tick === 0 &&
        (world.painted
          ? Boolean(
              observation?.artwork?.id === panel.asset &&
              observation.artwork.signature === observation.view.signature,
            )
          : panel.asset === "" && observation?.artwork === null),
      persisted: isDeepStrictEqual(persisted, observation),
      assignedClaims: isDeepStrictEqual(
        reference?.components?.map(({ decision }) => decision),
        world.expected,
      ),
      exactReport: reference !== null && isDeepStrictEqual(report, reference),
    };
    return {
      passed: Object.values(checks).every(Boolean),
      journey,
      campaign: world.campaign,
      checks,
      observed,
      panel,
      expected: reference,
    };
  }
  return {
    services: { adventureRead: { observe } },
    verify,
    async qualify() {
      await observe();
      const report = expected();
      return {
        verification: await verify(report),
        rejectedAlteredEvidence: !(
          await verify({
            ...report,
            evidenceIds: ["unassigned-journey"],
          })
        ).passed,
      };
    },
  };
}
