import { Badge, Flex, Separator, Text } from "@radix-ui/themes";
import { FileTextIcon } from "@radix-ui/react-icons";

interface HandoverState {
  season: string;
  mandate: string;
  text: string;
}

export function Pill({ state }: { state: Partial<HandoverState> }) {
  return (
    <Flex align="center" gap="1">
      <FileTextIcon />
      <Text size="1" weight="medium">The Lord Protector's account</Text>
      <Badge color="gray">{state.season}</Badge>
    </Flex>
  );
}

export default function HandoverCard({ state }: { state: Partial<HandoverState>; expanded: boolean }) {
  return (
    <Flex direction="column" gap="2" style={{ minWidth: 300, maxWidth: 640, borderLeft: "3px solid var(--accent-9)", paddingLeft: 12 }}>
      <Flex align="center" gap="2" wrap="wrap">
        <FileTextIcon />
        <Text weight="bold">The protectorate ends</Text>
        {state.season ? <Badge color="gray">{state.season}</Badge> : null}
      </Flex>
      {state.mandate ? (
        <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
          the mandate was: “{state.mandate}”
        </Text>
      ) : null}
      <Separator size="4" />
      <Text size="2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{state.text}</Text>
    </Flex>
  );
}
