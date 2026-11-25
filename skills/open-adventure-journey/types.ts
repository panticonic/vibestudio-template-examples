export type SavedJourney = { id: string; title: string; label: string };
export type PlayerObject = {
  id: string;
  name: string;
  kind: "place" | "person" | "object";
  description: string;
  location: string | null;
  open: boolean | null;
  sealed: boolean | null;
  locked: boolean | null;
};
export type PlayerJourney = {
  save: SavedJourney;
  observation: string;
  place: PlayerObject;
  tick: number;
  revision: number;
  scene: { signature: string; artwork: "matched" | "stale" | "missing" };
  visible: PlayerObject[];
  inventory: PlayerObject[];
  exits: { label: string; destination: string }[];
  pending: { text: string; id: string } | null;
};
export type TurnProposal = { intent: "approach" | "inspect" | "bring" | "speak"; target: string };
export type TurnDecision = { kind: "preserve" | "withdraw" } | { kind: "stage" | "replace"; proposal: TurnProposal };
export type TurnReceipt = { status: "staged" | "withdrawn" | "stale" | "unavailable"; view: PlayerJourney };
export type JourneyEvidence = {
  topic: "place" | "exit" | "carried" | "visible" | "sealed" | "open" | "locked" | "contents" | "scene" | "same-place" | "same-time" | "same-scene";
  subject: string;
  verdict: "confirmed" | "refuted" | "unknown";
};
export type JourneyFocus = { selected: PlayerJourney; comparison: PlayerJourney[] } | null;
/** Requested player findings; native authority tokens stay on service views. */
export type JourneyFindings = { evidence: JourneyEvidence[] } | { disposition: "blocked"; reason: string };
