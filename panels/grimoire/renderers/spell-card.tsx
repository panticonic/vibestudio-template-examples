import { useRef, useState } from "react";
import { buildPanelLink } from "@workspace/runtime";
import { FolioPill, folioCardBase } from "./folio-ui.js";

type Projection = {
  instance?: { estateKey?: string; apprentice?: string };
  surface?: string;
  subject?: { kind?: string; id?: string };
};
type State = {
  spellId?: string;
  verse?: string;
  name?: string;
  status?: string;
  tier?: string;
  line?: string;
  persistent?: boolean;
  projection?: Projection;
  shelved?: boolean;
};
type Chat = {
  callMethodByHandle: (
    handle: string,
    method: string,
    args: unknown,
  ) => Promise<unknown>;
};
const statusColour: Record<string, string> = {
  cast: "#28765a",
  deliberating: "#8b5d19",
  misfired: "#a73b31",
  released: "#6f6b64",
  rejected: "#a73b31",
};
function href(p?: Projection) {
  return buildPanelLink("panels/grimoire", {
    stateArgs: {
      version: 1,
      estateKey: p?.instance?.estateKey,
      apprentice: p?.instance?.apprentice,
      surface: p?.surface ?? "codex",
      subjectKind: p?.subject?.kind ?? "spell",
      subjectId: p?.subject?.id,
    },
  });
}
export function Pill({ state }: { state: State }) {
  return (
    <FolioPill glyph="✦" detail={state.status}>
      {state.name ?? "A spell"}
    </FolioPill>
  );
}
export default function SpellCard({
  state,
  chat,
  messageId,
}: {
  state: State;
  chat: Chat;
  messageId: string;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [note, setNote] = useState(state.line ?? "");
  const ids = useRef<Record<string, string>>({});
  const act = async (kind: "recast" | "release" | "shelve") => {
    setBusy(kind);
    setError(null);
    try {
      ids.current[kind] ??= `${messageId}:${kind}:${crypto.randomUUID()}`;
      const result = (await chat.callMethodByHandle(
        "familiar",
        "grimoire_command",
        {
          commandId: ids.current[kind],
          kind,
          payload: {
            spellId: state.spellId,
            shelved: kind === "shelve" ? !state.shelved : undefined,
          },
        },
      )) as { ok?: boolean; reason?: string; line?: string; error?: string };
      if (result.error || result.ok === false)
        throw new Error(result.error ?? result.reason ?? "The estate refused.");
      setNote(
        result.line ??
          (kind === "release"
            ? "The writing goes quiet."
            : kind === "recast"
              ? "The verse takes hold again."
              : "The verse moves on the shelf."),
      );
      ids.current[kind] = `${messageId}:${kind}:${crypto.randomUUID()}`;
    } catch (c) {
      setError(c instanceof Error ? c.message : String(c));
    } finally {
      setBusy(null);
    }
  };
  const colour = statusColour[state.status ?? ""] ?? "#8a622e";
  return (
    <article
      style={{
        ...folioCardBase,
        maxWidth: 620,
        padding: 18,
        borderRadius: 18,
        background: "linear-gradient(150deg,#171913,#26251c)",
        color: "#f5ecd8",
        border: "1px solid rgba(222,181,104,.26)",
        boxShadow: "0 18px 42px rgba(0,0,0,.24)",
      }}
    >
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 14 }}
      >
        <div>
          <small
            style={{
              color: "#d3aa64",
              letterSpacing: ".14em",
              textTransform: "uppercase",
            }}
          >
            {state.tier ?? "spell"}
          </small>
          <h3 style={{ font: "22px Georgia,serif", margin: "4px 0" }}>
            {state.name ?? "An unnamed spell"}
          </h3>
        </div>
        <span
          style={{
            height: 26,
            padding: "4px 10px",
            borderRadius: 99,
            background: `${colour}33`,
            color: colour,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {state.status}
        </span>
      </header>
      <blockquote
        style={{
          margin: "12px 0",
          padding: "10px 14px",
          borderLeft: "2px solid #c4934d",
          background: "rgba(255,255,255,.035)",
          font: "italic 15px/1.55 Georgia,serif",
          whiteSpace: "pre-line",
        }}
      >
        {state.verse}
      </blockquote>
      <p style={{ opacity: 0.76 }}>{note}</p>
      <footer
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <a
          href={href(state.projection)}
          style={{ color: "#e5bd78", marginRight: "auto" }}
        >
          Open in Codex ↗
        </a>
        {state.status === "cast" && !state.persistent && (
          <button
            disabled={!!busy}
            onClick={() => void act("recast")}
            style={button}
          >
            Speak again
          </button>
        )}
        {state.persistent && state.status === "cast" && (
          <button
            disabled={!!busy}
            onClick={() => void act("release")}
            style={button}
          >
            Release
          </button>
        )}
        <button
          disabled={!!busy}
          onClick={() => void act("shelve")}
          style={button}
        >
          {state.shelved ? "Unshelve" : "Shelve"}
        </button>
      </footer>
      {error && (
        <p role="alert" style={{ color: "#ff9a8e" }}>
          {error}
        </p>
      )}
    </article>
  );
}
const button = {
  border: "1px solid rgba(229,189,120,.35)",
  borderRadius: 999,
  padding: "7px 12px",
  background: "rgba(229,189,120,.1)",
  color: "#f5ecd8",
  fontWeight: 700,
  cursor: "pointer",
} as const;
