import type {
  AdventureCheck,
  ExampleDecision,
  ExampleReview,
  ExampleReviewRequest,
  GardenCheck,
  RealmCheck,
} from "../examples-review/types.js";
import type { ExampleWorld } from "./worlds.js";

function result(
  value: boolean | null,
  finding: string,
  ...evidenceIds: string[]
): ExampleReview {
  const decision: ExampleDecision =
    value === null ? "not-observed" : value ? "supported" : "contradicted";
  return { decision, finding, evidenceIds };
}

function adventure(review: AdventureCheck): ExampleReview {
  if (review.kind === "artwork") {
    const { current, artwork } = review;
    if (!artwork) return result(null, "illustration-missing", current.id);
    const ids = [current.id, artwork.id];
    if (current.place !== artwork.place)
      return result(false, "illustration-other-place", ...ids);
    if (current.signature !== artwork.signature)
      return result(false, "illustration-stale", ...ids);
    return result(true, "illustration-current", ...ids);
  }
  if (review.kind === "access") {
    const { check, current } = review;
    const entity = current.entities.find(({ id }) => id === check.target);
    switch (check.kind) {
      case "visible":
        return result(Boolean(entity), "visible-object", current.id);
      case "exit":
        return result(
          current.exits.includes(check.target),
          "available-exit",
          current.id,
        );
      case "carried":
        return result(
          current.inventory.includes(check.target),
          "carried-object",
          current.id,
        );
      case "open":
        return result(entity?.open ?? null, "container-open", current.id);
      case "unsealed":
        return result(
          entity?.sealed == null ? null : !entity.sealed,
          "document-unsealed",
          current.id,
        );
    }
  }
  const { check, before, after } = review;
  const ids = [before.id, after.id];
  switch (check.kind) {
    case "time-advanced":
      return result(after.tick > before.tick, "journey-time", ...ids);
    case "same-place":
      return result(after.place === before.place, "same-location", ...ids);
    case "moved-to":
      return result(
        after.place === check.target && before.place !== check.target,
        "destination-reached",
        ...ids,
      );
    case "still-carried":
      return result(
        before.inventory.includes(check.target) &&
          after.inventory.includes(check.target),
        "retained-inventory",
        ...ids,
      );
  }
}

function garden(review: GardenCheck): ExampleReview {
  if (review.kind === "habitat") {
    const { current, check } = review;
    const home = current.homes.find(({ id }) => id === check.home);
    const resident = current.residents.find(({ id }) => id === check.resident);
    if (check.kind === "meets-needs") {
      if (!home || !resident)
        return result(null, "habitat-comfort", current.id);
      const measurements = new Map(
        home.values.map(({ key, amount }) => [key, amount]),
      );
      const needsMet = resident.needs.map(({ key, amount }) => {
        const actual = measurements.get(key);
        return actual === undefined ? null : actual >= amount;
      });
      return result(
        needsMet.includes(false)
          ? false
          : needsMet.includes(null)
            ? null
            : true,
        "habitat-comfort",
        current.id,
      );
    }
    if (check.kind === "is-home")
      return result(
        home && resident ? resident.home === home.id : null,
        "chosen-home",
        current.id,
      );
    return result(
      home && resident
        ? resident.home === home.id && resident.settled > 0
        : null,
      "settled-resident",
      current.id,
    );
  }

  const { before, after, check } = review;
  const ids = [before.id, after.id];
  switch (check.kind) {
    case "day-advanced":
      return result(after.day > before.day, "garden-day", ...ids);
    case "phase-advanced":
      return result(
        after.day * 4 + after.phase > before.day * 4 + before.phase,
        "garden-phase",
        ...ids,
      );
    case "weather-changed":
      return result(after.weather !== before.weather, "garden-weather", ...ids);
    case "new-discovery": {
      const seen = new Set(before.discoveries.map(({ id }) => id));
      return result(
        after.discoveries.some(({ id }) => !seen.has(id)),
        "garden-discovery",
        ...ids,
      );
    }
    default: {
      const previous = before.residents.find(({ id }) => id === check.resident);
      const current = after.residents.find(({ id }) => id === check.resident);
      if (check.kind === "recognized")
        return result(
          previous && current
            ? previous.attachment < 0.3 && current.attachment >= 0.3
            : null,
          "resident-recognition",
          ...ids,
        );
      if (check.kind === "relocated")
        return result(
          previous && current ? previous.home !== current.home : null,
          "resident-relocation",
          ...ids,
        );
      return result(
        previous && current ? current.attachment > previous.attachment : null,
        "attachment-change",
        ...ids,
      );
    }
  }
}

function realm(review: RealmCheck): ExampleReview {
  if (review.kind === "settlement") {
    const { current, check } = review;
    const id = current.id;
    switch (check.kind) {
      case "has-debt":
        return result(current.debt > 0, "outstanding-debt", id);
      case "net-positive":
        return result(
          current.income > current.spending,
          "positive-settlement",
          id,
        );
      case "region-grain-at-least": {
        const row = current.regions.find(({ id }) => id === check.region);
        return result(
          row ? row.grain >= check.amount : null,
          "regional-reserves",
          id,
        );
      }
      default: {
        const route = current.routes.find(({ id }) => id === check.route);
        if (check.kind === "crossing-reopened")
          return result(
            route ? route.condition === 1 && route.workers === 0 : null,
            "crossing-open",
            id,
          );
        if (check.kind === "subsidy-paid-and-idle")
          return result(
            route?.cargo == null
              ? null
              : route.subsidy > 0 &&
                  current.serviceCost >= route.subsidy &&
                  route.cargo === 0,
            "paid-unused-capacity",
            id,
          );
        return result(
          route?.cargo == null || route.capacity == null
            ? null
            : route.cargo <= route.capacity,
          "route-bounded-cargo",
          id,
        );
      }
    }
  }

  const { before, after, check } = review;
  const ids = [before.id, after.id];
  if (review.assertCommitted && review.basis === "forecast")
    return result(null, "forecast-not-committed", ...ids);
  switch (check.kind) {
    case "treasury-grew":
      return result(
        after.treasury > before.treasury,
        "treasury-change",
        ...ids,
      );
    case "border-tension-grew":
      return result(
        before.borderTension === null || after.borderTension === null
          ? null
          : after.borderTension > before.borderTension,
        "border-tension-change",
        ...ids,
      );
    case "route-works-progressed": {
      const previous = before.routes.find(({ id }) => id === check.route);
      const current = after.routes.find(({ id }) => id === check.route);
      return result(
        previous && current ? current.progress > previous.progress : null,
        "works-progress",
        ...ids,
      );
    }
    default: {
      const previous = before.regions.find(({ id }) => id === check.region);
      const current = after.regions.find(({ id }) => id === check.region);
      if (check.kind === "regional-grain-grew")
        return result(
          previous && current ? current.grain > previous.grain : null,
          "reserve-change",
          ...ids,
        );
      return result(
        previous && current ? current.population < previous.population : null,
        "population-change",
        ...ids,
      );
    }
  }
}

export function exampleReference(request: ExampleReviewRequest): ExampleReview {
  switch (request.kind) {
    case "adventure":
      return adventure(request.review);
    case "garden":
      return garden(request.review);
    case "realm":
      return realm(request.review);
    case "composed": {
      const components = request.work.map(exampleReference);
      const evidenceIds = [
        ...new Set(components.flatMap((item) => item.evidenceIds)),
      ];
      const ruledOut = components.some(
        (item) => item.decision === "contradicted",
      );
      const incomplete = components.some(
        (item) => item.decision === "not-observed",
      );
      return {
        ...(ruledOut
          ? result(false, "criteria-contradicted", ...evidenceIds)
          : incomplete || components.length === 0
            ? result(null, "criteria-unobserved", ...evidenceIds)
            : result(true, "all-criteria-supported", ...evidenceIds)),
        components,
      };
    }
  }
}

export function verifyExampleWorld(world: ExampleWorld, report: ExampleReview) {
  const expected = world.expected;
  const sameFinding = (left: ExampleReview, right: ExampleReview) =>
    left.decision === right.decision &&
    left.finding === right.finding &&
    left.evidenceIds.length === right.evidenceIds.length &&
    left.evidenceIds.every((id, index) => id === right.evidenceIds[index]);
  const checks = {
    decision: report.decision === expected.decision,
    finding: report.finding === expected.finding,
    evidence:
      report.evidenceIds.length === expected.evidenceIds.length &&
      report.evidenceIds.every(
        (id, index) => id === expected.evidenceIds[index],
      ),
    components:
      expected.components === undefined
        ? report.components === undefined
        : report.components?.length === expected.components.length &&
          expected.components.every((item, index) =>
            sameFinding(item, report.components![index]!),
          ) === true,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}
