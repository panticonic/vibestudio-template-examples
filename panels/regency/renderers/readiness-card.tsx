import { useState } from "react";
import { buildPanelLink } from "@workspace/runtime";
import {
  CourtButton,
  CourtCard,
  CourtError,
  CourtLink,
  CourtTitle,
  Eyebrow,
  PillFrame,
  Row,
  Stack,
  Status,
  courtColours,
} from "./court-ui.js";
type Readiness = { state: string; count?: number; courts?: string[] };
type State = { gameKey?: string; season?: string; readiness?: Readiness };
const COPY: Record<string, [string, string]> = {
  blocked_by_seals: [
    "The seal is wanted",
    "Resolve every waiting act before court can close.",
  ],
  ready_with_defaults: [
    "Court may close",
    "Undecided matters will take their stated default.",
  ],
  ready: ["Counsel is complete", "The Regent may close the court."],
  waiting_for_courts: [
    "The gates remain open",
    "Other sovereigns have not yet withdrawn.",
  ],
  finished: ["The history is written", "This Regency has reached its end."],
};
const NEXT: Record<string, string> = {
  blocked_by_seals:
    "Open the first waiting act, ask for its forecast, then seal or veto it.",
  ready_with_defaults:
    "Choose any matter you care about—or close court and accept its stated default.",
  ready: "Ask for one last forecast, or tell the Herald to close the season.",
  waiting_for_courts:
    "Wait, or use the Regent's desk to explicitly proceed without the other courts.",
  finished: "Open the archive and read the history your choices produced.",
};
export function Pill({ state }: { state: State }) {
  const key = state.readiness?.state ?? "ready";
  return <PillFrame glyph="♛">{COPY[key]?.[0] ?? "The court"}</PillFrame>;
}
export default function ReadinessCard({
  state,
  chat,
  messageId,
}: {
  state: State;
  chat: any;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const key = state.readiness?.state ?? "ready",
    copy = COPY[key] ?? ["The court waits", "Ask the Herald what remains."],
    mayClose = key === "ready" || key === "ready_with_defaults";
  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await chat.callMethodByHandle("herald", "regency.decide", {
        commandId: `${messageId}:close`,
        kind: "season",
      });
      if (result?.error) throw new Error(String(result.error));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const href = buildPanelLink("panels/regency", {
    stateArgs: {
      version: 1,
      gameKey: state.gameKey,
      surface: "archive",
      subjectKind: "event",
      subjectId: "season-readiness",
    },
  });
  return (
    <CourtCard tone="dispatch">
      <Stack gap={12}>
        <Row>
          <Eyebrow>Season · {state.season}</Eyebrow>
          <Status
            tone={
              key === "blocked_by_seals"
                ? "red"
                : key === "finished"
                  ? "gray"
                  : "gold"
            }
          >
            {key.replaceAll("_", " ")}
          </Status>
        </Row>
        <CourtTitle size={24}>{copy[0]}</CourtTitle>
        <span style={{ color: courtColours.muted, lineHeight: 1.5 }}>
          {copy[1]}
        </span>
        <div
          style={{
            padding: "11px 13px",
            borderRadius: 12,
            border: `1px solid ${courtColours.border}`,
            background: "rgba(155,107,35,.07)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <Eyebrow>Next</Eyebrow>
          <div style={{ marginTop: 4 }}>
            {NEXT[key] ?? "Ask the Herald what remains."}
          </div>
        </div>
        {mayClose ? (
          <span>
            <CourtButton disabled={busy} onClick={() => void close()}>
              ♛ Set down the seal and close court
            </CourtButton>
          </span>
        ) : (
          <CourtLink href={href}>Open the Regent's desk →</CourtLink>
        )}
        {error ? <CourtError>{error}</CourtError> : null}
      </Stack>
    </CourtCard>
  );
}
