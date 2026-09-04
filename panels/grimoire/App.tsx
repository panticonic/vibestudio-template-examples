import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { panel } from "@workspace/runtime";
import { usePanelTheme, useStateArgs } from "@workspace/react";
import type {
  CouncilCard,
  CharmKind,
  FestivalRecord,
  GrimoireView,
  NewsPage,
  Notebook,
  Overview,
  RegionId,
  RegionView,
  ScryPage,
  SpeakResult,
  SpellbookView,
  SpellRecord,
  SpiritId,
  StudyView,
  UndoneItem,
  Utterance,
} from "@workspace/grimoire-engine";
import { EstateClient, errorText } from "./lib/client.js";
import {
  circleChannelKey,
  mintApprenticeId,
  openConversation,
  seatFamiliar,
  seatSpirit,
  spiritChannelKey,
  studyChannelKey,
} from "./lib/estate.js";
import { cellAt, drawRegion, type LayerToggle } from "./lib/draw.js";
import { closeAudio, playCue } from "./lib/sound.js";
import {
  hourLabel,
  MOON_GLYPHS,
  paletteFor,
  SPIRIT_INK,
  WEATHER_LABEL,
  type Palette,
} from "./lib/palette.js";
import { shapeOf } from "./lib/verse.js";
import { installFonts } from "./lib/fonts.js";
import { HeroValley } from "./HeroValley.js";
import { ScryTeaser, Trail } from "./Trail.js";
import { Hall } from "./Hall.js";
import { Library } from "./Library.js";
import { Household } from "./Household.js";
import { useGolemSeating, useWatchDay, WatchDayButton } from "./WatchDay.js";
import "./styles.css";

type Room =
  | "valley"
  | "circle"
  | "study"
  | "grimoire"
  | "spellbook"
  | "scry"
  | "chapel"
  | "spirits"
  | "news"
  | "green";
type ScryTarget = {
  kind: "spell" | "cell" | "entity" | "spirit";
  ref: string;
  region?: RegionId;
  x?: number;
  y?: number;
};
type GrimoireArgs = {
  estateKey?: string;
  apprentice?: string;
  sound?: boolean;
  view?: string;
};

const ROOMS: Array<{
  id: Room;
  label: string;
  glyph: string;
  key: string;
  hint: string;
}> = [
  { id: "valley", label: "Valley", glyph: "⌂", key: "1", hint: "living map" },
  { id: "circle", label: "Circle", glyph: "◯", key: "2", hint: "speak magic" },
  { id: "study", label: "Study", glyph: "❧", key: "3", hint: "ask & learn" },
  {
    id: "grimoire",
    label: "Grimoire",
    glyph: "✎",
    key: "4",
    hint: "words & names",
  },
  {
    id: "spellbook",
    label: "Spellbook",
    glyph: "❦",
    key: "5",
    hint: "your verses",
  },
  { id: "scry", label: "Scrying", glyph: "◎", key: "6", hint: "read beneath" },
  {
    id: "chapel",
    label: "Chapel",
    glyph: "✟",
    key: "7",
    hint: "seals & names",
  },
  {
    id: "spirits",
    label: "Spirits",
    glyph: "✦",
    key: "8",
    hint: "bound voices",
  },
  { id: "news", label: "News", glyph: "✉", key: "9", hint: "estate journal" },
  { id: "green", label: "Green", glyph: "❀", key: "0", hint: "festivals" },
];

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function Flame({
  lit = true,
  guttering = false,
  size = 62,
}: {
  lit?: boolean;
  guttering?: boolean;
  size?: number;
}) {
  return (
    <svg
      className={cx("g-flame", guttering && "guttering", !lit && "unlit")}
      width={size}
      height={size * 1.35}
      viewBox="0 0 40 56"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="grimoire-flame-glow" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#ffb347" stopOpacity=".58" />
          <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        className="glow"
        cx="20"
        cy="40"
        rx="20"
        ry="16"
        fill="url(#grimoire-flame-glow)"
      />
      <path
        className="outer"
        d="M20 6C12 18 8 24 9 34c1 10 21 10 22 0 1-10-3-16-11-28Z"
        fill="#e2792b"
      />
      <path
        className="inner"
        d="M20 18c-4 8-6 12-5 18 1 6 9 6 10 0 1-6-1-10-5-18Z"
        fill="#ffd27a"
      />
      <path
        d="M4 48l32-4M6 44l28 6"
        stroke="#5a3a22"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FirstRun({
  client,
  apprentice,
  hasEstate,
  onDone,
}: {
  client: EstateClient;
  apprentice: string;
  hasEstate: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [step, setStep] = useState<"name" | "seating" | "letter">("name");
  const [progress, setProgress] = useState<string[]>([]);
  const [letter, setLetter] = useState("");
  const [undone, setUndone] = useState<UndoneItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const begin = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setStep("seating");
    setProgress([]);
    try {
      if (hasEstate)
        await client.call("joinEstate", {
          apprentice,
          apprenticeName: trimmed,
        });
      else
        await client.call("newEstate", { apprentice, apprenticeName: trimmed });
      const got = await client.call("letter", {});
      setLetter(got.text);
      setUndone(got.undone);
      await seatFamiliar(client, apprentice, trimmed, (line) =>
        setProgress((rows) => [...rows, line]),
      );
      setStep("letter");
    } catch (cause) {
      setError(errorText(cause));
      setStep("name");
    }
  };
  return (
    <section className="g-onboarding">
      <div className="g-onboarding-art" aria-hidden="true">
        <span className="g-orbit orbit-one" />
        <span className="g-orbit orbit-two" />
        <Flame lit={step !== "name"} guttering={step === "seating"} size={92} />
      </div>
      <div className="g-onboarding-card">
        <p className="g-eyebrow">An inheritance awaits</p>
        {step === "name" ? (
          <>
            <h1>Grimoire</h1>
            <p className="g-lede">
              You have inherited an estate. The magic is still running, and
              nobody turned it off.
            </p>
            <p className="g-muted">
              The will names you apprentice. What name shall the hearth know you
              by?
            </p>
            <form className="g-form" onSubmit={(event) => void begin(event)}>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="off"
              />
              <button className="g-primary" disabled={!name.trim()}>
                {hasEstate ? "Come home" : "Take the key"}
                <span>→</span>
              </button>
            </form>
            {error && <p className="g-error">{error}</p>}
          </>
        ) : step === "seating" ? (
          <>
            <h2>The valley wakes</h2>
            <p className="g-muted">
              A familiar moves from room to room, opening the house.
            </p>
            <ol className="g-progress">
              {progress.map((line, index) => (
                <li key={`${index}-${line}`}>
                  <span>✦</span>
                  {line}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <h2 className="g-hand">Ysolde’s letter</h2>
            <div className="g-letter">
              {letter.split("\n\n").map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </div>
            {undone.length > 0 && (
              <>
                <h3 className="g-hand">Undone</h3>
                <ul className="g-undone">
                  {undone.map((item) => (
                    <li key={item.id}>{item.text}</li>
                  ))}
                </ul>
              </>
            )}
            <button className="g-primary" onClick={onDone}>
              Go to the hearth <span>→</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function SkyBar({
  overview,
  busy,
  onAdvance,
  onWatch,
  watching,
}: {
  overview: Overview;
  busy: boolean;
  onAdvance: (ticks: number) => void;
  onWatch?: () => void;
  watching?: string | null;
}) {
  const { sky } = overview;
  const forecast = sky.forecast
    .slice(0, 2)
    .map(
      (item) =>
        `${item.name ? `${item.name}, ` : ""}${WEATHER_LABEL[item.weather] ?? item.weather} in ${item.inDays}d`,
    )
    .join(" · ");
  return (
    <header
      className={cx("g-skybar", (sky.hour >= 20 || sky.hour < 5) && "night")}
    >
      <span className="g-moon">{MOON_GLYPHS[sky.moon] ?? "🌑"}</span>
      <div className="g-skywhen">
        <strong>{hourLabel(sky.hour)}</strong>
        <small>
          day {sky.day + 1} · {sky.season} · year {sky.year}
        </small>
      </div>
      <span className="g-weather">
        {WEATHER_LABEL[sky.weather] ?? sky.weather}
        {sky.windForce > 0
          ? ` · ${sky.windDir.toUpperCase()} ${sky.windForce}`
          : ""}
      </span>
      {sky.festival && (
        <span className="g-festival">✦ {sky.festival.replace("-", " ")}</span>
      )}
      {forecast && <span className="g-forecast">{forecast}</span>}
      <span className="g-spacer" />
      <span className="g-bell">bell {sky.bell}</span>
      <button disabled={busy} onClick={() => onAdvance(1)}>
        + hour
      </button>
      <button disabled={busy} onClick={() => onAdvance(24)}>
        + day
      </button>
      {onWatch && (
        <WatchDayButton
          watching={watching ?? null}
          onWatch={onWatch}
          disabled={busy}
        />
      )}
    </header>
  );
}

function Circle({
  client,
  apprentice,
  overview,
  sound,
  initialVerse,
  focus,
  onFocus,
  onScry,
  onOpenRegion,
  onToast,
}: {
  client: EstateClient;
  apprentice: string;
  overview: Overview;
  sound: boolean;
  initialVerse: string;
  focus: { region: RegionId; x: number; y: number } | null;
  onFocus: (v: null) => void;
  onScry: (id: string) => void;
  onOpenRegion: (id: RegionId) => void;
  onToast: (text: string) => void;
}) {
  const [verse, setVerse] = useState(initialVerse);
  const [line, setLine] = useState("");
  const [kind, setKind] = useState("quiet");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<SpellRecord[]>([]);
  const [current, setCurrent] = useState<SpellRecord | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (initialVerse) setVerse(initialVerse);
  }, [initialVerse]);
  const load = useCallback(async () => {
    const book = await client.call("spellbook", { apprentice });
    const rows = await Promise.all(
      book.spells
        .slice(0, 5)
        .map((spell) => client.call("spell", { id: spell.id })),
    );
    setRecent(rows.filter((row): row is SpellRecord => Boolean(row)));
  }, [client, apprentice]);
  useEffect(() => {
    void load();
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [load]);
  const watch = (id: string) => {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      const spell = await client.call("spell", { id }).catch(() => null);
      if (spell) setCurrent(spell);
      if (
        !spell ||
        ["deliberating", "rehearsed", "heard"].includes(spell.status)
      )
        return;
      if (poll.current) clearInterval(poll.current);
      poll.current = null;
      const last = spell.margin.at(-1)?.text ?? "The valley answers.";
      setKind(spell.status);
      setLine(
        spell.status === "cast"
          ? `${last} — ${spell.receipts.filter((r) => r.status === "applied").length} changes in ${spell.scope.join(", ")}.`
          : (spell.reject?.line ?? spell.misfire?.note ?? last),
      );
      playCue(
        spell.status === "cast"
          ? "cast"
          : spell.misfire?.kind === "moths"
            ? "moths"
            : "misfire",
        sound,
      );
      void load();
    }, 1500);
  };
  const speak = async () => {
    const text = verse.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result: SpeakResult = await client.call("speak", {
        apprentice,
        verse: text,
        room: "circle",
        focusCell: focus ?? undefined,
      });
      if (result.kind === "deliberating") {
        setLine("The familiar carries your words beneath the page…");
        setKind("deliberating");
        setVerse("");
        setCurrent(null);
        if (result.spellId) watch(result.spellId);
      } else {
        if (result.spellId) {
          const spell = await client
            .call("spell", { id: result.spellId })
            .catch(() => null);
          if (spell) setCurrent(spell);
        }
        setKind(result.kind);
        setLine(
          result.line ??
            (result.kind === "instant"
              ? "The valley answers."
              : "Nobody is at the hearth."),
        );
        if (result.kind === "instant") {
          setVerse("");
          playCue("cast", sound);
        }
      }
    } catch (cause) {
      setKind("error");
      setLine(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const shape = shapeOf(verse);
  return (
    <section className="g-circle g-room-page">
      <aside>
        <Flame
          lit={overview.firstHour.hearthLit}
          guttering={kind === "deliberating"}
          size={76}
        />
        <span>the margin</span>
        <Trail spell={current} guttering={kind === "deliberating"} />
      </aside>
      <div className="g-writing">
        <p className="g-eyebrow">The circle</p>
        <h2>Speak into the estate</h2>
        <p className="g-muted">
          Two lines are plenty. The familiar listens for names, places,
          materials, and intent.
        </p>
        {focus && (
          <div className="g-focus">
            Speaking of{" "}
            <strong>
              {focus.region} {focus.x},{focus.y}
            </strong>
            <button onClick={() => onFocus(null)}>clear</button>
          </div>
        )}
        <textarea
          value={verse}
          onChange={(event) => setVerse(event.target.value)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              void speak();
            }
          }}
          placeholder="small fire, wake and warm this room…"
          rows={5}
        />
        <div className="g-compose-meta">
          <span>
            {shape.lines.length} lines · {shape.words} words{" "}
            {shape.hint ? `· ${shape.hint}` : ""}
          </span>
          <button
            className="g-primary"
            disabled={busy || !verse.trim()}
            onClick={() => void speak()}
          >
            {busy ? "Listening…" : "Speak"}
          </button>
        </div>
        {line && (
          <div className={cx("g-response", kind)}>
            <span>✦</span>
            <p>{line}</p>
          </div>
        )}
        {current && kind !== "deliberating" && (
          <ScryTeaser
            spell={current}
            onScry={onScry}
            onLook={(region) => onOpenRegion(region as RegionId)}
          />
        )}
        {recent.length > 0 && (
          <div className="g-recent">
            <h3>Lately spoken</h3>
            {recent.map((spell) => (
              <button key={spell.id} onClick={() => onScry(spell.id)}>
                <span>{spell.lines[0]}</span>
                <small>{spell.name ?? spell.status}</small>
              </button>
            ))}
          </div>
        )}
        <button
          className="g-text-action"
          onClick={() =>
            void openConversation(
              circleChannelKey(client.estateKey, apprentice),
            ).catch((cause) => onToast(errorText(cause)))
          }
        >
          Open the familiar’s conversation →
        </button>
      </div>
    </section>
  );
}

const REGION_LAYERS: LayerToggle[] = [
  "water",
  "growth",
  "rot",
  "light",
  "heat",
  "ether",
  "wind",
];
const CHARMS: Array<{ kind: CharmKind; label: string; colour?: string }> = [
  { kind: "lantern", label: "Lantern", colour: "#ffd27a" },
  { kind: "mist", label: "Mist", colour: "#c9d8e8" },
  { kind: "moths", label: "Moths" },
  { kind: "petals", label: "Petals", colour: "#e7a4b8" },
  { kind: "chime", label: "Chime" },
  { kind: "sigil", label: "Dusk mark" },
];

function RegionExplorer({
  initial,
  client,
  apprentice,
  palette,
  onBack,
  onScry,
  onFocus,
  onToast,
}: {
  initial: RegionView;
  client: EstateClient;
  apprentice: string;
  palette: Palette;
  onBack: () => void;
  onScry: (target: ScryTarget) => void;
  onFocus: (cell: { region: RegionId; x: number; y: number }) => void;
  onToast: (text: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const previous = useRef(initial.region);
  const transitionStarted = useRef(performance.now());
  const [view, setView] = useState(initial);
  const [layers, setLayers] = useState<Set<LayerToggle>>(
    () => new Set(["water", "growth", "rot", "light", "ether"]),
  );
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [focus, setLocalFocus] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [charming, setCharming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setView(initial);
    previous.current = initial.region;
    transitionStarted.current = performance.now();
  }, [initial]);
  useEffect(() => {
    const timer = setInterval(() => {
      void client
        .call("region", { id: view.region.id })
        .then((next) => {
          setView((current) => {
            previous.current = current.region;
            transitionStarted.current = performance.now();
            return next;
          });
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [client, view.region.id]);
  useEffect(() => {
    let frame = 0;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const paint = (clock: number) => {
      if (canvas.current)
        drawRegion(canvas.current, view, {
          palette,
          layers,
          blend: reduced
            ? 1
            : Math.min(1, (clock - transitionStarted.current) / 600),
          previous: previous.current,
          hover,
          focus,
          wards: view.wards,
          clock,
          windDir: view.sky.windDir,
          windForce: view.sky.windForce,
          reducedMotion: reduced,
        });
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [view, palette, layers, hover, focus]);

  const point = (clientX: number, clientY: number) =>
    canvas.current
      ? cellAt(canvas.current, view.region, clientX, clientY)
      : null;
  const selected = focus ?? hover;
  const cellIndex = selected ? selected.y * view.region.w + selected.x : null;
  const entity = selected
    ? view.entities.find((row) => row.x === selected.x && row.y === selected.y)
    : null;
  const ward =
    cellIndex === null
      ? null
      : view.wards.find((row) => row.cells.includes(cellIndex));
  const mark = cellIndex === null ? null : view.region.marks[String(cellIndex)];
  const adorn =
    cellIndex === null ? null : view.region.adorns[String(cellIndex)];
  const leaveCharm = async (charm: (typeof CHARMS)[number]) => {
    if (!focus) return;
    setBusy(true);
    try {
      await client.call("adorn", {
        apprentice,
        cell: { region: view.region.id, ...focus },
        charm: {
          kind: charm.kind,
          ...(charm.colour
            ? { colour: charm.colour }
            : charm.kind === "sigil"
              ? { colour: palette.accent }
              : {}),
        },
      });
      setView(await client.call("region", { id: view.region.id }));
      setCharming(false);
      onToast(`${charm.label} left at ${focus.x}, ${focus.y}.`);
    } catch (cause) {
      onToast(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="g-region-explorer">
      <header className="g-region-head">
        <button className="g-back" onClick={onBack}>
          ← Valley
        </button>
        <RoomTitle
          eyebrow={`${view.region.w} × ${view.region.h} cells · ${view.sky.windDir} wind`}
          title={view.region.name}
          aside={`${view.entities.length} living · ${view.wards.length} wards`}
        />
      </header>
      <div className="g-layer-strip" aria-label="Map inks">
        <span>Show ink</span>
        {REGION_LAYERS.map((layer) => (
          <button
            className={layers.has(layer) ? "active" : ""}
            key={layer}
            onClick={() =>
              setLayers((current) => {
                const next = new Set(current);
                if (next.has(layer)) next.delete(layer);
                else next.add(layer);
                return next;
              })
            }
          >
            {layer}
          </button>
        ))}
      </div>
      <div className="g-region-canvas-wrap">
        <canvas
          ref={canvas}
          onMouseMove={(event) => setHover(point(event.clientX, event.clientY))}
          onMouseLeave={() => setHover(null)}
          onClick={(event) => {
            const next = point(event.clientX, event.clientY);
            setLocalFocus(next);
            setCharming(false);
            if (next) onFocus({ region: view.region.id, x: next.x, y: next.y });
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            const next = point(event.clientX, event.clientY);
            setLocalFocus(next);
            setCharming(Boolean(next));
          }}
          aria-label={`Living map of ${view.region.name}`}
        />
        <div className="g-map-caption">
          <span>
            {selected ? `${selected.x}, ${selected.y}` : "Move across the map"}
          </span>
          <span>Click to focus · right-click to leave a charm</span>
        </div>
      </div>
      {selected && (
        <aside className="g-cell-inspector">
          <header>
            <div>
              <p className="g-eyebrow">
                Cell {selected.x}, {selected.y}
              </p>
              <h3>
                {entity?.name ?? adorn?.label ?? mark?.sigil ?? "Living earth"}
              </h3>
            </div>
            <button onClick={() => setLocalFocus(null)}>×</button>
          </header>
          {entity && (
            <p>
              {entity.sub} · {entity.last || "quiet just now"}
            </p>
          )}
          {ward && (
            <p>
              ◌ {ward.name ?? ward.id} · {ward.stale ? "stale" : "holding"}
            </p>
          )}
          {mark && (
            <p>
              {mark.sigil} · marked by {mark.by}
            </p>
          )}
          {adorn && (
            <p>
              ✦ {adorn.kind} · left by {adorn.by}
            </p>
          )}
          <div className="g-actions">
            <button
              onClick={() =>
                onScry({
                  kind: entity ? "entity" : ward || mark ? "spell" : "cell",
                  ref:
                    entity?.name ?? ward?.id ?? mark?.spellId ?? view.region.id,
                  region: view.region.id,
                  x: selected.x,
                  y: selected.y,
                })
              }
            >
              Scry here
            </button>
            <button onClick={() => setCharming((value) => !value)}>
              Leave a charm
            </button>
          </div>
          {charming && (
            <div className="g-charm-palette">
              {CHARMS.map((charm) => (
                <button
                  disabled={busy || !focus}
                  key={charm.kind}
                  onClick={() => void leaveCharm(charm)}
                >
                  {charm.label}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
      {view.region.ailments.length > 0 && (
        <div className="g-ailment-ribbon">
          {view.region.ailments.map((ailment, index) => (
            <span key={`${ailment.kind}-${index}`} title={ailment.note}>
              {ailment.kind} {Math.round(ailment.severity)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function StudyRoom({
  client,
  apprentice,
  onEcho,
  onToast,
}: {
  client: EstateClient;
  apprentice: string;
  onEcho: (verse: string) => void;
  onToast: (text: string) => void;
}) {
  const [view, setView] = useState<StudyView | null>(null);
  const [letter, setLetter] = useState("");
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [tab, setTab] = useState<
    "notebooks" | "stories" | "words" | "letter" | "library"
  >("notebooks");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      client.call("study", { apprentice }),
      client.call("letter", {}),
    ])
      .then(([next, firstLetter]) => {
        if (!active) return;
        setView(next);
        setLetter(firstLetter.text);
      })
      .catch((cause) => active && setError(errorText(cause)));
    return () => {
      active = false;
    };
  }, [client, apprentice]);
  const openNotebook = async (id: string) => {
    try {
      setError(null);
      setNotebook(await client.call("notebook", { id, apprentice }));
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  return (
    <section className="g-content g-study">
      <RoomTitle eyebrow="A quiet room for prose" title="The Study" />
      <div className="g-study-toolbar">
        <nav className="g-segments">
          {(
            ["notebooks", "stories", "words", "letter", "library"] as const
          ).map((id) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => {
                setTab(id);
                if (id !== "notebooks") setNotebook(null);
              }}
            >
              {id}
            </button>
          ))}
        </nav>
        <button
          className="g-primary"
          onClick={() =>
            void openConversation(
              studyChannelKey(client.estateKey, apprentice),
            ).catch((cause) => onToast(errorText(cause)))
          }
        >
          Speak with the familiar ↗
        </button>
      </div>
      {error && <p className="g-error">{error}</p>}
      {tab === "library" ? (
        <Library client={client} />
      ) : tab === "letter" ? (
        <article className="g-study-letter g-hand">{letter}</article>
      ) : tab === "stories" ? (
        <div className="g-story-grid">
          {view?.stories.map((story) => (
            <article className="g-card" key={story.id}>
              <p className="g-eyebrow">
                Year {story.year} · {story.about}
              </p>
              <h3>{story.title}</h3>
              <p>{story.text}</p>
              {story.unlocks && <small>Reveals {story.unlocks}</small>}
            </article>
          ))}
        </div>
      ) : tab === "words" ? (
        <div className="g-card-grid">
          {Object.entries(view?.wordsExplained ?? {}).map(([word, meaning]) => (
            <article className="g-word-card" key={word}>
              <strong>{word}</strong>
              <p>{meaning}</p>
            </article>
          ))}
        </div>
      ) : notebook ? (
        <div className="g-open-notebook">
          <button className="g-back" onClick={() => setNotebook(null)}>
            ← Return to the shelves
          </button>
          <RoomTitle
            eyebrow={notebook.era}
            title={notebook.title}
            aside={notebook.author}
          />
          {notebook.pages.map((page) => (
            <article className="g-notebook-page" key={page.n}>
              <span>{page.n}</span>
              <p>{page.text}</p>
              {page.verses.map((verse, index) => (
                <blockquote key={index}>
                  {verse.lines.map((line, lineIndex) => (
                    <span key={lineIndex}>{line}</span>
                  ))}
                  <footer>
                    <small>{verse.about}</small>
                    {verse.echoable && (
                      <button onClick={() => onEcho(verse.lines.join("\n"))}>
                        Echo in the circle →
                      </button>
                    )}
                  </footer>
                </blockquote>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <div className="g-bookshelf">
          {view?.notebooks.map((book) => (
            <button
              key={book.id}
              disabled={book.locked && book.id === "corwen"}
              onClick={() => void openNotebook(book.id)}
            >
              <span>{book.pages}</span>
              <strong>{book.title}</strong>
              <small>
                {book.author} · {book.era}
              </small>
              {book.missingPages ? (
                <em>{book.missingPages} pages missing</em>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function DataRoom({
  room,
  client,
  apprentice,
  overview,
  target,
  onScry,
  onRegion,
  onEcho,
  onToast,
}: {
  room: Exclude<Room, "valley" | "circle">;
  client: EstateClient;
  apprentice: string;
  overview: Overview;
  target: ScryTarget | null;
  onScry: (target: ScryTarget) => void;
  onRegion: (id: RegionId) => void;
  onEcho: (verse: string) => void;
  onToast: (text: string) => void;
}) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("undone");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      if (room === "grimoire")
        setData(await client.call("grimoire", { apprentice }));
      else if (room === "spellbook")
        setData(await client.call("spellbook", { apprentice }));
      else if (room === "chapel")
        setData({
          cards: await client.call("council", {}),
          shelf: await client.call("notebook", { id: "household", apprentice }),
          book: await client.call("grimoire", { apprentice }),
        });
      else if (room === "news") {
        const out = await client.call("news", { apprentice, limit: 30 });
        setData(out.pages);
        const unread = out.pages.filter((p) => !p.read).map((p) => p.id);
        if (unread.length)
          await client.call("acknowledgeNews", { apprentice, pageIds: unread });
      } else if (room === "scry" && target) {
        const out = await client.call("scry", { apprentice, ...target });
        setData(out);
      } else if (room === "spirits") setData(null);
      else if (room === "green")
        setData({
          festivals: await client.call("festivals", {}),
          charms: (
            await client.call("spellbook", { apprentice })
          ).spells.filter(
            (spell) => spell.tier === "charm" && spell.status === "cast",
          ),
        });
      else setData(null);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [room, client, apprentice, target]);
  useEffect(() => {
    void load();
    if (room === "scry") return;
    const timer = setInterval(() => void load(), 7000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (target) setQuery(target.ref);
  }, [target]);
  const action = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (cause) {
      onToast(errorText(cause));
    } finally {
      setBusy(null);
    }
  };
  if (room === "spirits")
    return (
      <Spirits
        client={client}
        apprentice={apprentice}
        overview={overview}
        onScry={onScry}
        onToast={onToast}
      />
    );
  if (room === "news")
    return (
      <News
        pages={(data as NewsPage[] | null) ?? []}
        error={error}
        onRegion={onRegion}
      />
    );
  if (room === "study")
    return (
      <StudyRoom
        client={client}
        apprentice={apprentice}
        onEcho={onEcho}
        onToast={onToast}
      />
    );
  if (room === "spellbook")
    return (
      <Spellbook
        view={data as SpellbookView | null}
        busy={busy}
        onAction={action}
        client={client}
        apprentice={apprentice}
        onScry={onScry}
        onToast={onToast}
      />
    );
  if (room === "grimoire")
    return (
      <GrimoireBook
        view={data as GrimoireView | null}
        overview={overview}
        tab={tab}
        setTab={setTab}
        onRegion={onRegion}
        onScry={onScry}
        onAdd={(text) =>
          action("add-undone", () =>
            client.call("addUndone", { apprentice, text }),
          )
        }
      />
    );
  if (room === "chapel")
    return (
      <Chapel
        data={
          data as {
            cards: CouncilCard[];
            shelf: Notebook;
            book: GrimoireView;
          } | null
        }
        overview={overview}
        apprentice={apprentice}
        action={action}
        client={client}
        onToast={onToast}
      />
    );
  if (room === "scry")
    return (
      <section className="g-content">
        <RoomTitle eyebrow="Read beneath the words" title="Scrying" />
        <form
          className="g-search"
          onSubmit={(e) => {
            e.preventDefault();
            const ref = query.trim();
            if (!ref) return;
            onScry({
              kind: ref.startsWith("s-")
                ? "spell"
                : overview.spirits.some((spirit) => spirit.id === ref)
                  ? "spirit"
                  : "entity",
              ref,
            });
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Spell id, creature, or spirit"
          />
          <button className="g-primary">Scry</button>
        </form>
        {error && <p className="g-error">{error}</p>}
        {data !== null && <ScryResult page={data as ScryPage} />}
      </section>
    );
  if (room === "green")
    return (
      <section className="g-content">
        <RoomTitle eyebrow="Gather beneath the bell" title="The Green" />
        <p className="g-muted">
          Four festivals mark the estate’s year. Charms are entered here and the
          bound spirits judge them in their own words.
        </p>
        <div className="g-card-grid">
          {((data as { festivals: FestivalRecord[] } | null)?.festivals ?? [])
            .slice()
            .reverse()
            .map((festival) => (
              <article
                className="g-card"
                key={`${festival.id}-${festival.year}`}
              >
                <span className="g-card-icon">❀</span>
                <h3>{festival.id.replace("-", " ")}</h3>
                <small>
                  year {festival.year} · judged by {festival.judge}
                </small>
                <p>{festival.verdict ?? "Awaiting its hour."}</p>
              </article>
            ))}
        </div>
        <section className="g-section g-festival-entry">
          <p className="g-eyebrow">Offer a charm to the present festival</p>
          <h3>Your eligible charms</h3>
          <div className="g-actions">
            {(
              (data as { charms: SpellbookView["spells"] } | null)?.charms ?? []
            ).map((spell) => (
              <button
                disabled={busy !== null}
                key={spell.id}
                onClick={() =>
                  void action(`festival-${spell.id}`, async () => {
                    const result = await client.call("enterFestival", {
                      apprentice,
                      spellId: spell.id,
                    });
                    onToast(
                      result.ok
                        ? "Entered. The judge will speak when the festival ends."
                        : (result.reason ?? "The charm was not entered."),
                    );
                  })
                }
              >
                {spell.name ?? spell.lines[0]}
              </button>
            ))}
          </div>
        </section>
      </section>
    );
  return null;
}

function RoomTitle({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: string;
  aside?: string;
}) {
  return (
    <header className="g-room-title">
      <div>
        <p className="g-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {aside && <span>{aside}</span>}
    </header>
  );
}

function GrimoireBook({
  view,
  overview,
  tab,
  setTab,
  onRegion,
  onScry,
  onAdd,
}: {
  view: GrimoireView | null;
  overview: Overview;
  tab: string;
  setTab: (tab: string) => void;
  onRegion: (id: RegionId) => void;
  onScry: (target: ScryTarget) => void;
  onAdd: (text: string) => Promise<void>;
}) {
  const [newItem, setNewItem] = useState("");
  return (
    <section className="g-content">
      <RoomTitle
        eyebrow="The inherited record"
        title="The Grimoire"
        aside={`${view?.known.length ?? 0} words known`}
      />
      <nav className="g-segments">
        {["undone", "words", "names", "bindings"].map((id) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            {id}
          </button>
        ))}
      </nav>
      {tab === "undone" ? (
        <div className="g-undone-sheet">
          {overview.undone.map((item) => (
            <div
              className={cx("g-undone-row", item.done && "done")}
              key={item.id}
            >
              <span>○</span>
              <p>{item.text}</p>
              {item.region && (
                <button onClick={() => onRegion(item.region!)}>look</button>
              )}
            </div>
          ))}
          <form
            className="g-add-undone"
            onSubmit={(event) => {
              event.preventDefault();
              const text = newItem.trim();
              if (!text) return;
              void onAdd(text).then(() => setNewItem(""));
            }}
          >
            <span>✎</span>
            <input
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Add a line in your own hand"
            />
            <button disabled={!newItem.trim()}>Add</button>
          </form>
        </div>
      ) : tab === "words" ? (
        <div className="g-card-grid">
          {view?.known.map((word) => (
            <article className="g-word-card" key={word.id}>
              <strong>{word.root ?? "···"}</strong>
              <span>{word.id}</span>
              <p>{word.gloss}</p>
              <small>
                {word.family}
                {word.learnedFrom ? ` · ${word.learnedFrom}` : ""}
              </small>
            </article>
          ))}
        </div>
      ) : tab === "names" ? (
        <div className="g-card-grid">
          {view?.names.map((name) => (
            <article className="g-word-card name" key={name.name}>
              <strong>{name.name}</strong>
              <p>{name.meaning}</p>
              <small>{name.kind}</small>
            </article>
          ))}
          {view?.foci.map((focus) => (
            <article
              className={cx("g-word-card", focus.broken && "broken")}
              key={focus.id}
            >
              <strong>{focus.name}</strong>
              <p>{focus.concepts.join(", ")}</p>
              <small>
                {focus.broken ? "broken" : "whole"} · {focus.madeBy}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <div className="g-list">
          {view?.active.map((binding) => (
            <article key={binding.id}>
              <div>
                <strong>{binding.name ?? binding.id}</strong>
                <small>
                  {binding.tier} · upkeep {binding.upkeep}
                  {binding.region ? ` · ${binding.region}` : ""}
                </small>
              </div>
              <button
                onClick={() => onScry({ kind: "spell", ref: binding.id })}
              >
                scry
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Spellbook({
  view,
  busy,
  onAction,
  client,
  apprentice,
  onScry,
  onToast,
}: {
  view: SpellbookView | null;
  busy: string | null;
  onAction: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  client: EstateClient;
  apprentice: string;
  onScry: (target: ScryTarget) => void;
  onToast: (text: string) => void;
}) {
  return (
    <section className="g-content">
      <RoomTitle
        eyebrow="What answered you"
        title="The Spellbook"
        aside={`${view?.spells.length ?? 0} verses`}
      />
      {!view?.spells.length && (
        <div className="g-empty">
          <span>❦</span>
          <h3>No spells written yet</h3>
          <p>
            Cast a verse in the circle. Once the valley answers, its writing
            appears here.
          </p>
        </div>
      )}
      <div className="g-spell-grid">
        {view?.spells.map((spell) => (
          <article
            className={cx(
              "g-spell-card",
              spell.status,
              spell.variantOf && "variant",
            )}
            key={spell.id}
          >
            <header>
              <div>
                <p>
                  {spell.tier}
                  {spell.region ? ` · ${spell.region}` : ""}
                </p>
                <h3>{spell.name ?? "Unnamed verse"}</h3>
              </div>
              {spell.fromCache && <span className="g-sigil">✧</span>}
            </header>
            <blockquote>
              {spell.lines.map((line, index) => (
                <span key={index}>{line}</span>
              ))}
            </blockquote>
            <footer>
              <small>
                {spell.status}
                {spell.firings ? ` · fired ${spell.firings}×` : ""}
              </small>
              <div>
                {spell.instant && spell.status === "cast" && !spell.firings && (
                  <button
                    disabled={busy === spell.id}
                    onClick={() =>
                      void onAction(spell.id, async () => {
                        const result = await client.call("recast", {
                          apprentice,
                          spellId: spell.id,
                        });
                        onToast(
                          result.ok
                            ? "Spoken again."
                            : (result.reason ?? "The world did not hear it."),
                        );
                      })
                    }
                  >
                    cast again
                  </button>
                )}
                {spell.status === "cast" && spell.firings > 0 && (
                  <button
                    disabled={busy === spell.id}
                    onClick={() =>
                      void onAction(spell.id, () =>
                        client.call("release", {
                          apprentice,
                          spellId: spell.id,
                        }),
                      )
                    }
                  >
                    release
                  </button>
                )}
                <button
                  disabled={busy === spell.id}
                  onClick={() =>
                    void onAction(`shelve-${spell.id}`, () =>
                      client.call("shelve", {
                        apprentice,
                        spellId: spell.id,
                        shelved: !spell.shelved,
                      }),
                    )
                  }
                >
                  {spell.shelved ? "unshelve" : "shelve"}
                </button>
                <button
                  onClick={() => onScry({ kind: "spell", ref: spell.id })}
                >
                  scry
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function Chapel({
  data,
  overview,
  apprentice,
  action,
  client,
  onToast,
}: {
  data: { cards: CouncilCard[]; shelf: Notebook; book: GrimoireView } | null;
  overview: Overview;
  apprentice: string;
  action: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  client: EstateClient;
  onToast?: (text: string) => void;
}) {
  const wall = [
    "Hamanith",
    "Velharan",
    "Thesaurin",
    "Hahamadath",
    "Doranvel",
    "Tantanoes",
    "Lumevitre",
    "Saelolath",
    "Morithedor",
    "Ossnem",
    "Norael",
    "Aenithil",
  ];
  const known = new Set(data?.book.names.map((name) => name.name));
  return (
    <section className="g-content">
      <RoomTitle eyebrow="Seals, shelves, true names" title="The Chapel" />
      <Household
        client={client}
        apprentice={apprentice}
        overview={overview}
        onToast={onToast ?? (() => undefined)}
      />
      <div className="g-section">
        <h3>Council cards</h3>
        <div className="g-card-stack">
          {data?.cards
            .filter((card) => card.status !== "withdrawn")
            .map((card) => (
              <article className="g-council-card" key={card.id}>
                <header>
                  <span className="g-sigil">✦</span>
                  <div>
                    <h3>{card.title}</h3>
                    <small>
                      {card.status} · cost {card.cost} ether
                    </small>
                  </div>
                </header>
                <p>{card.summary}</p>
                <div className="g-seals">
                  {card.needs.map((id) => (
                    <span className={card.seals[id] ? "set" : ""} key={id}>
                      {card.seals[id] ? "✦" : "○"}{" "}
                      {overview.apprentices.find((row) => row.id === id)
                        ?.name ?? id}
                    </span>
                  ))}
                </div>
                {card.status === "open" &&
                  card.needs.includes(apprentice) &&
                  !card.seals[apprentice] && (
                    <div className="g-actions">
                      <button
                        className="g-primary"
                        onClick={() =>
                          void action(card.id, () =>
                            client.call("seal", {
                              apprentice,
                              cardId: card.id,
                              seal: true,
                            }),
                          )
                        }
                      >
                        Set my seal
                      </button>
                      <button
                        onClick={() =>
                          void action(card.id, () =>
                            client.call("seal", {
                              apprentice,
                              cardId: card.id,
                              seal: false,
                            }),
                          )
                        }
                      >
                        Withhold
                      </button>
                    </div>
                  )}
              </article>
            ))}
        </div>
      </div>
      <div className="g-section">
        <h3>The walls</h3>
        <div className="g-name-wall">
          {wall.map((name) => (
            <span className={known.has(name) ? "known" : ""} key={name}>
              {known.has(name) ? name : "······"}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function News({
  pages,
  error,
  onRegion,
}: {
  pages: NewsPage[];
  error: string | null;
  onRegion: (id: RegionId) => void;
}) {
  return (
    <section className="g-content">
      <RoomTitle
        eyebrow="Written while you were away"
        title="The Estate’s News"
        aside={`${pages.length} pages`}
      />
      {error && <p className="g-error">{error}</p>}
      {pages.length === 0 && (
        <div className="g-empty">
          <span>✉</span>
          <h3>The page is quiet</h3>
          <p>
            Let a day pass. Spirits, wards, and persistent spells write here
            while you are away.
          </p>
        </div>
      )}
      <div className="g-news-stack">
        {pages.map((page) => (
          <article
            className={cx("g-news-page", !page.read && "unread")}
            key={page.id}
          >
            <header>
              Day {page.day + 1} of {page.season}, year {page.year}
            </header>
            {page.items.map((item, index) => (
              <div
                className={cx("g-news-line", `rung-${item.rung}`)}
                key={index}
              >
                <span>{item.hand === "familiar" ? "❧" : "✦"}</span>
                <p>{item.text}</p>
                {item.region && (
                  <button onClick={() => onRegion(item.region!)}>look</button>
                )}
              </div>
            ))}
            {page.oneThing && (
              <footer>
                <strong>One small thing</strong>
                <span>{page.oneThing.text}</span>
                {page.oneThing.region && (
                  <button onClick={() => onRegion(page.oneThing!.region!)}>
                    go
                  </button>
                )}
              </footer>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Spirits({
  client,
  apprentice,
  overview,
  onScry,
  onToast,
}: {
  client: EstateClient;
  apprentice: string;
  overview: Overview;
  onScry: (target: ScryTarget) => void;
  onToast: (text: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [verses, setVerses] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<Utterance[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async (id: SpiritId) =>
    setSaid(await client.call("utterances", { spirit: id }).catch(() => []));
  const speak = async (id: SpiritId) => {
    const verse = (verses[id] ?? "").trim();
    if (!verse) return;
    setBusy(true);
    try {
      await seatSpirit(client, id, apprentice);
      const result = await client.call("address", {
        apprentice,
        spirit: id,
        verse,
      });
      onToast(
        result.ok
          ? "Spoken. The spirit will answer in its hour."
          : (result.reason ?? "It turned away."),
      );
      if (result.ok) setVerses((all) => ({ ...all, [id]: "" }));
      await load(id);
    } catch (cause) {
      onToast(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="g-content">
      <RoomTitle eyebrow="Voices bound to place" title="The Spirits" />
      <p className="g-muted">
        Each wakes in its own hour. They hear verse; prose passes through them
        like wind.
      </p>
      <Hall
        client={client}
        apprentice={apprentice}
        overview={overview}
        onToast={onToast}
      />
      <div className="g-spirit-grid">
        {overview.spirits.map((spirit) => {
          const ink = SPIRIT_INK[spirit.id as SpiritId] ?? {
            colour: "#888",
            ornament: "✦",
          };
          return (
            <article
              className={cx("g-spirit-card", !spirit.awake && "asleep")}
              style={{ "--spirit": ink.colour } as CSSProperties}
              key={spirit.id}
            >
              <header>
                <span>{ink.ornament}</span>
                <div>
                  <h3>{spirit.title}</h3>
                  <p>{spirit.awake ? spirit.wants : "Has not spoken yet"}</p>
                </div>
                <small>{spirit.hour}</small>
              </header>
              {open === spirit.id ? (
                <div className="g-spirit-talk">
                  {said.slice(-5).map((utterance, index) => (
                    <p key={index}>
                      <strong>
                        {utterance.by === apprentice ? "you" : spirit.title}
                      </strong>
                      {utterance.verse}
                    </p>
                  ))}
                  <textarea
                    rows={3}
                    value={verses[spirit.id] ?? ""}
                    onChange={(event) =>
                      setVerses((all) => ({
                        ...all,
                        [spirit.id]: event.target.value,
                      }))
                    }
                    placeholder={`Verse for ${spirit.title}`}
                  />
                  <div className="g-actions">
                    <button
                      className="g-primary"
                      disabled={busy}
                      onClick={() => void speak(spirit.id as SpiritId)}
                    >
                      Speak
                    </button>
                    <button
                      onClick={() =>
                        void openConversation(
                          spiritChannelKey(
                            client.estateKey,
                            spirit.id as SpiritId,
                          ),
                        ).catch((cause) => onToast(errorText(cause)))
                      }
                    >
                      Conversation
                    </button>
                    <button
                      onClick={() => onScry({ kind: "spirit", ref: spirit.id })}
                    >
                      Scry
                    </button>
                    <button onClick={() => setOpen(null)}>Close</button>
                  </div>
                </div>
              ) : (
                <button
                  className="g-open-card"
                  onClick={() => {
                    setOpen(spirit.id);
                    void load(spirit.id as SpiritId);
                  }}
                >
                  Approach <span>→</span>
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ScryResult({ page }: { page: ScryPage }) {
  if ("error" in page) return <p className="g-error">{String(page.error)}</p>;
  return (
    <article className="g-scry-page">
      <header>
        <div>
          <p className="g-eyebrow">
            {page.spell.tier} · {page.spell.status}
          </p>
          <h3>{page.spell.name ?? "A spell without a name"}</h3>
        </div>
        <span className="g-sigil">◎</span>
      </header>
      <blockquote>
        {page.spell.lines.map((line, index) => (
          <span key={index}>{line}</span>
        ))}
      </blockquote>
      {page.spell.intent && (
        <p className="g-muted">
          {page.spell.intent.effect} · {page.spell.intent.subject.kind}
        </p>
      )}
      {page.spell.writing && <pre>{page.spell.writing}</pre>}
      <footer>
        {page.casterName} · tick {page.spell.castTick ?? page.spell.createdTick}
      </footer>
    </article>
  );
}

export default function GrimoirePanel() {
  const theme = usePanelTheme();
  const args = useStateArgs<GrimoireArgs>();
  const estateKey = (args.estateKey ?? "main").trim() || "main";
  const client = useMemo(() => new EstateClient(estateKey), [estateKey]);
  const [apprentice, setApprentice] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [firstRun, setFirstRun] = useState<"unknown" | "needed" | "done">(
    "unknown",
  );
  const [room, setRoom] = useState<Room>("valley");
  const [region, setRegion] = useState<RegionView | null>(null);
  const [openRegion, setOpenRegion] = useState<RegionId | null>(null);
  const [focus, setFocus] = useState<{
    region: RegionId;
    x: number;
    y: number;
  } | null>(null);
  const [scryTarget, setScryTarget] = useState<ScryTarget | null>(null);
  const [draftVerse, setDraftVerse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sound = args.sound === true;
  const currentArgs = useRef(args);
  currentArgs.current = args;
  const initialArgs = useRef(args);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const seatGolems = useGolemSeating(client, apprentice, say);
  const refresh = useCallback(
    async (id = apprentice) => {
      if (!id) return;
      try {
        const next = await client.call("overview", { apprentice: id });
        void seatGolems(next);
        setOverview((previous) => {
          if (previous) {
            if (!previous.firstHour.hearthLit && next.firstHour.hearthLit)
              playCue("hearth", sound);
            if (previous.news.unread < next.news.unread) playCue("page", sound);
            const still = (ov: Overview) =>
              ov.regions
                .find((r) => r.id === "mill")
                ?.ailments.some((a) => a.kind === "still");
            if (still(previous) && !still(next)) playCue("wheel", sound);
            const flooded = (ov: Overview) =>
              ov.regions
                .find((r) => r.id === "orchard")
                ?.ailments.some((a) => a.kind === "flooded");
            if (flooded(previous) && !flooded(next)) playCue("river", sound);
            if (
              previous.sky.weather !== "storm" &&
              next.sky.weather === "storm"
            )
              playCue("wind", sound);
          }
          return next;
        });
        setError(null);
      } catch (cause) {
        const text = errorText(cause);
        if (/No estate has been founded/.test(text)) setFirstRun("needed");
        else setError(text);
      }
    },
    [client, apprentice, sound, seatGolems],
  );
  const { watching, watchDay } = useWatchDay(client, () => refresh(), setError);
  const navigate = useCallback((next: Room) => {
    setRoom(next);
    void panel.stateArgs.set({ ...currentArgs.current, view: next });
  }, []);
  useEffect(() => {
    installFonts();
    let active = true;
    void (async () => {
      const bootArgs = initialArgs.current;
      let id = bootArgs.apprentice?.trim() || "";
      if (!id) {
        id = mintApprenticeId();
        await panel.stateArgs.set({ ...bootArgs, apprentice: id });
      }
      if (!active) return;
      setApprentice(id);
      try {
        const next = await client.call("overview", { apprentice: id });
        if (!active) return;
        setOverview(next);
        const known = next.apprentices.some((row) => row.id === id);
        setFirstRun(known ? "done" : "needed");
        if (known) {
          await client.call("presence", { apprentice: id, present: true });
          if (ROOMS.some((entry) => entry.id === bootArgs.view))
            setRoom(bootArgs.view as Room);
        }
      } catch (cause) {
        if (active) {
          setFirstRun("needed");
          if (!/No estate/.test(errorText(cause))) setError(errorText(cause));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!apprentice) return;
    return () => {
      closeAudio();
      void client.call("presence", { apprentice, present: false });
    };
  }, [client, apprentice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "Escape") {
        if (openRegion) {
          setOpenRegion(null);
          setRegion(null);
        } else navigate("valley");
        return;
      }
      const found = ROOMS.find((entry) => entry.key === event.key);
      if (found && !event.metaKey && !event.ctrlKey && !event.altKey)
        navigate(found.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, openRegion]);
  const enter = async (id: RegionId) => {
    setOpenRegion(id);
    setRegion(null);
    try {
      setRegion(await client.call("region", { id }));
      if (apprentice)
        await client.call("presence", {
          apprentice,
          present: true,
          region: id,
        });
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  const scry = (target: ScryTarget) => {
    setScryTarget(target);
    setRoom("scry");
    void panel.stateArgs.set({ ...args, view: "scry" });
  };
  const advance = async (ticks: number) => {
    setBusy(true);
    try {
      await client.call("advance", {
        ticks,
        reason: "the apprentice let time pass",
      });
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const palette = paletteFor(
    overview?.sky.season ?? "spring",
    overview?.sky.hour ?? 7,
    theme === "dark",
  );
  const vars = {
    "--paper": palette.paper,
    "--ink": palette.ink,
    "--faint": palette.faint,
    "--wash": palette.wash,
    "--season": palette.accent,
  } as CSSProperties;
  if (firstRun === "needed" && apprentice)
    return (
      <main
        className={cx("grimoire-react", theme === "dark" && "dark")}
        style={vars}
      >
        <FirstRun
          client={client}
          apprentice={apprentice}
          hasEstate={Boolean(overview)}
          onDone={() => {
            setFirstRun("done");
            void refresh();
            navigate("valley");
          }}
        />
      </main>
    );
  if (!overview || !apprentice)
    return (
      <main
        className={cx("grimoire-react", theme === "dark" && "dark")}
        style={vars}
      >
        <div className="g-loading">
          <Flame guttering />
          <p>{error ?? "The valley is waking…"}</p>
        </div>
      </main>
    );
  return (
    <main
      className={cx("grimoire-react", theme === "dark" && "dark")}
      style={vars}
    >
      <aside className="g-rail">
        <div className="g-brand">
          <span>G</span>
          <div>
            <strong>Grimoire</strong>
            <small>{overview.estateName ?? "the estate"}</small>
          </div>
        </div>
        <nav>
          {ROOMS.map((entry) => (
            <button
              key={entry.id}
              className={room === entry.id ? "active" : ""}
              onClick={() => navigate(entry.id)}
              title={`${entry.hint} · ${entry.key}`}
            >
              <span className="g-nav-glyph">{entry.glyph}</span>
              <span className="g-nav-copy">
                <strong>{entry.label}</strong>
                <small>{entry.hint}</small>
              </span>
              {entry.id === "news" && overview.news.unread > 0 && (
                <i>{overview.news.unread}</i>
              )}
              {entry.id === "chapel" && overview.council > 0 && (
                <i>{overview.council}</i>
              )}
              <kbd>{entry.key}</kbd>
            </button>
          ))}
        </nav>
        <div className="g-profile">
          <span>
            {overview.apprentices.find((row) => row.id === apprentice)
              ?.name?.[0] ?? "A"}
          </span>
          <div>
            <strong>
              {overview.apprentices.find((row) => row.id === apprentice)
                ?.name ?? apprentice}
            </strong>
            <small>
              {overview.apprentices.find((row) => row.id === apprentice)
                ?.reserve ?? 0}{" "}
              ether
            </small>
          </div>
          <button
            onClick={() => void panel.stateArgs.set({ ...args, sound: !sound })}
          >
            {sound ? "♪" : "♩"}
          </button>
        </div>
      </aside>
      <section className="g-shell">
        <SkyBar
          overview={overview}
          busy={busy}
          onAdvance={(ticks) => void advance(ticks)}
          onWatch={() => void watchDay()}
          watching={watching}
        />
        {error && <div className="g-errorbar">{error}</div>}
        <div className="g-stage">
          {room === "valley" ? (
            openRegion && region ? (
              <RegionExplorer
                initial={region}
                client={client}
                apprentice={apprentice}
                palette={palette}
                onBack={() => {
                  setOpenRegion(null);
                  setRegion(null);
                }}
                onScry={scry}
                onFocus={setFocus}
                onToast={say}
              />
            ) : (
              <HeroValley
                overview={overview}
                palette={palette}
                onEnter={(id) => void enter(id)}
                onSpirit={() => navigate("spirits")}
              />
            )
          ) : room === "circle" ? (
            <Circle
              client={client}
              apprentice={apprentice}
              overview={overview}
              sound={sound}
              initialVerse={draftVerse}
              focus={focus}
              onFocus={() => setFocus(null)}
              onScry={(id) => scry({ kind: "spell", ref: id })}
              onOpenRegion={(id) => void enter(id)}
              onToast={say}
            />
          ) : (
            <DataRoom
              room={room}
              client={client}
              apprentice={apprentice}
              overview={overview}
              target={scryTarget}
              onScry={scry}
              onRegion={(id) => {
                navigate("valley");
                void enter(id);
              }}
              onEcho={(verse) => {
                setDraftVerse(verse);
                navigate("circle");
              }}
              onToast={say}
            />
          )}
        </div>
      </section>
      {toast && (
        <div className="g-toast">
          <span>✦</span>
          {toast}
        </div>
      )}
    </main>
  );
}
