import type { GameState, RealmId } from "./types.js";

export type RegencySurface = "map" | "archive";
export type RegencySubject = {
  kind: "province" | "army" | "event" | "law" | "promise";
  id: string;
};

export interface RegencyProjectionLink {
  version: 1;
  game: "regency";
  instance: { gameKey: string };
  surface: RegencySurface;
  subject?: RegencySubject;
}

export type SeasonReadiness =
  | { state: "blocked_by_seals"; count: number }
  | { state: "ready_with_defaults"; count: number }
  | { state: "ready" }
  | { state: "waiting_for_courts"; courts: RealmId[] }
  | { state: "finished" };

export interface RegencyAttentionItem {
  key: string;
  urgency: "quiet" | "notice" | "urgent";
  title: string;
  explanation: string;
  /** The one move the Herald should recommend in plain language. */
  nextAction: string;
  /** At most two alternatives that preserve the Regent's choice. */
  alternatives?: string[];
  subject?: RegencySubject;
  cardKey?: string;
}

export function deriveSeasonReadiness(
  state: GameState,
  awaitingSeals: number,
  waitingFor: RealmId[],
): SeasonReadiness {
  if (state.phase === "finished") return { state: "finished" };
  if (state.phase === "closing")
    return { state: "waiting_for_courts", courts: waitingFor };
  if (awaitingSeals > 0)
    return { state: "blocked_by_seals", count: awaitingSeals };
  const undecided = state.crises.filter(
    (crisis) => crisis.chosen === null && crisis.season <= state.season,
  ).length;
  if (undecided > 0) return { state: "ready_with_defaults", count: undecided };
  return { state: "ready" };
}

export function deriveRegencyAttention(
  state: GameState,
  awaitingSeals: number,
  waitingFor: RealmId[],
): RegencyAttentionItem[] {
  const readiness = deriveSeasonReadiness(state, awaitingSeals, waitingFor);
  const items: RegencyAttentionItem[] = [];
  if (readiness.state === "blocked_by_seals")
    items.push({
      key: `seals:${state.season}:${readiness.count}`,
      urgency: "urgent",
      title: "Acts await the seal",
      explanation: `${readiness.count} act${readiness.count === 1 ? "" : "s"} must be sealed or vetoed before court closes.`,
      nextAction:
        "Review the first waiting act, ask for its forecast, then seal or veto it.",
      alternatives: ["Ask the Herald which waiting act is most urgent."],
    });
  if (readiness.state === "ready_with_defaults")
    items.push({
      key: `defaults:${state.season}:${readiness.count}`,
      urgency: "notice",
      title: "Court may close with defaults",
      explanation: `${readiness.count} undecided matter${readiness.count === 1 ? "" : "s"} will take the stated default.`,
      nextAction:
        "Decide the matter you care about most, or tell the Herald to close court and accept the defaults.",
    });
  if (readiness.state === "ready")
    items.push({
      key: `ready:${state.season}`,
      urgency: "quiet",
      title: "The court is ready",
      explanation: "The Regent may close the season when counsel is complete.",
      nextAction:
        "Tell the Herald to close the season when you are satisfied with the council's orders.",
      alternatives: ["Ask the council for one last forecast."],
    });
  if (readiness.state === "waiting_for_courts")
    items.push({
      key: `waiting:${state.season}:${readiness.courts.join(",")}`,
      urgency: "notice",
      title: "Other courts are still deliberating",
      explanation: `${readiness.courts.length} court${readiness.courts.length === 1 ? "" : "s"} remain. Waiting changes nothing; the Regent may explicitly proceed without them.`,
      nextAction:
        "Wait for the other courts, or explicitly choose “Proceed without them” at the Regent's desk.",
    });
  const crisis = state.crises.find((row) => row.chosen === null);
  if (crisis)
    items.push({
      key: `matter:${crisis.id}`,
      urgency: "notice",
      title: crisis.title,
      explanation: crisis.text,
      nextAction:
        "Ask the named adviser for counsel, then choose one of the matter's visible options.",
      alternatives: ["Ask the whole council to debate this matter."],
      cardKey: `matter:${crisis.id}`,
    });
  return items.slice(0, 4);
}
