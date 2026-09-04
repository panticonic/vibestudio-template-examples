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

interface SealState {
  gameKey: string;
  orderId: string;
  actor: string;
  actorName?: string;
  summary: string;
  rationale?: string;
  status: string;
  reason?: string | null;
  season?: string;
  forecast?: string | null;
}
const LABEL: Record<string, string> = {
  awaiting_seal: "awaits the seal",
  pending: "sealed",
  resolved: "carried out",
  vetoed: "vetoed",
  rejected: "refused",
  withdrawn: "withdrawn",
};
const TONE: Record<string, string> = {
  awaiting_seal: "gold",
  pending: "blue",
  resolved: "green",
  vetoed: "red",
  rejected: "red",
  withdrawn: "gray",
};
export function Pill({ state }: { state: Partial<SealState> }) {
  return (
    <PillFrame
      glyph="♛"
      status={
        <Status tone={TONE[state.status ?? ""] ?? "gray"}>
          {LABEL[state.status ?? ""] ?? state.status}
        </Status>
      }
    >
      {state.actorName ?? state.actor}: {state.summary}
    </PillFrame>
  );
}
export default function SealCard({
  state,
  chat,
  messageId,
}: {
  state: Partial<SealState>;
  expanded: boolean;
  chat: any;
  messageId: string;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [local, setLocal] = useState<string | null>(null);
  const status = local ?? state.status ?? "";
  const decide = async (decision: "seal" | "veto") => {
    setBusy(decision);
    setError(null);
    try {
      const result = await chat.callMethodByHandle("herald", "regency_decide", {
        commandId: `${messageId}:${decision}`,
        kind: "seal",
        orderId: state.orderId,
        decision,
      });
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        !(result as { ok: boolean }).ok
      ) {
        setError(String((result as { reason?: string }).reason ?? "refused"));
        return;
      }
      const next = decision === "seal" ? "pending" : "vetoed";
      setLocal(next);
      try {
        await chat.updateCustomMessage?.(messageId, { ...state, status: next });
      } catch {
        /* the world will reconcile the card */
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };
  const href = buildPanelLink("panels/regency", {
    stateArgs: {
      version: 1,
      gameKey: state.gameKey,
      surface: "archive",
      subjectKind: "law",
      subjectId: state.orderId,
    },
  });
  return (
    <CourtCard tone="night">
      <Stack gap={12}>
        <Row>
          <Eyebrow dark>The Regent's seal</Eyebrow>
          <Status dark tone={TONE[status] ?? "gray"}>
            {LABEL[status] ?? status}
          </Status>
          {state.season ? (
            <small style={{ marginLeft: "auto", opacity: 0.55 }}>
              {state.season}
            </small>
          ) : null}
        </Row>
        <CourtTitle>
          {state.actorName ?? state.actor} asks to {state.summary}
        </CourtTitle>
        {state.rationale ? (
          <blockquote
            style={{
              margin: 0,
              paddingLeft: 12,
              borderLeft: `2px solid ${courtColours.goldBright}`,
              font: "italic 14px/1.55 Georgia,serif",
              opacity: 0.76,
            }}
          >
            “{state.rationale}”
          </blockquote>
        ) : null}
        {state.reason ? (
          <small style={{ opacity: 0.62 }}>{state.reason}</small>
        ) : null}
        {state.forecast && status === "awaiting_seal" ? (
          <div
            style={{
              padding: "11px 12px",
              border: "1px solid rgba(201,151,66,.23)",
              borderRadius: 12,
              background: "rgba(255,244,215,.05)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <Eyebrow dark>What the clerks foresee</Eyebrow>
            <div style={{ marginTop: 4 }}>{state.forecast}</div>
          </div>
        ) : null}
        <CourtLink dark href={href}>
          Open the act in the Regent's records →
        </CourtLink>
        {status === "awaiting_seal" ? (
          <Row>
            <CourtButton
              disabled={busy !== null}
              onClick={(event) => {
                event.stopPropagation();
                void decide("seal");
              }}
            >
              ♛ Set the seal
            </CourtButton>
            <CourtButton
              disabled={busy !== null}
              variant="veto"
              onClick={(event) => {
                event.stopPropagation();
                void decide("veto");
              }}
            >
              × Veto the act
            </CourtButton>
          </Row>
        ) : null}
        {error ? <CourtError>{error}</CourtError> : null}
      </Stack>
    </CourtCard>
  );
}
