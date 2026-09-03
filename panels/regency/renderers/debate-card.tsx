import { Badge, Flex, Separator, Text } from "@radix-ui/themes";
import { ChatBubbleIcon } from "@radix-ui/react-icons";

interface DebateState {
  debateId: string;
  question: string;
  status: "open" | "closed";
  season: string;
  lines: Array<{ role: string; name: string; text: string }>;
  waiting: string[];
}

export function Pill({ state }: { state: Partial<DebateState> }) {
  return (
    <Flex align="center" gap="1">
      <ChatBubbleIcon />
      <Text size="1" weight="medium">{state.question}</Text>
      <Badge color={state.status === "open" ? "amber" : "gray"}>{(state.lines ?? []).length} of 4</Badge>
    </Flex>
  );
}

export default function DebateCard({ state }: { state: Partial<DebateState>; expanded: boolean }) {
  const lines = state.lines ?? [];
  const waiting = state.waiting ?? [];
  return (
    <Flex direction="column" gap="2" style={{ minWidth: 300, maxWidth: 620 }}>
      <Flex align="center" gap="2" wrap="wrap">
        <ChatBubbleIcon />
        <Text weight="bold">The council is asked</Text>
        <Badge color={state.status === "open" ? "amber" : "green"}>{state.status === "open" ? `${lines.length} of 4 have answered` : "closed"}</Badge>
        {state.season ? <Text size="1" color="gray">{state.season}</Text> : null}
      </Flex>
      <Text size="3" style={{ fontFamily: "Georgia, serif" }}>{state.question}</Text>
      <Separator size="4" />
      <Flex direction="column" gap="2">
        {lines.map((l) => (
          <Flex key={l.role} direction="column" gap="1">
            <Text size="1" color="gray" weight="medium">{l.name} · {l.role}</Text>
            <Text size="2">{l.text}</Text>
          </Flex>
        ))}
        {waiting.length ? (
          <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
            still to speak: {waiting.join(", ")}
          </Text>
        ) : null}
      </Flex>
    </Flex>
  );
}
