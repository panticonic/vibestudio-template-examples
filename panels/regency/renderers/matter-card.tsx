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

interface MatterOption {
  id: string;
  label: string;
  text: string;
  effects: string;
  adviser?: string | null;
}
interface MatterState {
  gameKey: string;
  crisisId: string;
  title: string;
  text: string;
  options: MatterOption[];
  defaultOption: string;
  chosen: string | null;
  decidedBy: string | null;
  season?: string;
}

export function Pill({ state }: { state: Partial<MatterState> }) {
  const chosen = state.options?.find((option) => option.id === state.chosen);
  return (
    <PillFrame
      glyph="⚖"
      status={
        <Status tone={chosen ? "green" : "gold"}>
          {chosen ? chosen.label : "decision"}
        </Status>
      }
    >
      {state.title ?? "A matter of state"}
    </PillFrame>
  );
}

export default function MatterCard({
  state,
  chat,
  messageId,
}: {
  state: Partial<MatterState>;
  expanded: boolean;
  chat: any;
  messageId: string;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [local, setLocal] = useState<string | null>(null);
  const chosen = local ?? state.chosen ?? null;
  const decide = async (optionId: string) => {
    setBusy(optionId);
    setError(null);
    try {
      const result = await chat.callMethodByHandle("herald", "regency.decide", {
        commandId: `${messageId}:${optionId}`,
        kind: "crisis",
        crisisId: state.crisisId,
        optionId,
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
      setLocal(optionId);
      try {
        await chat.updateCustomMessage?.(messageId, {
          ...state,
          chosen: optionId,
          decidedBy: "regent",
        });
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
      subjectKind: "event",
      subjectId: state.crisisId,
    },
  });
  return (
    <CourtCard tone="dispatch">
      <Stack gap={12}>
        <Row>
          <Eyebrow>A matter laid before the Regent</Eyebrow>
          {state.season ? <Status tone="gray">{state.season}</Status> : null}
        </Row>
        <CourtTitle>{state.title}</CourtTitle>
        <span style={{ color: courtColours.muted, lineHeight: 1.55 }}>
          {state.text}
        </span>
        <CourtLink href={href}>
          Open this matter at the Regent's desk →
        </CourtLink>
        <Stack gap={9}>
          {(state.options ?? []).map((option) => {
            const picked = chosen === option.id;
            return (
              <div
                key={option.id}
                style={{
                  padding: "12px 13px",
                  borderRadius: 13,
                  border: `1px solid ${picked ? courtColours.green + "88" : courtColours.border}`,
                  background: picked
                    ? "rgba(55,106,75,.09)"
                    : "rgba(255,255,255,.34)",
                  opacity: chosen && !picked ? 0.56 : 1,
                }}
              >
                <Stack gap={6}>
                  <Row>
                    <b style={{ fontFamily: "Georgia,serif" }}>
                      {option.label}
                    </b>
                    {option.adviser ? (
                      <Status tone="gray">{option.adviser}'s counsel</Status>
                    ) : null}
                    {option.id === state.defaultOption && !chosen ? (
                      <Status>default</Status>
                    ) : null}
                    {picked ? <Status tone="green">chosen</Status> : null}
                  </Row>
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                    {option.text}
                  </span>
                  <small style={{ color: courtColours.muted }}>
                    {option.effects}
                  </small>
                  {!chosen ? (
                    <span>
                      <CourtButton
                        disabled={busy !== null}
                        variant="quiet"
                        onClick={(event) => {
                          event.stopPropagation();
                          void decide(option.id);
                        }}
                      >
                        Choose this course
                      </CourtButton>
                    </span>
                  ) : null}
                </Stack>
              </div>
            );
          })}
        </Stack>
        {error ? <CourtError>{error}</CourtError> : null}
      </Stack>
    </CourtCard>
  );
}
