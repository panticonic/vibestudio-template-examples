import {
  CourtCard,
  Eyebrow,
  PillFrame,
  Row,
  Rule,
  Stack,
  courtColours,
} from "./court-ui.js";
type Delta = { before?: number; after?: number };
type State = {
  season?: string;
  treasury?: Delta;
  legitimacy?: Delta;
  events?: string[];
};
function Metric({ label, value }: { label: string; value?: Delta }) {
  const before = Math.round(value?.before ?? 0),
    after = Math.round(value?.after ?? 0),
    delta = after - before;
  return (
    <Stack gap={2} style={{ minWidth: 130 }}>
      <small style={{ color: courtColours.muted }}>{label}</small>
      <span style={{ font: "600 24px Georgia,serif" }}>
        {before}{" "}
        <i style={{ color: courtColours.gold, fontStyle: "normal" }}>→</i>{" "}
        {after}
      </span>
      <small
        style={{
          color:
            delta < 0
              ? courtColours.red
              : delta > 0
                ? courtColours.green
                : courtColours.muted,
        }}
      >
        {delta === 0 ? "unchanged" : `${delta > 0 ? "+" : ""}${delta}`}
      </small>
    </Stack>
  );
}
export function Pill() {
  return <PillFrame glyph="◌">Season forecast</PillFrame>;
}
export default function ForecastCard({ state }: { state: State }) {
  return (
    <CourtCard compact tone="dispatch">
      <Stack gap={12}>
        <Eyebrow>If court closed · {state.season}</Eyebrow>
        <Row style={{ gap: 28 }}>
          <Metric label="Treasury" value={state.treasury} />
          <Metric label="Legitimacy" value={state.legitimacy} />
        </Row>
        <Rule />
        <small style={{ color: courtColours.muted, lineHeight: 1.5 }}>
          {state.events?.length
            ? state.events.join(" · ")
            : "No extraordinary consequence is foreseen."}
        </small>
      </Stack>
    </CourtCard>
  );
}
