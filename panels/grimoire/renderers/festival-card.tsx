import { buildPanelLink } from "@workspace/runtime";
import { FolioPill, folioCardBase } from "./folio-ui.js";
type P = {
  instance?: { estateKey?: string; apprentice?: string };
  surface?: string;
};
type S = { title?: string; summary?: string; judge?: string; projection?: P };
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
    <FolioPill glyph="❀">{state.title ?? "Festival on the green"}</FolioPill>
  );
}
export default function Card({ state }: { state: S }) {
  return (
    <article
      style={{
        ...folioCardBase,
        padding: 18,
        borderRadius: 18,
        background: "linear-gradient(135deg,#172d29,#334234 55%,#5e4426)",
        color: "#fff4d2",
        border: "1px solid #ac8d4c",
        boxShadow: "0 12px 34px rgba(0,0,0,.2)",
      }}
    >
      <small style={{ color: "#efca75", letterSpacing: ".14em" }}>
        THE GREEN IS OPEN
      </small>
      <h3 style={{ font: "23px Georgia,serif", margin: "6px 0" }}>
        {state.title}
      </h3>
      <p style={{ lineHeight: 1.5 }}>{state.summary}</p>
      {state.judge && (
        <p style={{ fontStyle: "italic", opacity: 0.75 }}>
          Judged by {state.judge}
        </p>
      )}
      <a
        href={href(state.projection)}
        style={{ color: "#f2d58e", fontWeight: 700 }}
      >
        Visit the festival record ↗
      </a>
    </article>
  );
}
