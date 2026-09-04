import { buildPanelLink } from "@workspace/runtime";
import { FolioPill, folioCardBase } from "./folio-ui.js";
type P = {
  instance?: { estateKey?: string; apprentice?: string };
  surface?: string;
};
type S = { title?: string; summary?: string; status?: string; projection?: P };
const href = (p?: P) =>
  buildPanelLink("panels/grimoire", {
    stateArgs: {
      version: 1,
      estateKey: p?.instance?.estateKey,
      apprentice: p?.instance?.apprentice,
      surface: p?.surface ?? "journal",
    },
  });
export function Pill({ state }: { state: S }) {
  return (
    <FolioPill glyph="◇" detail={state.status}>
      {state.title ?? "Before the Chapel"}
    </FolioPill>
  );
}
export default function Card({ state }: { state: S }) {
  return (
    <article
      style={{
        ...folioCardBase,
        padding: 18,
        borderRadius: 18,
        background: "linear-gradient(150deg,#f5f0e5,#ddd2bd)",
        color: "#28241d",
        border: "1px solid #95856d",
      }}
    >
      <small style={{ letterSpacing: ".14em", color: "#75624b" }}>
        A MATTER OF SEALS
      </small>
      <h3 style={{ font: "22px Georgia,serif", margin: "6px 0" }}>
        {state.title}
      </h3>
      <p style={{ lineHeight: 1.5 }}>{state.summary}</p>
      <a
        href={href(state.projection)}
        style={{ color: "#654a2f", fontWeight: 700 }}
      >
        Read the Chapel record ↗
      </a>
    </article>
  );
}
