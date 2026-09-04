import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { panel } from "@workspace/runtime";
import { usePanelTheme, useStateArgs } from "@workspace/react";
import {
  atWar,
  describeEffects,
  describeOrder,
  describePromiseCheck,
  dominantTraits,
  heirAge,
  moodOf,
  realmProvinces,
  realmStrength,
  seasonLabel,
  totalCompanies,
  type GameState,
} from "@workspace/regency-engine";
import {
  GameClient,
  type Forecast,
  type GameView,
  type MandateLevel,
  type OrderRow,
  type ProtectorLimits,
} from "./lib/client.js";
import {
  chambersChannel,
  courtChannel,
  embassyChannel,
  MINISTERS,
  openCourt,
  rivalCourtChannel,
  seatTheCourt,
  type SeatProgress,
} from "./lib/court.js";
import { decorationPath, layoutMap, snowPath } from "./lib/geometry.js";
import { closeAudio } from "./lib/sound.js";
import "./styles.css";

type RegencyArgs = {
  gameKey?: string;
  sound?: boolean;
  version?: number;
  surface?: "map" | "archive";
  subjectKind?: "province" | "army" | "event" | "law" | "promise";
  subjectId?: string;
};
type Tab = "realm" | "matters" | "council" | "diplomacy" | "chronicle";
const TABS: Array<{ id: Tab; label: string; icon: string; hint: string }> = [
  { id: "realm", label: "Realm", icon: "♛", hint: "the crown" },
  { id: "matters", label: "Seal", icon: "◈", hint: "decisions" },
  { id: "council", label: "Council", icon: "♟", hint: "your court" },
  { id: "diplomacy", label: "Realms", icon: "⚜", hint: "foreign courts" },
  { id: "chronicle", label: "Chronicle", icon: "❧", hint: "what befell" },
];
const ICONS: Record<string, string> = {
  season: "❧",
  battle: "⚔",
  siege: "⛨",
  capture: "⚑",
  war: "🔥",
  treaty: "📜",
  proposal: "✉",
  law: "⚖",
  council: "🕯",
  famine: "🌾",
  revolt: "✊",
  build: "⌂",
  muster: "🛡",
  march: "➶",
  legitimacy: "♛",
  victory: "✦",
  defeat: "☠",
  colonize: "⚑",
  growth: "✿",
  unrest: "!",
  economy: "◈",
  crisis: "❗",
  court: "♟",
  trade: "↔",
};
const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).join(" ");

function Setup({
  client,
  onFounded,
}: {
  client: GameClient;
  onFounded: () => void;
}) {
  const [realmName, setRealmName] = useState("Aster");
  const [regentName, setRegentName] = useState("");
  const [seed, setSeed] = useState("");
  const [rivals, setRivals] = useState(3);
  const [scenario, setScenario] = useState<"long" | "winter">("long");
  const [seatCourt, setSeatCourt] = useState(true);
  const [busy, setBusy] = useState<null | "founding" | "seating">(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SeatProgress[]>([]);
  const found = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("founding");
    setError(null);
    setProgress([]);
    try {
      await client.newGame({
        seed:
          seed.trim() || `regency-${Math.random().toString(36).slice(2, 8)}`,
        realmName,
        rivals,
        scenario,
        regentName: regentName.trim() || undefined,
      });
      if (seatCourt) {
        setBusy("seating");
        const view = await client.getGame();
        if (view.state) await seatTheCourt(client, view.state, setProgress);
        await openCourt(courtChannel(client.gameKey));
      }
      onFounded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="r-setup">
      <div className="r-setup-crest" aria-hidden="true">
        <span className="r-crown">♛</span>
        <div className="r-rings" />
        <p>CONSILIO · CONSTANTIA · CORONA</p>
      </div>
      <div className="r-setup-card">
        <p className="r-eyebrow">The throne stands empty</p>
        <h1>Regency</h1>
        <p className="r-lede">
          The old sovereign is dead and the heir is a child. Hold the realm
          together by counsel, seal, and diplomacy until the crown can pass
          safely on.
        </p>
        <form onSubmit={(event) => void found(event)}>
          <div className="r-scenarios">
            <label className={scenario === "long" ? "picked" : ""}>
              <input
                type="radio"
                checked={scenario === "long"}
                onChange={() => setScenario("long")}
              />
              <span>♜</span>
              <strong>The Long Regency</strong>
              <small>
                Forty seasons to build, bargain, and make enemies slowly.
              </small>
            </label>
            <label className={scenario === "winter" ? "picked" : ""}>
              <input
                type="radio"
                checked={scenario === "winter"}
                onChange={() => setScenario("winter")}
              />
              <span>❄</span>
              <strong>Winter Regency</strong>
              <small>
                Twelve seasons. Hunger at home and a claimant at the border.
              </small>
            </label>
          </div>
          <div className="r-form-grid">
            <label>
              Realm
              <input
                value={realmName}
                maxLength={24}
                required
                onChange={(e) => setRealmName(e.target.value)}
              />
            </label>
            <label>
              Name of the Regent
              <input
                value={regentName}
                maxLength={32}
                placeholder="the Regent"
                onChange={(e) => setRegentName(e.target.value)}
              />
            </label>
            <label>
              World seed
              <input
                value={seed}
                placeholder="leave blank for a new world"
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
            <label>
              Rival realms
              <input
                type="number"
                min={1}
                max={5}
                value={rivals}
                onChange={(e) => setRivals(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="r-check">
            <input
              type="checkbox"
              checked={seatCourt}
              onChange={(e) => setSeatCourt(e.target.checked)}
            />
            <span>
              <strong>Seat the court now</strong>
              <small>
                Create ministers, private chambers, rival sovereigns,
                ambassadors, and the Lord Protector.
              </small>
            </span>
          </label>
          <button className="r-primary r-found" disabled={busy !== null}>
            {busy === "founding"
              ? "Founding the realm…"
              : busy === "seating"
                ? "Seating the court…"
                : "Take up the seal →"}
          </button>
        </form>
        {progress.length > 0 && (
          <div className="r-seat-progress">
            {progress.map((row) => (
              <div
                className={row.status}
                key={`${row.seat.role}-${row.seat.channelId}`}
              >
                <span>
                  {row.status === "seated"
                    ? "✓"
                    : row.status === "failed"
                      ? "×"
                      : "·"}
                </span>
                <p>
                  {row.seat.name}
                  <small>{row.error ?? row.status}</small>
                </p>
              </div>
            ))}
          </div>
        )}
        {error && <p className="r-error">{error}</p>}
      </div>
    </section>
  );
}

function StrategyMap({
  world,
  selected,
  onSelect,
  intents,
}: {
  world: GameState;
  selected: string | null;
  onSelect: (id: string) => void;
  intents: GameView["intents"];
}) {
  const layout = useMemo(() => layoutMap(world), [world]);
  const [zoom, setZoom] = useState(1);
  const season = world.season % 4;
  const seasonName = ["spring", "summer", "autumn", "winter"][season];
  const armies = useMemo(() => {
    const map = new Map<string, (typeof world.armies)[string][]>();
    for (const army of Object.values(world.armies))
      map.set(army.province, [...(map.get(army.province) ?? []), army]);
    return map;
  }, [world]);
  return (
    <section className={cx("r-map", seasonName)}>
      <div className="r-map-tools">
        <span>{seasonName}</span>
        <button onClick={() => setZoom((z) => Math.max(0.72, z - 0.18))}>
          −
        </button>
        <button onClick={() => setZoom(1)}>⌂</button>
        <button onClick={() => setZoom((z) => Math.min(2.2, z + 0.18))}>
          +
        </button>
      </div>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="Map of the Regency"
      >
        <g
          transform={`translate(${layout.offsetX} ${layout.offsetY}) scale(${zoom})`}
          style={{ transformOrigin: "center" }}
        >
          <path d={layout.sea} className="r-sea" />
          <path d={layout.land} className="r-land" />
          {layout.provinces.map(({ id, path, centre, decorations }) => {
            const province = world.provinces[id]!;
            const realm = world.realms[province.owner];
            const here = armies.get(id) ?? [];
            return (
              <g
                className={cx("r-province", selected === id && "selected")}
                key={id}
                onClick={() => onSelect(id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(id);
                }}
              >
                <path d={path} fill={realm?.color ?? "#8a857a"} />
                {decorations.slice(0, 18).map((d, index) => (
                  <path
                    key={index}
                    d={decorationPath(d)}
                    className={`r-decoration ${d.kind}`}
                  />
                ))}
                {season === 3 &&
                  decorations
                    .filter((d) => d.kind === "peak" || d.kind === "hill")
                    .slice(0, 12)
                    .map((d, index) => (
                      <path
                        key={`snow-${index}`}
                        d={snowPath(d)}
                        className="r-snow"
                      />
                    ))}
                <text x={centre.x} y={centre.y - 5} className="r-province-name">
                  {province.name}
                </text>
                <text x={centre.x} y={centre.y + 9} className="r-province-meta">
                  {province.terrain}
                  {province.capitalOf ? " · ♛" : ""}
                </text>
                {here.map((army, index) => (
                  <g
                    key={army.id}
                    transform={`translate(${centre.x - 10 + index * 20} ${centre.y + 19})`}
                  >
                    <circle
                      r="8"
                      fill={world.realms[army.realm]?.color ?? "#842b2b"}
                    />
                    <text y="3" textAnchor="middle" className="r-army">
                      {totalCompanies(army.units)}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
          {layout.rivers.map((d, index) => (
            <path key={index} d={d} className="r-river" />
          ))}
          {layout.roads.map((road) => (
            <path key={road.key} d={road.d} className="r-road" />
          ))}
          {intents.map((intent) => {
            const from =
              intent.payload.from && layout.centres[intent.payload.from];
            const to = intent.payload.to && layout.centres[intent.payload.to];
            return from && to ? (
              <g key={intent.id}>
                <path
                  d={`M${from.x} ${from.y}L${to.x} ${to.y}`}
                  className="r-intent"
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 6}
                  className="r-intent-label"
                >
                  {intent.label}
                </text>
              </g>
            ) : null;
          })}
        </g>
      </svg>
      <div className="r-map-legend">
        <span>
          <i className="peace" /> realm
        </span>
        <span>
          <i className="army" /> companies
        </span>
        <span>
          <i className="intent" /> intended
        </span>
      </div>
    </section>
  );
}

function ProvinceCard({
  world,
  id,
  onClose,
}: {
  world: GameState;
  id: string;
  onClose: () => void;
}) {
  const province = world.provinces[id];
  if (!province) return null;
  const owner = world.realms[province.owner];
  const armies = Object.values(world.armies).filter(
    (army) => army.province === id,
  );
  return (
    <article className="r-province-card">
      <header>
        <div>
          <p className="r-eyebrow">
            {province.terrain} · {owner?.name ?? province.owner}
          </p>
          <h2>{province.name}</h2>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <div className="r-mini-stats">
        <span>
          <small>People</small>
          <strong>{province.population.toFixed(1)}k</strong>
        </span>
        <span>
          <small>Unrest</small>
          <strong className={province.unrest > 55 ? "bad" : ""}>
            {Math.round(province.unrest)}
          </strong>
        </span>
        <span>
          <small>Granary</small>
          <strong>{province.granary.toFixed(0)}</strong>
        </span>
      </div>
      <p className="r-tags">
        {province.resources.map((item) => (
          <span key={item}>{item}</span>
        ))}
        {Object.entries(province.buildings)
          .filter(([, n]) => n > 0)
          .map(([name, n]) => (
            <span key={name}>
              {name} {n}
            </span>
          ))}
      </p>
      {armies.length > 0 && (
        <div className="r-army-list">
          {armies.map((army) => (
            <div key={army.id}>
              <strong>{army.name}</strong>
              <small>
                {totalCompanies(army.units)} companies · morale{" "}
                {Math.round(army.morale)}
                {army.besieging ? " · besieging" : ""}
              </small>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function RealmDashboard({
  view,
  client,
  refresh,
  notify,
  sound,
  onSound,
}: {
  view: GameView;
  client: GameClient;
  refresh: () => Promise<void>;
  notify: (text: string, kind?: "error") => void;
  sound: boolean;
  onSound: (value: boolean) => void;
}) {
  const world = view.state!;
  const realm = world.realms[world.playerRealm]!;
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setBusy(false);
    }
  };
  const awaiting = view.orders.filter(
    (row) => row.status === "awaiting_seal",
  ).length;
  const pending = world.crises.filter((row) => row.chosen === null).length;
  const failedBriefings = view.briefings.filter(
    (briefing) => briefing.status === "failed",
  );
  return (
    <div className="r-panel-stack">
      <section className="r-hero-card">
        <div>
          <p className="r-eyebrow">{seasonLabel(world)}</p>
          <h2>{world.title}</h2>
          <p>
            {world.phase === "closing"
              ? `The court is closed; waiting on ${view.waitingFor.length} realm(s).`
              : `${world.majoritySeason - world.season} seasons remain until the majority.`}
          </p>
        </div>
        <div className="r-hero-actions">
          {world.phase === "orders" && (
            <button
              className="r-primary"
              onClick={() =>
                void openCourt(courtChannel(client.gameKey)).catch((cause) =>
                  notify(String(cause), "error"),
                )
              }
            >
              Close court with the Herald
            </button>
          )}
          {world.phase === "closing" && (
            <button
              className="r-primary"
              disabled={busy}
              onClick={() => void run(() => client.proceedWithoutPending())}
            >
              Proceed without them
            </button>
          )}
          <button
            onClick={() =>
              void openCourt(courtChannel(client.gameKey)).catch((cause) =>
                notify(String(cause), "error"),
              )
            }
          >
            Enter the court
          </button>
          {failedBriefings.length > 0 && (
            <button
              disabled={busy}
              title={failedBriefings
                .map((briefing) => `${briefing.role}: ${briefing.error}`)
                .join("\n")}
              onClick={() => void run(() => client.redeliverBriefings())}
            >
              Re-send {failedBriefings.length} briefing
              {failedBriefings.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </section>
      {(awaiting > 0 || pending > 0) && (
        <div className="r-attention">
          <span>!</span>
          <p>
            <strong>The crown requires attention</strong>
            {awaiting} act{awaiting === 1 ? "" : "s"} await the seal · {pending}{" "}
            matter{pending === 1 ? "" : "s"} await judgment
          </p>
        </div>
      )}
      <section className="r-stat-grid">
        {[
          [
            "Treasury",
            realm.treasury.toFixed(0),
            `${realm.ledger.net >= 0 ? "+" : ""}${realm.ledger.net}/season`,
          ],
          ["Legitimacy", Math.round(realm.legitimacy), "need 40"],
          [
            "Prestige",
            Math.round(realm.prestige),
            `infamy ${Math.round(realm.infamy)}`,
          ],
          [
            "Reputation",
            Math.round(world.regent.reputation),
            world.regent.name,
          ],
        ].map(([label, value, note]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{note}</span>
          </article>
        ))}
      </section>
      <section className="r-card">
        <header className="r-section-title">
          <div>
            <p className="r-eyebrow">Consent of the realm</p>
            <h3>The four estates</h3>
          </div>
        </header>
        <div className="r-bars">
          {Object.entries(realm.estates).map(([name, value]) => (
            <div key={name}>
              <span>{name}</span>
              <i>
                <b
                  className={value < 40 ? "low" : ""}
                  style={{ width: `${value}%` }}
                />
              </i>
              <em>{Math.round(value)}</em>
            </div>
          ))}
        </div>
      </section>
      <section className="r-card r-heir">
        <p className="r-eyebrow">The future sovereign</p>
        <h3>
          {world.heir.name}, age {heirAge(world)}
        </h3>
        <p>
          {world.heir.tutor
            ? `Tutored by the ${world.heir.tutor}.`
            : "No tutor has been appointed."}{" "}
          {dominantTraits(world.heir).length
            ? `Growing ${dominantTraits(world.heir).join(" and ")}.`
            : "Their character is still unformed."}
        </p>
        <div className="r-bars traits">
          {Object.entries(world.heir.traits).map(([name, value]) => (
            <div key={name}>
              <span>{name}</span>
              <i>
                <b style={{ width: `${Math.min(100, value * 12)}%` }} />
              </i>
              <em>{value}</em>
            </div>
          ))}
        </div>
      </section>
      {world.digest.length > 0 && (
        <section className="r-card r-digest">
          <p className="r-eyebrow">Last season, in brief</p>
          <p>{world.digest.at(-1)}</p>
        </section>
      )}
      <section className="r-card r-preferences">
        <label>
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => onSound(e.target.checked)}
          />{" "}
          Sound the horn, steel, and seal
        </label>
        <small>
          Keys: Space closes the season · S seals the first act · arrows walk
          provinces · Esc clears selection.
        </small>
      </section>
    </div>
  );
}

function Matters({
  view,
  client,
  notify,
  onProvince,
}: {
  view: GameView;
  client: GameClient;
  notify: (text: string, kind?: "error") => void;
  onProvince: (id: string) => void;
}) {
  const world = view.state!;
  const awaiting = view.orders.filter((row) => row.status === "awaiting_seal");
  const crises = world.crises.filter((crisis) => crisis.chosen === null);
  const [busy, setBusy] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<Record<string, Forecast>>({});
  const [lawOpen, setLawOpen] = useState<string | null>(null);
  const preview = async (order: OrderRow) => {
    setBusy(`forecast-${order.id}`);
    try {
      const forecast = await client.forecast({ includeOrderIds: [order.id] });
      setForecasts((all) => ({
        ...all,
        [order.id]: forecast,
      }));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setBusy(null);
    }
  };
  const previewSeason = async () => {
    setBusy("forecast-season");
    try {
      const forecast = await client.forecast({});
      setForecasts((all) => ({
        ...all,
        season: forecast,
      }));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setBusy(null);
    }
  };
  const player = world.realms[world.playerRealm]!;
  const otherOrders = view.orders.filter(
    (row) => row.status !== "awaiting_seal",
  );
  return (
    <div className="r-panel-stack">
      <PanelHeading
        eyebrow="The Regent decides"
        title="Seal & judgment"
        aside={`${crises.length + awaiting.length} waiting`}
      />
      <section className="r-card">
        <header className="r-section-title">
          <h3>Matters of state</h3>
          <span>{crises.length}</span>
        </header>
        {crises.length === 0 && (
          <Empty
            icon="◈"
            title="Nothing awaits judgment"
            text="New matters arise with the seasons. Unresolved matters take their default when court closes."
          />
        )}
        {crises.map((crisis) => (
          <article className="r-matter" key={crisis.id}>
            <header>
              <div>
                <p className="r-eyebrow">
                  {crisis.province
                    ? world.provinces[crisis.province]?.name
                    : "The whole realm"}
                </p>
                <h3>{crisis.title}</h3>
              </div>
              {crisis.province && (
                <button onClick={() => onProvince(crisis.province!)}>
                  Show on map
                </button>
              )}
            </header>
            <p>{crisis.text}</p>
            <div className="r-options">
              {crisis.options.map((option) => (
                <article
                  className={
                    option.id === crisis.defaultOption ? "default" : ""
                  }
                  key={option.id}
                >
                  <div>
                    <strong>{option.label}</strong>
                    {option.id === crisis.defaultOption && (
                      <small>default</small>
                    )}
                  </div>
                  <p>{option.text}</p>
                  <span>{describeEffects(world, option.effects)}</span>
                  <small>
                    Choose this course in conversation with the Herald.
                  </small>
                </article>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="r-card">
        <header className="r-section-title">
          <h3>The Regent’s seal</h3>
          <span>{awaiting.length}</span>
        </header>
        {awaiting.length === 0 && (
          <Empty
            icon="♛"
            title="The seal rests"
            text="Speak with your council. Acts requiring sovereign authority will be placed here."
          />
        )}
        {awaiting.map((order) => (
          <article className="r-act" key={order.id}>
            <header>
              <span className="r-seal">R</span>
              <div>
                <small>
                  {world.court[order.actor]?.name ?? order.actor} proposes
                </small>
                <h3>{describeOrder(world, order.order)}</h3>
              </div>
            </header>
            {order.rationale && <blockquote>“{order.rationale}”</blockquote>}
            {forecasts[order.id] && (
              <ForecastCard forecast={forecasts[order.id]!} />
            )}
            <div className="r-actions">
              <button
                disabled={busy !== null}
                onClick={() => void preview(order)}
              >
                Forecast
              </button>
              <small>The Herald carries the seal in court conversation.</small>
            </div>
          </article>
        ))}
      </section>
      <section className="r-card r-lawbook">
        <header className="r-section-title">
          <div>
            <p className="r-eyebrow">Standing instruments</p>
            <h3>The law book</h3>
          </div>
          <span>{player.laws.edicts.length} edicts</span>
        </header>
        <div className="r-law-stats">
          <span>
            <small>Tax</small>
            <strong>{Math.round(player.laws.taxRate * 100)}%</strong>
          </span>
          <span>
            <small>Conscription</small>
            <strong>{Math.round(player.laws.conscription * 100)}%</strong>
          </span>
          <span>
            <small>Granary reserve</small>
            <strong>{Math.round(player.laws.granaryReserve * 100)}%</strong>
          </span>
        </div>
        {player.laws.edicts.map((edict) => (
          <article className="r-edict" key={edict.id}>
            <button
              onClick={() => setLawOpen(lawOpen === edict.id ? null : edict.id)}
            >
              <span>
                <strong>{edict.title}</strong>
                <small>
                  {edict.id} · {edict.author}
                </small>
              </span>
              <b>{lawOpen === edict.id ? "−" : "+"}</b>
            </button>
            {lawOpen === edict.id && (
              <pre>
                {JSON.stringify(
                  { when: edict.when, then: edict.then },
                  null,
                  2,
                )}
              </pre>
            )}
          </article>
        ))}
      </section>
      <section className="r-card r-orderbook">
        <header className="r-section-title">
          <div>
            <p className="r-eyebrow">This season</p>
            <h3>Order book</h3>
          </div>
          <button disabled={busy !== null} onClick={() => void previewSeason()}>
            Forecast the season
          </button>
        </header>
        {forecasts["season"] && (
          <ForecastCard forecast={forecasts["season"]!} />
        )}
        {otherOrders.length === 0 ? (
          <p className="r-muted">No orders have entered the record yet.</p>
        ) : (
          <div className="r-order-lines">
            {otherOrders.map((order) => (
              <p className={order.status} key={order.id}>
                <strong>{world.court[order.actor]?.name ?? order.actor}</strong>
                <span>{describeOrder(world, order.order)}</span>
                <small>
                  {order.status}
                  {order.reason ? ` · ${order.reason}` : ""}
                </small>
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ForecastCard({ forecast }: { forecast: Forecast }) {
  return (
    <div className="r-forecast">
      <span>
        <small>Treasury</small>
        <strong>
          {forecast.treasury.before} → {forecast.treasury.after}
        </strong>
      </span>
      <span>
        <small>Legitimacy</small>
        <strong>
          {forecast.legitimacy.before} → {forecast.legitimacy.after}
        </strong>
      </span>
      <span>
        <small>Provinces</small>
        <strong>
          {forecast.provinces.before} → {forecast.provinces.after}
        </strong>
      </span>
      {forecast.events.length > 0 && (
        <p>{forecast.events.slice(0, 4).join(" · ")}</p>
      )}
    </div>
  );
}

function Council({
  view,
  client,
  refresh,
  notify,
}: {
  view: GameView;
  client: GameClient;
  refresh: () => Promise<void>;
  notify: (text: string, kind?: "error") => void;
}) {
  const world = view.state!;
  const roles = [
    "herald",
    "chancellor",
    "treasurer",
    "marshal",
    "envoy",
    "protector",
    "chronicler",
  ];
  const ministerRoles = new Set<string>(MINISTERS);
  const openDebates = view.debates.filter(
    (debate) => debate.status === "open",
  ).length;
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [seatProgress, setSeatProgress] = useState<SeatProgress[]>([]);
  const [protectorMandate, setProtectorMandate] = useState(
    "Keep the peace, feed the provinces, and refer any war to me.",
  );
  const [protectorSeasons, setProtectorSeasons] = useState(2);
  const [limits, setLimits] = useState<ProtectorLimits>({
    maySealWar: false,
    maySealLaws: true,
    maySealTreaties: true,
    mayDecideCrises: true,
    mayCloseSeason: true,
  });
  const seated = (role: string) =>
    view.participants.some(
      (person) => person.role === role && person.kind !== "chambers",
    );
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="r-panel-stack">
      <PanelHeading
        eyebrow="Voices around the throne"
        title="The Council"
        aside={`${view.participants.length} seats connected`}
      />
      {!view.participants.some((person) => person.kind !== "chambers") && (
        <section className="r-card r-seat-court">
          <div>
            <p className="r-eyebrow">The chairs stand empty</p>
            <h3>Seat the court</h3>
            <p>
              Convene the ministers, rival sovereigns, ambassadors, and their
              private chambers as workspace agents.
            </p>
          </div>
          <button
            className="r-primary"
            disabled={busy}
            onClick={() =>
              void act(() => seatTheCourt(client, world, setSeatProgress))
            }
          >
            Seat every chair
          </button>
          {seatProgress.length > 0 && (
            <div className="r-seat-progress">
              {seatProgress.map((row) => (
                <span
                  className={row.status}
                  key={`${row.seat.kind}-${row.seat.role}`}
                >
                  <i /> {row.seat.name} · {row.error ?? row.status}
                </span>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="r-council-table">
        <div className="r-table-mark">♛</div>
        {roles.map((role, index) => {
          const person = world.court[role];
          return (
            <article
              className={cx("r-courtier", seated(role) && "seated")}
              style={{ "--seat": index } as CSSProperties}
              key={role}
            >
              <div
                className="r-portrait"
                style={
                  { "--portrait": person?.portrait ?? index } as CSSProperties
                }
              >
                {person?.name?.[0] ?? role[0]?.toUpperCase()}
              </div>
              <div>
                <p className="r-eyebrow">{role}</p>
                <h3>{person?.name ?? `The ${role}`}</h3>
                <small>
                  {person?.house ? `House ${person.house} · ` : ""}
                  {person?.temperament ?? "The chair is empty."}
                </small>
                {person && (
                  <div className="r-standing">
                    <i>
                      <b style={{ width: `${person.standing}%` }} />
                    </i>
                    <small>
                      {moodOf(person.standing)} · {Math.round(person.standing)}
                    </small>
                  </div>
                )}
              </div>
              <div className="r-seat-controls">
                <span>{seated(role) ? "seated" : "absent"}</span>
                {ministerRoles.has(role) && (
                  <>
                    <select
                      aria-label={`${role} mandate`}
                      value={view.mandates[role] ?? "act"}
                      disabled={busy}
                      onChange={(event) =>
                        void act(() =>
                          client.setMandate(
                            role,
                            event.target.value as MandateLevel,
                          ),
                        )
                      }
                    >
                      <option value="advise">advise</option>
                      <option value="act">act</option>
                      <option value="plenary">plenary</option>
                    </select>
                    <button
                      disabled={!seated(role)}
                      onClick={() =>
                        void openCourt(
                          chambersChannel(client.gameKey, role),
                        ).catch((cause) => notify(String(cause), "error"))
                      }
                    >
                      In private
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <section className="r-card">
        <header className="r-section-title">
          <div>
            <p className="r-eyebrow">Put it on the record</p>
            <h3>Convene the ministers</h3>
          </div>
          <button
            onClick={() =>
              void openCourt(courtChannel(client.gameKey)).catch((cause) =>
                notify(String(cause), "error"),
              )
            }
          >
            Open court conversation
          </button>
        </header>
        <form
          className="r-question"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim().length >= 8 && openDebates < 2)
              void act(async () => {
                await client.convene(question.trim());
                setQuestion("");
              });
          }}
        >
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What counsel do you seek?"
          />
          <button
            className="r-primary"
            disabled={busy || question.trim().length < 8 || openDebates >= 2}
          >
            Ask the council
          </button>
        </form>
        <small>
          {openDebates >= 2
            ? "Close one of the two open debates before convening another."
            : "Frame a question of at least eight characters for the record."}
        </small>
      </section>
      {view.debates
        .slice()
        .reverse()
        .map((debate) => (
          <section className="r-card r-debate" key={debate.id}>
            <header className="r-section-title">
              <div>
                <p className="r-eyebrow">{debate.status}</p>
                <h3>{debate.question}</h3>
              </div>
              {debate.status === "open" && (
                <button
                  disabled={busy}
                  onClick={() => void act(() => client.closeDebate(debate.id))}
                >
                  Close debate
                </button>
              )}
            </header>
            {debate.lines.map((line) => (
              <blockquote key={line.role}>
                <strong>
                  {line.name}
                  <small>{line.role}</small>
                </strong>
                <p>{line.text}</p>
              </blockquote>
            ))}
          </section>
        ))}
      <section className="r-card r-protector">
        <header className="r-section-title">
          <div>
            <p className="r-eyebrow">Delegated sovereignty</p>
            <h3>The Lord Protector</h3>
          </div>
          {view.protectorate?.active && <span>in office</span>}
        </header>
        {view.protectorate?.active ? (
          <>
            <blockquote>“{view.protectorate.mandate}”</blockquote>
            <p>
              {view.protectorate.seasonsLeft} season
              {view.protectorate.seasonsLeft === 1 ? "" : "s"} remain. Powers:{" "}
              {Object.entries(view.protectorate.limits)
                .filter(([, allowed]) => allowed)
                .map(([name]) =>
                  name
                    .replace(/^may/, "")
                    .replace(/([A-Z])/g, " $1")
                    .trim()
                    .toLowerCase(),
                )
                .join(", ") || "none"}
              .
            </p>
            <button
              disabled={busy}
              onClick={() => void act(() => client.dismissProtector())}
            >
              Resume the seal
            </button>
          </>
        ) : (
          <>
            <p>
              Entrust the realm for a bounded number of seasons. These powers
              are enforced by the game service, not merely suggested to the
              agent.
            </p>
            <textarea
              rows={3}
              value={protectorMandate}
              onChange={(event) => setProtectorMandate(event.target.value)}
            />
            <div className="r-limit-grid">
              {(Object.keys(limits) as Array<keyof ProtectorLimits>).map(
                (key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={limits[key]}
                      onChange={(event) =>
                        setLimits((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                    {key
                      .replace(/^may/, "")
                      .replace(/([A-Z])/g, " $1")
                      .trim()}
                  </label>
                ),
              )}
              <label>
                Seasons
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={protectorSeasons}
                  onChange={(event) =>
                    setProtectorSeasons(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <button
              className="r-primary"
              disabled={
                busy || !seated("protector") || !protectorMandate.trim()
              }
              onClick={() =>
                void act(() =>
                  client.appointProtector({
                    mandate: protectorMandate.trim(),
                    seasons: protectorSeasons,
                    limits,
                  }),
                )
              }
            >
              Appoint the Lord Protector
            </button>
          </>
        )}
        {view.handovers.length > 0 && (
          <div className="r-handovers">
            <p className="r-eyebrow">Accounts returned to the crown</p>
            {view.handovers
              .slice()
              .reverse()
              .map((handover) => (
                <article key={handover.id}>
                  <small>
                    {seasonLabel({
                      season: handover.season,
                      startYear: world.startYear,
                    })}
                  </small>
                  <p>{handover.text}</p>
                </article>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Diplomacy({
  view,
  client,
  refresh,
  notify,
}: {
  view: GameView;
  client: GameClient;
  refresh: () => Promise<void>;
  notify: (text: string, kind?: "error") => void;
}) {
  const world = view.state!;
  const me = world.playerRealm;
  const rivals = Object.values(world.realms).filter((realm) => realm.id !== me);
  return (
    <div className="r-panel-stack">
      <PanelHeading
        eyebrow="Beyond the border"
        title="Foreign Realms"
        aside={`${rivals.length} courts`}
      />
      <div className="r-realm-grid">
        {rivals.map((realm) => {
          const sovereign = world.court[`sovereign:${realm.id}`];
          const promises = view.promises.filter(
            (promise) => promise.to === realm.id,
          );
          return (
            <article
              className={cx("r-foreign", realm.eliminated && "eliminated")}
              style={{ "--realm": realm.color } as CSSProperties}
              key={realm.id}
            >
              <header>
                <div className="r-foreign-crest">{realm.name[0]}</div>
                <div>
                  <p className="r-eyebrow">
                    {atWar(world, me, realm.id) ? "At war" : "At peace"}
                  </p>
                  <h3>{realm.name}</h3>
                  <small>{sovereign?.name ?? realm.character}</small>
                </div>
              </header>
              <div className="r-relations">
                <span>
                  <small>Their regard</small>
                  <strong>{realm.relations[me] ?? 0}</strong>
                </span>
                <span>
                  <small>Strength</small>
                  <strong>{Math.round(realmStrength(world, realm.id))}</strong>
                </span>
                <span>
                  <small>Provinces</small>
                  <strong>{realmProvinces(world, realm.id).length}</strong>
                </span>
              </div>
              <p className="r-tags">
                {world.treaties
                  .filter(
                    (t) =>
                      t.parties.includes(me) && t.parties.includes(realm.id),
                  )
                  .map((t) => (
                    <span key={t.id}>{t.kind.replace("_", " ")}</span>
                  ))}
              </p>
              <div className="r-actions">
                <button
                  className="r-primary"
                  onClick={() =>
                    void openCourt(
                      embassyChannel(client.gameKey, realm.id),
                    ).catch((cause) =>
                      notify(
                        cause instanceof Error ? cause.message : String(cause),
                        "error",
                      ),
                    )
                  }
                >
                  Receive ambassador
                </button>
                <button
                  onClick={() =>
                    void openCourt(
                      rivalCourtChannel(client.gameKey, realm.id),
                    ).catch((cause) =>
                      notify(
                        cause instanceof Error ? cause.message : String(cause),
                        "error",
                      ),
                    )
                  }
                >
                  Visit court
                </button>
              </div>
              {promises.length > 0 && (
                <div className="r-promises">
                  <h4>The Regent’s word</h4>
                  {promises.map((promise) => (
                    <div className={promise.status} key={promise.id}>
                      <span>
                        {promise.status === "kept"
                          ? "✓"
                          : promise.status === "broken"
                            ? "×"
                            : "·"}
                      </span>
                      <p>
                        “{promise.text}”
                        <small>
                          {describePromiseCheck(world, promise.check)} ·{" "}
                          {promise.status}
                        </small>
                      </p>
                      {promise.status === "pending" &&
                        promise.check.kind === "free_text" && (
                          <div>
                            <button
                              onClick={() =>
                                void client
                                  .settlePromise(promise.id, "kept")
                                  .then(refresh)
                                  .catch((cause) =>
                                    notify(
                                      cause instanceof Error
                                        ? cause.message
                                        : String(cause),
                                      "error",
                                    ),
                                  )
                              }
                            >
                              kept
                            </button>
                            <button
                              onClick={() =>
                                void client
                                  .settlePromise(promise.id, "broken")
                                  .then(refresh)
                                  .catch((cause) =>
                                    notify(
                                      cause instanceof Error
                                        ? cause.message
                                        : String(cause),
                                      "error",
                                    ),
                                  )
                              }
                            >
                              broken
                            </button>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Chronicle({
  view,
  onProvince,
}: {
  view: GameView;
  onProvince: (id: string) => void;
}) {
  const world = view.state!;
  const [filter, setFilter] = useState("all");
  const rows = view.events
    .slice()
    .reverse()
    .filter(
      (event) =>
        filter === "all" ||
        event.kind === filter ||
        (filter === "decisions" &&
          (event.kind === "council" || event.kind === "crisis")),
    );
  const groups = new Map<number, typeof rows>();
  for (const row of rows)
    groups.set(row.season, [...(groups.get(row.season) ?? []), row]);
  return (
    <div className="r-panel-stack">
      <PanelHeading
        eyebrow="Ink remembers"
        title="The Chronicle"
        aside={`${view.events.length} events`}
      />
      <div className="r-filter">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={filter === "decisions" ? "active" : ""}
          onClick={() => setFilter("decisions")}
        >
          The Regent’s decisions
        </button>
        {["battle", "treaty", "law", "economy"].map((kind) => (
          <button
            className={filter === kind ? "active" : ""}
            key={kind}
            onClick={() => setFilter(kind)}
          >
            {kind}
          </button>
        ))}
      </div>
      {world.digest.length > 0 && (
        <section className="r-card r-digest">
          <p className="r-eyebrow">What changed, and why</p>
          <p className="r-dropcap">{world.digest.at(-1)}</p>
        </section>
      )}
      <section className="r-chronicle">
        {[...groups].map(([season, events]) => (
          <article key={season}>
            <header>
              <span>❧</span>
              <h3>{seasonLabel({ season, startYear: world.startYear })}</h3>
            </header>
            {events.map((event) => (
              <div
                className={cx(
                  "r-event",
                  (event.kind === "council" || event.kind === "crisis") &&
                    "decision",
                )}
                key={event.seq}
              >
                <span>{ICONS[event.kind] ?? "·"}</span>
                <p>
                  {event.text}
                  {event.province && (
                    <button onClick={() => onProvince(event.province!)}>
                      {world.provinces[event.province]?.name}
                    </button>
                  )}
                </p>
              </div>
            ))}
          </article>
        ))}
      </section>
    </div>
  );
}

function PanelHeading({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: string;
  aside?: string;
}) {
  return (
    <header className="r-panel-heading">
      <div>
        <p className="r-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {aside && <span>{aside}</span>}
    </header>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="r-empty">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export default function RegencyPanel() {
  const theme = usePanelTheme();
  const args = useStateArgs<RegencyArgs>();
  const gameKey = (args.gameKey ?? "main").trim() || "main";
  const client = useMemo(() => new GameClient(gameKey), [gameKey]);
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("realm");
  const [archiveOpen, setArchiveOpen] = useState(args.surface === "archive");
  const [selected, setSelected] = useState<string | null>(null);
  const selectProvince = useCallback(
    (id: string | null) => {
      setSelected(id);
      void panel.stateArgs.set({
        ...args,
        version: 1,
        surface: "map",
        ...(id
          ? { subjectKind: "province", subjectId: id }
          : { subjectKind: undefined, subjectId: undefined }),
      });
    },
    [args],
  );
  const [notices, setNotices] = useState<
    Array<{ id: number; text: string; kind?: "error" }>
  >([]);
  const sound = args.sound === true;
  const seq = useRef(0);
  const notify = useCallback((text: string, kind?: "error") => {
    const id = ++seq.current;
    setNotices((rows) => [...rows, { id, text, kind }]);
    setTimeout(
      () => setNotices((rows) => rows.filter((row) => row.id !== id)),
      kind ? 8000 : 4200,
    );
  }, []);
  const refresh = useCallback(async () => {
    try {
      await client.attention();
      setView(await client.getGame());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [client]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      clearInterval(timer);
      closeAudio();
    };
  }, [refresh]);
  useEffect(() => {
    setArchiveOpen(args.surface === "archive");
    if (args.subjectKind === "province" && args.subjectId) {
      setSelected(args.subjectId);
      return;
    }
    if (args.surface !== "archive") return;
    if (args.subjectKind === "promise") setTab("diplomacy");
    else if (args.subjectKind === "event")
      setTab(args.subjectId === "season-readiness" ? "realm" : "chronicle");
    else if (args.subjectKind === "law")
      setTab(
        args.subjectId === "mandates" || args.subjectId === "protectorate"
          ? "council"
          : "matters",
      );
    else if (args.subjectKind === "army") setTab("realm");
  }, [args.surface, args.subjectKind, args.subjectId]);
  const awaiting =
    view?.orders.filter((row) => row.status === "awaiting_seal").length ?? 0;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (error && !view)
    return (
      <main className={cx("regency-react", theme === "dark" && "dark")}>
        <div className="r-failure">
          <span>♛</span>
          <h2>The realm is unreachable</h2>
          <p>{error}</p>
          <button className="r-primary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </main>
    );
  if (!view)
    return (
      <main className={cx("regency-react", theme === "dark" && "dark")}>
        <div className="r-loading">
          <span>♛</span>
          <p>Unrolling the map…</p>
        </div>
      </main>
    );
  if (!view.state)
    return (
      <main className={cx("regency-react", theme === "dark" && "dark")}>
        <Setup client={client} onFounded={() => void refresh()} />
      </main>
    );
  const world = view.state;
  const pending = world.crises.filter((row) => row.chosen === null).length;
  return (
    <main className={cx("regency-react", theme === "dark" && "dark")}>
      <header className="r-topbar">
        <div className="r-title">
          <span>♛</span>
          <div>
            <strong>{world.realms[world.playerRealm]?.name}</strong>
            <small>
              {seasonLabel(world)} · {world.phase}
            </small>
          </div>
        </div>
        {view.attention[0] && (
          <div className={`r-attention ${view.attention[0].urgency}`}>
            <span>♟</span>
            <div>
              <strong>{view.attention[0].title}</strong>
              <small>{view.attention[0].explanation}</small>
              <small className="r-attention-next">
                Next: {view.attention[0].nextAction}
              </small>
            </div>
            <button
              aria-label="Dismiss guidance"
              onClick={() =>
                void client
                  .dismissAttention(view.attention[0]!.key)
                  .then(refresh)
              }
            >
              ×
            </button>
          </div>
        )}
        <button
          className="r-archive-button"
          onClick={() => {
            const next = !archiveOpen;
            setArchiveOpen(next);
            void panel.stateArgs.set({
              ...args,
              version: 1,
              surface: next ? "archive" : "map",
            });
          }}
        >
          {archiveOpen ? "Close records" : "Open records"} <span>❧</span>
        </button>
        <button
          className="r-court-button"
          onClick={() =>
            void openCourt(courtChannel(gameKey)).catch((cause) =>
              notify(String(cause), "error"),
            )
          }
        >
          Return to court <span>↗</span>
        </button>
      </header>
      <div className="r-workspace">
        <div className="r-map-pane">
          <StrategyMap
            world={world}
            selected={selected}
            onSelect={selectProvince}
            intents={view.intents}
          />
          {selected && (
            <ProvinceCard
              world={world}
              id={selected}
              onClose={() => selectProvince(null)}
            />
          )}
        </div>
        <aside
          className={cx(
            "r-command",
            "r-conversational",
            archiveOpen && "archive-open",
          )}
        >
          {!archiveOpen ? (
            <div className="r-glance">
              <p className="r-eyebrow">The Regent's desk</p>
              <h2>
                {view.readiness?.state === "blocked_by_seals"
                  ? "The seal is wanted"
                  : view.readiness?.state === "ready_with_defaults"
                    ? "Court may close"
                    : view.readiness?.state === "waiting_for_courts"
                      ? "The realm is waiting"
                      : view.readiness?.state === "finished"
                        ? "The history is written"
                        : "The court is ready"}
              </h2>
              <p>
                {view.attention[0]?.explanation ??
                  "The map is quiet. Return to court for counsel, or point at a province to give the council context."}
              </p>
              <p className="r-next-action">
                <strong>Next</strong>{" "}
                {view.attention[0]?.nextAction ??
                  "Ask the council what changed and what deserves your decision first."}
              </p>
              <div className="r-glance-stats">
                <span>
                  <b>{Math.round(world.realms[world.playerRealm]!.treasury)}</b>{" "}
                  treasury
                </span>
                <span>
                  <b>
                    {Math.round(world.realms[world.playerRealm]!.legitimacy)}
                  </b>{" "}
                  legitimacy
                </span>
                <span>
                  <b>{awaiting + pending}</b> before court
                </span>
              </div>
              <button
                className="r-primary"
                onClick={() =>
                  void openCourt(courtChannel(gameKey)).catch((cause) =>
                    notify(String(cause), "error"),
                  )
                }
              >
                Ask the council what to do next <span>↗</span>
              </button>
              {view.readiness?.state === "waiting_for_courts" && (
                <button
                  className="r-secondary"
                  onClick={() =>
                    void client
                      .proceedWithoutPending()
                      .then(refresh)
                      .catch((cause) => notify(String(cause), "error"))
                  }
                >
                  Proceed without the other courts
                </button>
              )}
            </div>
          ) : (
            <>
              <nav className="r-record-tabs" aria-label="Realm records">
                {TABS.map((entry) => (
                  <button
                    className={tab === entry.id ? "active" : ""}
                    key={entry.id}
                    onClick={() => setTab(entry.id)}
                  >
                    <span>{entry.icon}</span>
                    {entry.label}
                    {entry.id === "matters" && awaiting + pending > 0 ? (
                      <i>{awaiting + pending}</i>
                    ) : null}
                  </button>
                ))}
              </nav>
              <div className="r-command-scroll">
                {tab === "realm" ? (
                  <RealmDashboard
                    view={view}
                    client={client}
                    refresh={refresh}
                    notify={notify}
                    sound={sound}
                    onSound={(value) =>
                      void panel.stateArgs.set({ ...args, sound: value })
                    }
                  />
                ) : tab === "matters" ? (
                  <Matters
                    view={view}
                    client={client}
                    notify={notify}
                    onProvince={(id) => selectProvince(id)}
                  />
                ) : tab === "council" ? (
                  <Council
                    view={view}
                    client={client}
                    refresh={refresh}
                    notify={notify}
                  />
                ) : tab === "diplomacy" ? (
                  <Diplomacy
                    view={view}
                    client={client}
                    refresh={refresh}
                    notify={notify}
                  />
                ) : (
                  <Chronicle
                    view={view}
                    onProvince={(id) => selectProvince(id)}
                  />
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {world.outcome && (
        <div className="r-ending">
          <div>
            <span>♛</span>
            <p className="r-eyebrow">The Regency is ended</p>
            <h2>{world.outcome.title}</h2>
            <p>{world.outcome.reason}</p>
            {world.outcome.verdict && (
              <blockquote>{world.outcome.verdict}</blockquote>
            )}
            <button
              className="r-primary"
              onClick={() =>
                void panel.stateArgs.set({ ...args, gameKey: `${gameKey}-new` })
              }
            >
              Begin another history
            </button>
          </div>
        </div>
      )}
      <div className="r-notices">
        {notices.map((notice) => (
          <div className={notice.kind ?? "info"} key={notice.id}>
            <span>{notice.kind ? "!" : "♛"}</span>
            {notice.text}
          </div>
        ))}
      </div>
    </main>
  );
}
