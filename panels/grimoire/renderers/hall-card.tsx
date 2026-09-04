import { buildPanelLink } from "@workspace/runtime";
import { FolioPill, folioCardBase } from "./folio-ui.js";
type P = {
  instance?: { estateKey?: string; apprentice?: string };
  surface?: string;
};
type S = {
  title?: string;
  topic?: string;
  channelId?: string;
  voices?: string[];
  projection?: P;
};
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
  return <FolioPill glyph="✦">{state.title ?? "A household hall"}</FolioPill>;
}
export default function Card({ state }: { state: S }) {
  return (
    <article
      style={{
        ...folioCardBase,
        padding: 18,
        borderRadius: 18,
        background: "linear-gradient(145deg,#17231d,#26352a)",
        color: "#eef3e8",
        border: "1px solid #61765e",
      }}
    >
      <small style={{ color: "#a9c59d", letterSpacing: ".12em" }}>
        THE HOUSEHOLD SPEAKS
      </small>
      <h3 style={{ font: "22px Georgia,serif", margin: "6px 0" }}>
        {state.title}
      </h3>
      <p style={{ fontStyle: "italic", opacity: 0.82 }}>“{state.topic}”</p>
      {state.voices?.length ? (
        <p style={{ fontSize: 13, opacity: 0.65 }}>
          {state.voices.join(" · ")}
        </p>
      ) : null}
      <a
        href={href(state.projection)}
        style={{ color: "#c2d7b5", fontWeight: 700 }}
      >
        Keep this hall in the Journal ↗
      </a>
    </article>
  );
}
