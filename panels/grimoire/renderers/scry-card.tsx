import { buildPanelLink } from "@workspace/runtime";
import { FolioPill, folioCardBase } from "./folio-ui.js";
type P = {
  instance?: { estateKey?: string; apprentice?: string };
  surface?: string;
  subject?: { kind?: string; id?: string };
};
type S = { title?: string; summary?: string; projection?: P };
const href = (p?: P) =>
  buildPanelLink("panels/grimoire", {
    stateArgs: {
      version: 1,
      estateKey: p?.instance?.estateKey,
      apprentice: p?.instance?.apprentice,
      surface: p?.surface ?? "codex",
      subjectKind: p?.subject?.kind,
      subjectId: p?.subject?.id,
    },
  });
export function Pill({ state }: { state: S }) {
  return <FolioPill glyph="◎">{state.title ?? "A scrying"}</FolioPill>;
}
export default function Card({ state }: { state: S }) {
  return (
    <article style={card}>
      <small style={eyebrow}>Beneath the words</small>
      <h3 style={title}>{state.title}</h3>
      <p style={copy}>{state.summary}</p>
      <a style={link} href={href(state.projection)}>
        Read the full record ↗
      </a>
    </article>
  );
}
const card = {
    ...folioCardBase,
    padding: 18,
    borderRadius: 18,
    background: "radial-gradient(circle at 90% 0,#273b48,#11191f 60%)",
    color: "#e8f1ef",
    border: "1px solid #496d78",
  } as const,
  eyebrow = {
    color: "#85bdc4",
    letterSpacing: ".14em",
    textTransform: "uppercase" as const,
  },
  title = { font: "22px Georgia,serif", margin: "5px 0" },
  copy = { opacity: 0.78, lineHeight: 1.5 },
  link = { color: "#9fd7d8", fontWeight: 700 };
