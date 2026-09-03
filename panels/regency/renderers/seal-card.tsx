import { useState } from "react";
import { Badge, Button, Callout, Flex, Text } from "@radix-ui/themes";
import { CheckIcon, Cross2Icon, LockClosedIcon } from "@radix-ui/react-icons";

interface SealState {
  orderId: string;
  actor: string;
  actorName?: string;
  summary: string;
  rationale?: string;
  status: string;
  reason?: string | null;
  heraldParticipantId: string;
  season?: string;
}

const STATUS_COLOR: Record<string, "amber" | "green" | "red" | "gray" | "blue"> = {
  awaiting_seal: "amber",
  pending: "blue",
  resolved: "green",
  vetoed: "red",
  rejected: "red",
  withdrawn: "gray",
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_seal: "awaits the seal",
  pending: "sealed, awaiting the season",
  resolved: "carried out",
  vetoed: "vetoed",
  rejected: "could not be carried out",
  withdrawn: "withdrawn",
};

export function Pill({ state }: { state: Partial<SealState> }) {
  return (
    <Flex align="center" gap="1">
      <LockClosedIcon />
      <Text size="1" weight="medium">
        {state.actorName ?? state.actor}: {state.summary}
      </Text>
      <Badge color={STATUS_COLOR[state.status ?? ""] ?? "gray"}>{STATUS_LABEL[state.status ?? ""] ?? state.status}</Badge>
    </Flex>
  );
}

export default function SealCard({ state, chat, messageId }: { state: Partial<SealState>; expanded: boolean; chat: any; messageId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const status = local ?? state.status ?? "";
  const decide = async (decision: "seal" | "veto") => {
    setBusy(decision);
    setError(null);
    try {
      const result = await chat.callMethod(state.heraldParticipantId, "regency.decide", { kind: "seal", orderId: state.orderId, decision });
      if (result && typeof result === "object" && "ok" in result && !(result as { ok: boolean }).ok) {
        setError(String((result as { reason?: string }).reason ?? "refused"));
        return;
      }
      const next = decision === "seal" ? "pending" : "vetoed";
      setLocal(next);
      try {
        await chat.updateCustomMessage?.(messageId, { ...state, status: next });
      } catch {
        // the panel will reconcile the card on its next poll
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Flex direction="column" gap="2" style={{ minWidth: 280 }}>
      <Flex align="center" gap="2" wrap="wrap">
        <LockClosedIcon />
        <Text weight="bold">The Regent's seal</Text>
        <Badge color={STATUS_COLOR[status] ?? "gray"}>{STATUS_LABEL[status] ?? status}</Badge>
        {state.season ? <Text size="1" color="gray">{state.season}</Text> : null}
      </Flex>
      <Text size="2">
        <b>{state.actorName ?? state.actor}</b> asks to <i>{state.summary}</i>
      </Text>
      {state.rationale ? (
        <Text size="2" color="gray" style={{ fontStyle: "italic" }}>
          “{state.rationale}”
        </Text>
      ) : null}
      {state.reason ? <Text size="1" color="gray">{state.reason}</Text> : null}
      {status === "awaiting_seal" ? (
        <Flex gap="2">
          <Button size="2" disabled={busy !== null} onClick={(e) => { e.stopPropagation(); void decide("seal"); }}>
            <CheckIcon /> Seal
          </Button>
          <Button size="2" variant="soft" color="red" disabled={busy !== null} onClick={(e) => { e.stopPropagation(); void decide("veto"); }}>
            <Cross2Icon /> Veto
          </Button>
        </Flex>
      ) : null}
      {error ? (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}
    </Flex>
  );
}
