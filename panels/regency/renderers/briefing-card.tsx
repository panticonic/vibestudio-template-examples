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
  season?: string;
  realm?: string;
  summary?: string;
  nextAction?: string;
  alternatives?: string[];
  treasury?: number;
  legitimacy?: number;
};

export function Pill({ state }: { state: State }) {
  return <PillFrame glyph="♜">{state.realm ?? "Realm briefing"}</PillFrame>;
}

export default function BriefingCard({ state }: { state: State }) {
  const href = buildPanelLink("panels/regency", {
    stateArgs: { version: 1, gameKey: state.gameKey, surface: "map" },
  });
  return (
    <CourtCard
      tone="dispatch"
      style={{ borderLeft: `4px solid ${courtColours.gold}` }}
    >
      <Stack gap={11}>
        <Eyebrow>
          {state.season} · dispatch from {state.realm}
        </Eyebrow>
        <CourtTitle>{state.summary}</CourtTitle>
        <Stack
          gap={5}
          style={{
            padding: "11px 13px",
            borderRadius: 12,
            border: `1px solid ${courtColours.border}`,
            background: "rgba(155,107,35,.08)",
          }}
        >
          <Eyebrow>Your clearest next move</Eyebrow>
          <span style={{ fontSize: 13, lineHeight: 1.5 }}>
            {state.nextAction ??
              "Ask the Herald what deserves your decision first."}
          </span>
          {state.alternatives?.[0] ? (
            <small style={{ color: courtColours.muted }}>
              Or: {state.alternatives[0]}
            </small>
          ) : null}
        </Stack>
        <Row>
          <Status>coin {state.treasury}</Status>
          <Status tone={(state.legitimacy ?? 0) < 40 ? "red" : "green"}>
            legitimacy {state.legitimacy}
          </Status>
          <span style={{ marginLeft: "auto" }}>
            <CourtLink href={href}>Survey the realm →</CourtLink>
          </span>
        </Row>
      </Stack>
    </CourtCard>
  );
}
