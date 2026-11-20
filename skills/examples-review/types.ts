export type AdventureObject = {
  id: string;
  location: string | null;
  kind: string;
  open: boolean | null;
  sealed: boolean | null;
  locked: boolean | null;
};
export type AdventureView = {
  id: string;
  place: string;
  tick: number;
  entities: AdventureObject[];
  inventory: string[];
  exits: string[];
  signature: string;
};
export type ExistingArt = { id: string; place: string; signature: string };

export type AdventureAccessCheck =
  | { kind: "visible"; target: string }
  | { kind: "carried"; target: string }
  | { kind: "exit"; target: string }
  | { kind: "open"; target: string }
  | { kind: "unsealed"; target: string };
export type AdventureContinuityCheck =
  | { kind: "time-advanced" }
  | { kind: "same-place" }
  | { kind: "still-carried"; target: string }
  | { kind: "moved-to"; target: string };
export type AdventureCheck =
  | { kind: "access"; check: AdventureAccessCheck; current: AdventureView }
  | {
      kind: "continuity";
      check: AdventureContinuityCheck;
      before: AdventureView;
      after: AdventureView;
    }
  | { kind: "artwork"; current: AdventureView; artwork: ExistingArt | null };

export type GardenHome = {
  id: string;
  values: { key: string; amount: number }[];
};
export type GardenResident = {
  id: string;
  name: string;
  home: string;
  needs: { key: string; amount: number }[];
  energy: number;
  attachment: number;
  settled: number;
  lastVisit: number;
};
export type GardenReadback = {
  id: string;
  day: number;
  phase: number;
  weather: string;
  homes: GardenHome[];
  residents: GardenResident[];
  discoveries: { id: string; title: string }[];
};
export type HabitatCheck = {
  kind: "meets-needs" | "is-home" | "settled";
  resident: string;
  home: string;
};
export type GardenChangeCheck =
  | { kind: "recognized"; resident: string }
  | { kind: "attachment-grew"; resident: string }
  | { kind: "relocated"; resident: string }
  | { kind: "day-advanced" }
  | { kind: "phase-advanced" }
  | { kind: "weather-changed" }
  | { kind: "new-discovery" };
export type GardenCheck =
  | { kind: "habitat"; check: HabitatCheck; current: GardenReadback }
  | {
      kind: "transition";
      check: GardenChangeCheck;
      before: GardenReadback;
      after: GardenReadback;
    };

export type RealmRoute = {
  id: string;
  subsidy: number;
  condition: number;
  progress: number;
  workers: number;
  cargo: number | null;
  capacity: number | null;
};
export type RealmRegion = {
  id: string;
  grain: number;
  population: number;
  confidence: number;
};
export type RealmReadback = {
  id: string;
  month: number;
  treasury: number;
  debt: number;
  income: number;
  spending: number;
  serviceCost: number;
  worksCost: number;
  routes: RealmRoute[];
  regions: RealmRegion[];
  borderTension: number | null;
};
export type RealmCurrentCheck =
  | { kind: "subsidy-paid-and-idle"; route: string }
  | { kind: "cargo-under-capacity"; route: string }
  | { kind: "crossing-reopened"; route: string }
  | { kind: "has-debt" }
  | { kind: "net-positive" }
  | { kind: "region-grain-at-least"; region: string; amount: number };
export type RealmTrendCheck =
  | { kind: "route-works-progressed"; route: string }
  | { kind: "regional-grain-grew"; region: string }
  | { kind: "population-fell"; region: string }
  | { kind: "treasury-grew" }
  | { kind: "border-tension-grew" };
export type RealmCheck =
  | { kind: "settlement"; check: RealmCurrentCheck; current: RealmReadback }
  | {
      kind: "compare";
      check: RealmTrendCheck;
      before: RealmReadback;
      after: RealmReadback;
      basis: "observed" | "forecast";
      assertCommitted: boolean;
    };

export type ExampleReviewLeaf =
  | { kind: "adventure"; goal: string; review: AdventureCheck }
  | { kind: "garden"; goal: string; review: GardenCheck }
  | { kind: "realm"; goal: string; review: RealmCheck };
export type ExampleReviewRequest =
  | ExampleReviewLeaf
  | { kind: "composed"; goal: string; work: ExampleReviewLeaf[] };
export type ExampleDecision = "supported" | "contradicted" | "not-observed";
export type ExampleFinding = {
  decision: ExampleDecision;
  finding: string;
  evidenceIds: string[];
};
export type ExampleReview = ExampleFinding & {
  components?: ExampleFinding[];
  demos?: {
    garden: ExampleFinding & { components: ExampleFinding[] };
    realm: ExampleFinding & { components: ExampleFinding[] };
  };
};

export type LiveGardenClaim =
  | { kind: "habitat"; check: HabitatCheck }
  | { kind: "transition"; check: GardenChangeCheck };
export type LiveGardenRequest = {
  kind: "live-garden";
  goal: string;
  claims: LiveGardenClaim[];
};
export type LiveAdventureClaim =
  | { kind: "access"; check: AdventureAccessCheck }
  | { kind: "continuity"; check: AdventureContinuityCheck }
  | { kind: "artwork" };
export type AdventureObservations = {
  before: AdventureView;
  current: AdventureView;
  artwork: ExistingArt | null;
};
export type LiveAdventureRequest = {
  kind: "live-adventure";
  goal: string;
  claims: LiveAdventureClaim[];
};
export type AdventureTransitionFrame = {
  location: string;
  asset: string;
  tick: number;
  narration: string;
  light: string;
};
export type AdventureTransitionObservations = {
  before: AdventureView;
  current: AdventureView;
  openingArtwork: ExistingArt;
  replacementArtwork: ExistingArt;
  covering: { id: string; from: string; to: string } | null;
  effectiveLight: boolean | null;
  repaint: AdventureTransitionFrame;
  reload: AdventureTransitionFrame & { id: string };
};
export type LiveAdventureTransitionRequest = {
  kind: "live-adventure-transition";
  goal: string;
  covering: string;
  lamp: string;
};
export type LiveRealmClaim =
  | {
      kind: "settlement";
      source: "saved" | "forecast";
      check: RealmCurrentCheck;
    }
  | { kind: "compare"; check: RealmTrendCheck; assertCommitted: boolean };
export type LiveRealmRequest = {
  kind: "live-realm";
  goal: string;
  months: number;
  claims: LiveRealmClaim[];
};
export type RealmObservations = {
  saved: RealmReadback;
  forecast: RealmReadback;
};
export type DemoCriteria = { demo: "garden" | "realm"; claimIndex: number }[];
export type LivePortfolioRequest = {
  kind: "live-portfolio";
  goal: string;
  garden: LiveGardenRequest;
  realm: LiveRealmRequest;
  criteria: DemoCriteria;
};
export type ExampleWorkflowRequest =
  | ExampleReviewRequest
  | LiveGardenRequest
  | LiveAdventureRequest
  | LiveAdventureTransitionRequest
  | LiveRealmRequest
  | LivePortfolioRequest;
export type GardenObservations = {
  before: GardenReadback;
  current: GardenReadback;
};
