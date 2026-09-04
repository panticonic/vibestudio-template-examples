import {
  CourtCard,
  CourtTitle,
  Eyebrow,
  PillFrame,
  Row,
  Rule,
  Stack,
  Status,
  courtColours,
} from "./court-ui.js";
interface State {
  season?: string;
  digest?: string;
  highlights?: Array<{ kind: string; text: string }>;
  treasury?: number;
  legitimacy?: number;
  estates?: Record<string, number>;
  outcome?: {
    kind: string;
    title: string;
    reason: string;
    verdict: string | null;
  } | null;
}
const ICONS: Record<string, string> = {
  battle: "⚔",
  capture: "⚑",
  treaty: "❧",
  war: "✹",
  famine: "♨",
  revolt: "♟",
  crisis: "⚖",
};
export function Pill({ state }: { state: State }) {
  return <PillFrame glyph="❧">{state.season ?? "Season chronicle"}</PillFrame>;
}
export default function SeasonCard({
  state,
}: {
  state: State;
  expanded: boolean;
}) {
  return (
    <CourtCard tone={state.outcome ? "night" : "dispatch"}>
      <Stack gap={11}>
        <Row>
          <Eyebrow dark={!!state.outcome}>
            The court record · {state.season}
          </Eyebrow>
          <span style={{ marginLeft: "auto" }} />
          <Status dark={!!state.outcome}>
            coin {Math.round(state.treasury ?? 0)}
          </Status>
          <Status
            dark={!!state.outcome}
            tone={(state.legitimacy ?? 0) < 40 ? "red" : "green"}
          >
            legitimacy {Math.round(state.legitimacy ?? 0)}
          </Status>
        </Row>
        <CourtTitle>{state.digest}</CourtTitle>
        {state.highlights?.length ? (
          <Stack gap={7}>
            {state.highlights.map((h, i) => (
              <div
                key={`${h.kind}:${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 8,
                  color: state.outcome
                    ? "rgba(255,244,215,.7)"
                    : courtColours.muted,
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                <span style={{ color: courtColours.gold }}>
                  {ICONS[h.kind] ?? "·"}
                </span>
                <span>{h.text}</span>
              </div>
            ))}
          </Stack>
        ) : null}
        {state.outcome ? (
          <>
            <Rule dark />
            <Stack gap={5}>
              <Eyebrow dark>{state.outcome.kind}</Eyebrow>
              <CourtTitle>{state.outcome.title}</CourtTitle>
              <span style={{ lineHeight: 1.5 }}>{state.outcome.reason}</span>
              {state.outcome.verdict ? (
                <em
                  style={{
                    color: "rgba(255,244,215,.68)",
                    fontFamily: "Georgia,serif",
                  }}
                >
                  {state.outcome.verdict}
                </em>
              ) : null}
            </Stack>
          </>
        ) : null}
      </Stack>
    </CourtCard>
  );
}
