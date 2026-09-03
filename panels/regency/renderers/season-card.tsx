import { Badge, Flex, Text } from "@radix-ui/themes";

interface SeasonState {
  season: string;
  digest: string;
  highlights: Array<{ kind: string; text: string }>;
  treasury: number;
  legitimacy: number;
  estates: Record<string, number>;
  outcome: { kind: string; title: string; reason: string; verdict: string | null } | null;
}

const ICONS: Record<string, string> = { battle: "⚔", capture: "🏴", treaty: "📜", war: "🔥", famine: "🌾", revolt: "✊", crisis: "⚖" };

export default function SeasonCard({ state }: { state: Partial<SeasonState>; expanded: boolean }) {
  return (
    <Flex direction="column" gap="2" style={{ padding: "10px 14px", borderLeft: "3px solid var(--accent-9)", background: "var(--accent-a2)", borderRadius: 8, maxWidth: 640 }}>
      <Flex align="center" gap="2" wrap="wrap">
        <Text weight="bold" size="3" style={{ fontFamily: "Georgia, serif" }}>❧ {state.season}</Text>
        <Badge color="gray">treasury {Math.round(state.treasury ?? 0)}</Badge>
        <Badge color={(state.legitimacy ?? 0) < 40 ? "red" : "green"}>legitimacy {Math.round(state.legitimacy ?? 0)}</Badge>
      </Flex>
      <Text size="2">{state.digest}</Text>
      {state.highlights && state.highlights.length ? (
        <Flex direction="column" gap="1">
          {state.highlights.map((h, i) => (
            <Text key={i} size="1" color="gray">{ICONS[h.kind] ?? "•"} {h.text}</Text>
          ))}
        </Flex>
      ) : null}
      {state.outcome ? (
        <Flex direction="column" gap="1" style={{ marginTop: 4 }}>
          <Text weight="bold" color={state.outcome.kind === "victory" ? "green" : "red"}>{state.outcome.title}</Text>
          <Text size="2">{state.outcome.reason}</Text>
          {state.outcome.verdict ? <Text size="2" style={{ fontStyle: "italic" }}>{state.outcome.verdict}</Text> : null}
        </Flex>
      ) : null}
    </Flex>
  );
}
