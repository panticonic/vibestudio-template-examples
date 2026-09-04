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
} from "./court-ui.js";
type State = { gameKey?: string; mandates?: Record<string, string> };
export function Pill() {
  return <PillFrame glyph="⚜">Instruments of office</PillFrame>;
}
export default function MandateCard({ state }: { state: State }) {
  const href = buildPanelLink("panels/regency", {
    stateArgs: {
      version: 1,
      gameKey: state.gameKey,
      surface: "archive",
      subjectKind: "law",
      subjectId: "mandates",
    },
  });
  return (
    <CourtCard compact>
      <Stack>
        <Eyebrow>The council's commissions</Eyebrow>
        <CourtTitle size={19}>Who may act without the seal</CourtTitle>
        <Row>
          {Object.entries(state.mandates ?? {}).map(([role, level]) => (
            <Status key={role}>
              {role} · {level}
            </Status>
          ))}
        </Row>
        <CourtLink href={href}>Review commissions at the desk →</CourtLink>
      </Stack>
    </CourtCard>
  );
}
