import {
  CourtCard,
  Eyebrow,
  PillFrame,
  Row,
  Stack,
  courtColours,
} from "./court-ui.js";
type Person = { role: string; name: string; realm: string };
type State = { people?: Person[] };
export function Pill() {
  return <PillFrame glyph="♟">The courts</PillFrame>;
}
export default function DirectoryCard({ state }: { state: State }) {
  return (
    <CourtCard compact tone="night">
      <Stack gap={10}>
        <Eyebrow dark>Who is in the chamber</Eyebrow>
        <Row>
          {(state.people ?? []).map((person) => (
            <span
              key={person.role}
              style={{
                padding: "7px 10px",
                borderRadius: 999,
                border: "1px solid rgba(201,151,66,.25)",
                background: "rgba(255,244,215,.05)",
                fontSize: 11,
              }}
            >
              <b style={{ color: courtColours.cream }}>{person.name}</b>
              <span style={{ color: "rgba(255,244,215,.6)" }}>
                {" "}
                · {person.role.replaceAll(":", " of ")}
              </span>
            </span>
          ))}
        </Row>
      </Stack>
    </CourtCard>
  );
}
