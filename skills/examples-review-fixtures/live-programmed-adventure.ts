import { issuedObservation } from "./issued-observation.js";
import { isDeepStrictEqual } from "node:util";
import type {
  AdventureTransitionFrame,
  AdventureTransitionObservations,
  ExampleReview,
  LiveAdventureTransitionRequest,
} from "../examples-review/types.js";
import { adventureReadback, sceneDigest } from "./adventure-readback.js";
import { combineExampleFindings, exampleReference } from "./oracle.js";
import {
  readAdventureGame,
  type inspectAdventureOpening,
} from "./live-adventure.js";

export function programmedAdventureReference(
  request: LiveAdventureTransitionRequest,
  observed: AdventureTransitionObservations,
) {
  const {
    before,
    current,
    openingArtwork,
    replacementArtwork,
    covering,
    effectiveLight,
    repaint,
    reload,
  } = observed;
  const continuity = (kind: "time-advanced" | "same-place") =>
    exampleReference({
      kind: "adventure",
      goal: request.goal,
      review: { kind: "continuity", check: { kind }, before, after: current },
    });
  const artwork = (value: typeof openingArtwork) =>
    exampleReference({
      kind: "adventure",
      goal: request.goal,
      review: { kind: "artwork", current, artwork: value },
    });
  const covered =
    covering?.from === request.covering &&
    covering?.to === request.lamp &&
    effectiveLight === false;
  const reloaded =
    reload.asset === repaint.asset &&
    reload.location === repaint.location &&
    reload.tick === repaint.tick &&
    reload.narration === repaint.narration &&
    reload.light.includes("blocked by a covering");
  return combineExampleFindings([
    continuity("time-advanced"),
    continuity("same-place"),
    {
      decision:
        effectiveLight === null
          ? "not-observed"
          : covered
            ? "supported"
            : "contradicted",
      finding: "lamp-covering",
      evidenceIds: covering ? [current.id, covering.id] : [current.id],
    },
    artwork(openingArtwork),
    artwork(replacementArtwork),
    {
      decision: reloaded ? "supported" : "contradicted",
      finding: "persistent-rendered-covering",
      evidenceIds: [current.id, replacementArtwork.id, reload.id],
    },
  ]);
}

export function prepareProgrammedAdventure(
  journey: string,
  request: LiveAdventureTransitionRequest,
  before: Awaited<ReturnType<typeof inspectAdventureOpening>>,
  frames: Record<
    "before" | "after" | "repaint" | "reload",
    AdventureTransitionFrame
  >,
) {
  if (
    before.campaign !== "dead-letter-office" ||
    before.view.id !== `${journey}:before` ||
    !before.artwork ||
    before.view.tick !== 0 ||
    before.artwork.id !== frames.before.asset
  )
    throw new Error("An owned, painted Dead Letter Office opening is required");
  const openingArtwork = before.artwork;
  let observed: AdventureTransitionObservations | undefined;
  let settled = false;
  const observe = issuedObservation(async () => {
    const data = await readAdventureGame(journey);
    const current = adventureReadback(
      `${journey}:current`,
      data.view,
      data.world.tick,
      data.visual.signature,
    );
    const id = data.world.artwork[current.place]?.id;
    if (typeof id !== "string" || !data.visual.artworkSignature)
      throw new Error("The worker has not saved a replacement illustration");
    const light = data.view.entities.find(({ id }) => id === request.lamp)
      ?.components.effectiveLight;
    const link = data.world.relations.find(
      ({ from, to, kind }) =>
        from === request.covering && to === request.lamp && kind === "covers",
    );
    const narration = data.world.journal.slice().reverse().find(
      ({ kind }) => kind === "narration",
    )?.id;
    settled =
      data.world.campaign === before.campaign &&
      !data.pending &&
      !data.background.scene &&
      data.visual.fresh &&
      data.world.revision > before.revision &&
      narration === frames.reload.narration;
    observed = {
      before: before.view,
      current,
      openingArtwork,
      replacementArtwork: {
        id,
        place: current.place,
        signature: sceneDigest(data.visual.artworkSignature),
      },
      covering: link ? { id: link.id, from: link.from, to: link.to } : null,
      effectiveLight: typeof light === "boolean" ? light : null,
      repaint: frames.repaint,
      reload: { ...frames.reload, id: `${journey}:reloaded` },
    };
    return structuredClone(observed);
  });
  function verify(report: ExampleReview | null) {
    const expected = observed
      ? programmedAdventureReference(request, observed)
      : null;
    const checks = {
      settled,
      mutation:
        observed?.effectiveLight === false &&
        observed.covering !== null &&
        frames.before.light.includes("shining") &&
        frames.after.light.includes("blocked by a covering") &&
        frames.after.tick > frames.before.tick &&
        frames.after.narration !== frames.before.narration,
      browserMatches: Boolean(
        observed &&
        frames.after.tick === observed.current.tick &&
        frames.after.narration === frames.repaint.narration &&
        frames.repaint.tick === observed.current.tick &&
        frames.repaint.location === observed.current.place &&
        frames.repaint.asset === observed.replacementArtwork.id &&
        frames.repaint.asset !== frames.before.asset,
      ),
      exactClaims: isDeepStrictEqual(
        expected?.components.map(({ decision }) => decision),
        [
          "supported",
          "supported",
          "supported",
          "contradicted",
          "supported",
          "supported",
        ],
      ),
      exactReport: expected !== null && isDeepStrictEqual(report, expected),
    };
    return {
      passed: Object.values(checks).every(Boolean),
      journey,
      observed,
      frames,
      checks,
      expected,
    };
  }
  return { services: { adventureTransitionRead: { observe } }, verify };
}
