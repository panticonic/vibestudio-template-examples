import ReactMarkdown from "react-markdown";
import { useEffect, useMemo, useRef, useState } from "react";
import { sceneDocument, type Scene, type Artworks } from "./index.js";
const EMPTY_ARTWORKS: Artworks = {};
export function SceneCanvas({
  scene,
  busy = false,
  onRepair,
  artworks = EMPTY_ARTWORKS,
  world = {},
  annotations = scene.annotations,
  onInspect,
}: {
  scene: Scene;
  busy?: boolean;
  onRepair: (error: string) => void;
  artworks?: Artworks;
  world?: unknown;
  annotations?: Scene["annotations"];
  onInspect?: (label: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const bounds = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 760 });
  useEffect(() => {
    if (!bounds.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(bounds.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.max(size.width / 1200, size.height / 760);
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const content = useMemo(() => {
    const token = crypto.randomUUID();
    return { token, html: sceneDocument(scene.code, token, artworks, world) };
  }, [scene.code, artworks]);
  useEffect(() => {
    setStatus("loading");
    setError("");
    setSelected(null);
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.grimoire !== content.token
      )
        return;
      if (event.data.status === "ready") setStatus("ready");
      if (event.data.status === "error") {
        setStatus("error");
        setError(String(event.data.error));
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [content]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { token: content.token, world },
      "*",
    );
  }, [world, content.token]);
  return (
    <div
      ref={bounds}
      className={`scene-canvas ${busy ? "listening" : ""}`}
      data-scene-status={status}
    >
      <iframe
        ref={frame}
        key={content.token}
        title={scene.description}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={content.html}
        onLoad={() =>
          frame.current?.contentWindow?.postMessage(
            { token: content.token, world },
            "*",
          )
        }
      />
      {annotations?.map((note, i) => (
        <button
          className={`scene-note ${note.kind}`}
          style={{
            position: "absolute",
            left: size.width / 2 + (note.x - 600) * scale,
            top: size.height / 2 + (note.y - 380) * scale,
          }}
          key={i}
          aria-label={note.label}
          aria-expanded={selected === i}
          onClick={() => {
            setSelected(selected === i ? null : i);
            if (selected !== i) onInspect?.(note.label);
          }}
        >
          <span aria-hidden="true">{note.kind === "planned" ? "◇" : "·"}</span>
          {selected === i && (
            <span
              className="scene-note-card"
              style={{
                left: `calc(50% + ${Math.max(117, Math.min(size.width - 117, size.width / 2 + (note.x - 600) * scale)) - (size.width / 2 + (note.x - 600) * scale)}px)`,
              }}
            >
              <strong>{note.label}</strong>
              <small>
                {note.kind === "planned"
                  ? "Planned · not yet completed"
                  : "Here, now"}
              </small>
              {note.detail}
            </span>
          )}
        </button>
      ))}
      {status === "error" && (
        <div className="scene-recovery" role="status">
          <p>The illustration needs a little repair.</p>
          <button disabled={busy} onClick={() => onRepair(error)}>
            Repair the illustration
          </button>
          <details>
            <summary>Drawing details</summary>
            {error}
          </details>
        </div>
      )}
    </div>
  );
}

export function StoryText({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={"story-text " + className}>
      <ReactMarkdown skipHtml>{children}</ReactMarkdown>
    </div>
  );
}
