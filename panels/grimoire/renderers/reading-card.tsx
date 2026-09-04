import { buildPanelLink } from "@workspace/runtime";
import { FolioPill, folioCardBase } from "./folio-ui.js";
type P = {
  instance?: { estateKey?: string; apprentice?: string };
  surface?: string;
  subject?: { kind?: string; id?: string };
};
type S = { title?: string; summary?: string; byline?: string; projection?: P };
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
  return <FolioPill glyph="❧">{state.title ?? "From the library"}</FolioPill>;
}
export default function Card({ state }: { state: S }) {
  return (
    <article
      style={{
        ...folioCardBase,
        padding: "15px 18px",
        borderRadius: 16,
        background: "linear-gradient(135deg,#f7efd9,#e9d8b4)",
        color: "#2d2118",
        border: "1px solid #c6a876",
      }}
    >
      <small style={{ color: "#8b6430" }}>
        {state.byline ?? "The estate library"}
      </small>
      <h3 style={{ font: "21px Georgia,serif", margin: "4px 0" }}>
        {state.title}
      </h3>
      <p style={{ margin: "7px 0 12px", lineHeight: 1.5 }}>{state.summary}</p>
      <a
        href={href(state.projection)}
        style={{ color: "#70491e", fontWeight: 700 }}
      >
        Open the Codex ↗
      </a>
    </article>
  );
}
