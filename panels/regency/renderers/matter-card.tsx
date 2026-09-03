import { useState } from "react";
import { Badge, Button, Callout, Flex, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

interface MatterOption {
  id: string;
  label: string;
  text: string;
  effects: string;
  adviser?: string | null;
}

interface MatterState {
  crisisId: string;
  title: string;
  text: string;
  options: MatterOption[];
  defaultOption: string;
  chosen: string | null;
  decidedBy: string | null;
  heraldParticipantId: string;
  season?: string;
}

export function Pill({ state }: { state: Partial<MatterState> }) {
  const chosen = state.options?.find((o) => o.id === state.chosen);
  return (
    <Flex align="center" gap="1">
      <ExclamationTriangleIcon />
      <Text size="1" weight="medium">{state.title}</Text>
      <Badge color={chosen ? "green" : "amber"}>{chosen ? chosen.label : "awaits a decision"}</Badge>
    </Flex>
  );
}

export default function MatterCard({ state, chat, messageId }: { state: Partial<MatterState>; expanded: boolean; chat: any; messageId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const chosen = local ?? state.chosen ?? null;
  const decide = async (optionId: string) => {
    setBusy(optionId);
    setError(null);
    try {
      const result = await chat.callMethod(state.heraldParticipantId, "regency.decide", { kind: "crisis", crisisId: state.crisisId, optionId });
      if (result && typeof result === "object" && "ok" in result && !(result as { ok: boolean }).ok) {
        setError(String((result as { reason?: string }).reason ?? "refused"));
        return;
      }
      setLocal(optionId);
      try {
        await chat.updateCustomMessage?.(messageId, { ...state, chosen: optionId, decidedBy: "regent" });
      } catch {
        // reconciled by the panel
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Flex direction="column" gap="2" style={{ minWidth: 300, maxWidth: 520 }}>
      <Flex align="center" gap="2" wrap="wrap">
        <ExclamationTriangleIcon />
        <Text weight="bold">{state.title}</Text>
        {state.season ? <Text size="1" color="gray">{state.season}</Text> : null}
      </Flex>
      <Text size="2">{state.text}</Text>
      <Flex direction="column" gap="2">
        {(state.options ?? []).map((o) => {
          const picked = chosen === o.id;
          return (
            <Flex key={o.id} direction="column" gap="1" style={{ padding: "6px 8px", borderRadius: 8, border: picked ? "1px solid var(--accent-9)" : "1px solid var(--gray-a5)", opacity: chosen && !picked ? 0.55 : 1 }}>
              <Flex align="center" gap="2" wrap="wrap">
                <Text size="2" weight="bold">{o.label}</Text>
                {o.adviser ? <Badge color="gray">{o.adviser}'s counsel</Badge> : null}
                {o.id === state.defaultOption && !chosen ? <Badge color="amber">default</Badge> : null}
                {picked ? <Badge color="green">chosen</Badge> : null}
              </Flex>
              <Text size="1">{o.text}</Text>
              <Text size="1" color="gray">{o.effects}</Text>
              {!chosen ? (
                <Button size="1" variant="soft" disabled={busy !== null} onClick={(e) => { e.stopPropagation(); void decide(o.id); }}>
                  Choose
                </Button>
              ) : null}
            </Flex>
          );
        })}
      </Flex>
      {error ? (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}
    </Flex>
  );
}
