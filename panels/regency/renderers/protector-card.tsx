import { buildPanelLink } from "@workspace/runtime";
import {
  CourtCard,
  CourtLink,
  CourtTitle,
  Eyebrow,
  PillFrame,
  Row,
  Stack,
  Status,
  courtColours,
} from "./court-ui.js";
type State = {
  gameKey?: string;
  active?: boolean;
  mandate?: string | null;
  seasonsLeft?: number | null;
};
export function Pill({ state }: { state: State }) {
  return (
    <PillFrame glyph="♞">
      {state.active ? "The Lord Protector" : "The Regent bears the seal"}
    </PillFrame>
  );
}
export default function ProtectorCard({ state }: { state: State }) {
  const href = buildPanelLink("panels/regency", {
    stateArgs: {
      version: 1,
      gameKey: state.gameKey,
      surface: "archive",
      subjectKind: "law",
      subjectId: "protectorate",
    },
  });
  return (
    <CourtCard compact tone={state.active ? "night" : "parchment"}>
      <Stack>
        <Row style={{ justifyContent: "space-between" }}>
          <Eyebrow dark={state.active}>Commission under the seal</Eyebrow>
          <Status dark={state.active}>
            {state.active
              ? `${state.seasonsLeft} season${state.seasonsLeft === 1 ? "" : "s"}`
              : "Regent's hand"}
          </Status>
        </Row>
        <CourtTitle size={20}>
          {state.active
            ? "A Protector governs in the Regent's name"
            : "No Protector is commissioned"}
        </CourtTitle>
        {state.mandate ? (
          <blockquote
            style={{
              margin: 0,
              paddingLeft: 12,
              borderLeft: `2px solid ${courtColours.gold}`,
              color: "inherit",
              opacity: 0.78,
              font: "italic 14px/1.5 Georgia,serif",
            }}
          >
            “{state.mandate}”
          </blockquote>
        ) : null}
        <CourtLink href={href} dark={state.active}>
          Open the commission →
        </CourtLink>
      </Stack>
    </CourtCard>
  );
}
