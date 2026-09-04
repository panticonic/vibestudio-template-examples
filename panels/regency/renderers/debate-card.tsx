import {
  CourtCard,
  CourtTitle,
  Eyebrow,
  PillFrame,
  Rule,
  Stack,
  Status,
  Row,
  courtColours,
} from "./court-ui.js";
interface State {
  debateId?: string;
  question?: string;
  status?: "open" | "closed";
  season?: string;
  lines?: Array<{ role: string; name: string; text: string }>;
  waiting?: string[];
}
export function Pill({ state }: { state: State }) {
  return (
    <PillFrame
      glyph="♟"
      status={
        <Status tone={state.status === "open" ? "gold" : "green"}>
          {(state.lines ?? []).length} of 4
        </Status>
      }
    >
      {state.question ?? "The council is asked"}
    </PillFrame>
  );
}
export default function DebateCard({
  state,
}: {
  state: State;
  expanded: boolean;
}) {
  const lines = state.lines ?? [],
    waiting = state.waiting ?? [];
  return (
    <CourtCard tone="night">
      <Stack gap={13}>
        <Row>
          <Eyebrow dark>The council is asked</Eyebrow>
          <Status dark tone={state.status === "open" ? "gold" : "green"}>
            {state.status === "open"
              ? `${lines.length} of 4 have answered`
              : "counsel complete"}
          </Status>
          {state.season ? (
            <small style={{ marginLeft: "auto", opacity: 0.55 }}>
              {state.season}
            </small>
          ) : null}
        </Row>
        <CourtTitle>{state.question}</CourtTitle>
        <Rule dark />
        <Stack gap={12}>
          {lines.map((line) => (
            <div
              key={line.role}
              style={{
                paddingLeft: 12,
                borderLeft: "2px solid rgba(201,151,66,.35)",
              }}
            >
              <small
                style={{
                  display: "block",
                  marginBottom: 3,
                  color: courtColours.goldBright,
                }}
              >
                {line.name} · {line.role}
              </small>
              <span style={{ font: "14px/1.55 Georgia,serif" }}>
                {line.text}
              </span>
            </div>
          ))}
          {waiting.length ? (
            <small
              style={{ color: "rgba(255,244,215,.55)", fontStyle: "italic" }}
            >
              Still to speak: {waiting.join(", ")}
            </small>
          ) : null}
        </Stack>
      </Stack>
    </CourtCard>
  );
}
