import { useRef, useState } from "react";
import { buildPanelLink } from "@workspace/runtime";
import { FolioPill, folioCardBase } from "./folio-ui.js";

type Projection = {
  instance?: { estateKey?: string; apprentice?: string };
  surface?: string;
  subject?: {
    kind?: string;
    id?: string;
    region?: string;
    x?: number;
    y?: number;
  };
};
type State = {
  estateKey?: string;
  apprentice?: string;
  title?: string;
  prompt?: string;
  guidance?: string;
  alternatives?: string[];
  exampleLabel?: string;
  example?: string;
  focus?: Projection;
};
type Chat = {
  callMethodByHandle: (
    handle: string,
    method: string,
    args: unknown,
  ) => Promise<unknown>;
};

const ink = "#24180f",
  gold = "#b7792b",
  paper = "linear-gradient(145deg,#fffaf0,#f4e5c8)";
function panelHref(p: Projection | undefined, fallback: State): string {
  const subject = p?.subject;
  return buildPanelLink("panels/grimoire", {
    stateArgs: {
      version: 1,
      estateKey: p?.instance?.estateKey ?? fallback.estateKey,
      apprentice: p?.instance?.apprentice ?? fallback.apprentice,
      surface: p?.surface ?? "valley",
      ...(subject?.kind
        ? {
            subjectKind: subject.kind,
            subjectId: subject.id,
            region: subject.region,
            x: subject.x,
            y: subject.y,
          }
        : {}),
    },
  });
}

export function Pill({ state }: { state: State }) {
  return (
    <FolioPill glyph="✦">{state.title ?? "Speak into the estate"}</FolioPill>
  );
}

export default function VerseCard({
  state,
  chat,
  messageId,
}: {
  state: State;
  chat: Chat;
  messageId: string;
}) {
  const [verse, setVerse] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commandId = useRef(`${messageId}:speak:${crypto.randomUUID()}`);
  const submit = async () => {
    if (!verse.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const normalized = verse.replace(/\r\n?/g, "\n");
      const result = await chat.callMethodByHandle(
        "familiar",
        "grimoire_command",
        {
          commandId: commandId.current,
          kind: "speak",
          payload: {
            verse: normalized,
            room: "circle",
            focus: state.focus?.subject,
          },
        },
      );
      const body = result as {
        line?: string;
        kind?: string;
        spellId?: string;
        error?: string;
      };
      if (body.error) throw new Error(body.error);
      setAnswer(
        body.line ??
          (body.kind === "deliberating"
            ? "The familiar carries your words beneath the page…"
            : "The estate heard you."),
      );
      setVerse("");
      commandId.current = `${messageId}:speak:${crypto.randomUUID()}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      style={{
        ...folioCardBase,
        maxWidth: 620,
        padding: 18,
        borderRadius: 18,
        color: ink,
        background: paper,
        border: "1px solid rgba(138,84,25,.28)",
        boxShadow:
          "0 14px 40px rgba(54,31,12,.14), inset 0 1px rgba(255,255,255,.8)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
          gap: 16,
        }}
      >
        <div>
          <small
            style={{
              color: gold,
              letterSpacing: ".16em",
              textTransform: "uppercase",
            }}
          >
            The circle
          </small>
          <h3
            style={{
              margin: "4px 0 6px",
              fontFamily: "Georgia,serif",
              fontSize: 22,
            }}
          >
            {state.title ?? "Speak into the estate"}
          </h3>
        </div>
        <span style={{ fontSize: 24, color: gold }}>◯</span>
      </header>
      <p style={{ margin: "0 0 12px", opacity: 0.72, lineHeight: 1.5 }}>
        {state.prompt ??
          "Two short lines are enough. Your exact words cross the circle unchanged."}
      </p>
      {state.guidance ? (
        <div
          style={{
            margin: "0 0 14px",
            padding: "11px 13px",
            borderRadius: 12,
            background: "rgba(183,121,43,.1)",
            border: "1px solid rgba(183,121,43,.2)",
          }}
        >
          <small
            style={{
              display: "block",
              marginBottom: 4,
              color: gold,
              fontWeight: 800,
              letterSpacing: ".12em",
              textTransform: "uppercase",
            }}
          >
            Try this now
          </small>
          <span style={{ lineHeight: 1.45 }}>{state.guidance}</span>
        </div>
      ) : null}
      {state.example ? (
        <button
          type="button"
          onClick={() => setVerse(state.example ?? "")}
          style={{
            width: "100%",
            margin: "0 0 10px",
            padding: "10px 12px",
            textAlign: "left",
            borderRadius: 11,
            border: "1px dashed rgba(72,42,16,.25)",
            background: "rgba(255,255,255,.32)",
            color: ink,
            cursor: "pointer",
          }}
        >
          <small style={{ display: "block", opacity: 0.58, marginBottom: 4 }}>
            {state.exampleLabel ?? "A notebook example"} · use as a starting
            point
          </small>
          <span
            style={{
              whiteSpace: "pre-line",
              font: "italic 15px/1.45 Georgia,serif",
            }}
          >
            {state.example}
          </span>
        </button>
      ) : null}
      <textarea
        value={verse}
        onChange={(e) => setVerse(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        rows={4}
        placeholder="Name what you notice, then the change you want…"
        style={{
          boxSizing: "border-box",
          width: "100%",
          resize: "vertical",
          border: "1px solid rgba(72,42,16,.24)",
          borderRadius: 12,
          padding: 12,
          color: ink,
          background: "rgba(255,255,255,.5)",
          font: "italic 16px/1.55 Georgia,serif",
          outlineColor: gold,
        }}
      />
      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 10,
        }}
      >
        <a
          href={panelHref(state.focus, state)}
          style={{ color: "#765023", fontSize: 13 }}
        >
          See the valley ↗
        </a>
        <button
          disabled={busy || !verse.trim()}
          onClick={() => void submit()}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "9px 17px",
            background: busy ? "#a68c6d" : "#4d2b17",
            color: "#fff8e8",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {busy ? "Listening…" : "Speak"}
        </button>
      </footer>
      {answer && (
        <p
          style={{
            margin: "13px 0 0",
            padding: "10px 12px",
            borderLeft: `2px solid ${gold}`,
            background: "rgba(183,121,43,.08)",
            fontFamily: "Georgia,serif",
          }}
        >
          ✦ {answer}
        </p>
      )}
      {!answer && state.alternatives?.[0] ? (
        <p style={{ margin: "10px 0 0", opacity: 0.58, fontSize: 12 }}>
          Or {state.alternatives[0].replace(/^Ask/, "ask")}
        </p>
      ) : null}
      {error && (
        <p role="alert" style={{ color: "#9c2e24", marginBottom: 0 }}>
          {error}
        </p>
      )}
    </section>
  );
}
