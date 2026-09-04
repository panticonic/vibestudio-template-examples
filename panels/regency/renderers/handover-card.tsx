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
  season?: string;
  mandate?: string;
  text?: string;
}
export function Pill({ state }: { state: State }) {
  return (
    <PillFrame
      glyph="❧"
      status={
        state.season ? <Status tone="gray">{state.season}</Status> : undefined
      }
    >
      The Protector's account
    </PillFrame>
  );
}
export default function HandoverCard({
  state,
}: {
  state: State;
  expanded: boolean;
}) {
  return (
    <CourtCard tone="dispatch">
      <Stack gap={12}>
        <Row>
          <Eyebrow>A handover beneath the seal</Eyebrow>
          {state.season ? <Status tone="gray">{state.season}</Status> : null}
        </Row>
        <CourtTitle>The protectorate ends</CourtTitle>
        {state.mandate ? (
          <span
            style={{
              color: courtColours.muted,
              font: "italic 13px/1.5 Georgia,serif",
            }}
          >
            The mandate was “{state.mandate}”
          </span>
        ) : null}
        <Rule />
        <div
          style={{ whiteSpace: "pre-wrap", font: "15px/1.65 Georgia,serif" }}
        >
          {state.text}
        </div>
      </Stack>
    </CourtCard>
  );
}
