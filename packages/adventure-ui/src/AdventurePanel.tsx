import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GeneratedImage } from "@workspace/react";
import { panel } from "@workspace/runtime";
import type { Campaign, Entity, JournalEntry } from "@workspace/adventure-engine";
import { useAdventure, useCampaignKey } from "./useAdventure.js";
import { JournalTabs } from "./JournalTabs.js";
import "./styles.css";

export type AdventureTheme = "letters" | "embassy" | "house";
export type AdventurePresentation = {
  theme: AdventureTheme;
  imprint: string;
  chapter: string;
  journalTitle: string;
  inventoryTitle: string;
  prompt: string;
  cover?: string;
};

const presentations: Record<AdventureTheme, Omit<AdventurePresentation, "theme" | "cover">> = {
  letters: {
    imprint: "Bellwether · Department of Undeliverable Post",
    chapter: "A correspondence with the impossible",
    journalTitle: "The postmaster’s ledger",
    inventoryTitle: "In your satchel",
    prompt: "Break a seal. Ask a question. Follow an impossible address…",
  },
  embassy: {
    imprint: "The Consular Archives · A sovereign mystery",
    chapter: "A country is more than a place on a map",
    journalTitle: "The ambassador’s papers",
    inventoryTitle: "In your keeping",
    prompt: "Receive a visitor. Examine a passport. Make a promise…",
  },
  house: {
    imprint: "The Grand Peregrine · Rooms with a moving view",
    chapter: "Every arrival is the beginning of a story",
    journalTitle: "The guest book",
    inventoryTitle: "Your travelling effects",
    prompt: "Meet a guest. Explore a corridor. Change the destination…",
  },
};

function Crest({ theme }: { theme: AdventureTheme }) {
  return (
    <svg className="adventure-crest" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {theme === "letters" ? (
        <>
          <path d="M11 21h42v28H11zM11 21l21 17 21-17M11 49l16-15m26 15L37 34" />
          <circle cx="32" cy="14" r="7" />
          <path d="M29 14h6m-3-3v6M7 55h50" />
        </>
      ) : theme === "embassy" ? (
        <>
          <path d="M17 13h30v21c0 11-15 20-15 20S17 45 17 34V13ZM23 25h18M23 31h18M32 19v25M11 23C0 38 14 50 23 54m30-31c11 15-3 27-12 31M23 7h18" />
        </>
      ) : (
        <>
          <path d="M11 54V30a21 21 0 0 1 42 0v24M19 54V30a13 13 0 0 1 26 0v24M27 54V30a5 5 0 0 1 10 0v24M6 54h52M25 5h14M32 1v8" />
        </>
      )}
    </svg>
  );
}

export function AdventureScene({
  children,
  image,
  caption,
}: {
  children: ReactNode;
  image: ReactNode;
  caption: string;
}) {
  return (
    <section className="adventure-scene" aria-label="The scene around you">
      <div className="adventure-scene-image">{image}</div>
      <div className="adventure-scene-shade" />
      <div className="adventure-scene-content">{children}</div>
      <span className="adventure-scene-caption">{caption}</span>
    </section>
  );
}

export function AdventureJournal({ entries, title }: { entries: JournalEntry[]; title: string }) {
  return (
    <section className="adventure-journal" aria-label={title}>
      <div className="adventure-section-heading">
        <span className="adventure-eyebrow">Your journey</span>
        <h2>{title}</h2>
      </div>
      {entries.length ? (
        <ol>
          {entries.map((entry) => (
            <li key={entry.id} className={`adventure-entry adventure-entry-${entry.kind}`}>
              <span className="adventure-entry-time">{String(entry.tick).padStart(2, "0")}</span>
              <p>{entry.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="adventure-muted">Your story is waiting to be written.</p>
      )}
    </section>
  );
}

export function EntityCollection({
  title,
  entities,
  selected,
  onSelect,
  empty,
}: {
  title: string;
  entities: Entity[];
  selected?: string;
  onSelect: (entity: Entity) => void;
  empty: string;
}) {
  return (
    <section className="adventure-collection" aria-label={title}>
      <div className="adventure-collection-title">
        <h3>{title}</h3>
        <span>{String(entities.length).padStart(2, "0")}</span>
      </div>
      {entities.length ? (
        <div className="adventure-entity-list">
          {entities.map((entity) => (
            <button
              key={entity.id}
              className="adventure-entity"
              aria-pressed={selected === entity.id}
              onClick={() => onSelect(entity)}
            >
              <span
                className={`adventure-entity-mark adventure-entity-mark-${entity.kind}`}
                aria-hidden="true"
              >
                {entity.name.slice(0, 1)}
              </span>
              <span>
                <strong>{entity.name}</strong>
                <small>
                  {entity.kind === "person" ? "A person to speak with" : "Examine closely"}
                </small>
              </span>
              <span className="adventure-entity-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="adventure-muted adventure-empty">{empty}</p>
      )}
    </section>
  );
}

export function AdventureComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  pending,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
  pending: string | null;
  placeholder: string;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim() && !disabled) onSubmit(value.trim());
  }
  return (
    <form className="adventure-composer" onSubmit={submit}>
      <label htmlFor="adventure-intention">What will you do?</label>
      <textarea
        id="adventure-intention"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (value.trim() && !disabled) onSubmit(value.trim());
          }
        }}
      />
      <div className="adventure-composer-footer">
        <span>{pending || "Enter to continue · Shift+Enter for a new line"}</span>
        <button type="submit" disabled={disabled || !value.trim()}>
          {pending ? "A moment…" : "Continue the story"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}

export function AdventurePanel({
  campaign,
  theme,
  cover,
  presentation,
  campaigns = [],
}: {
  campaign: Campaign;
  theme: AdventureTheme;
  cover?: string;
  presentation?: Partial<AdventurePresentation>;
  campaigns?: Array<{ id: string; title: string; source: string }>;
}) {
  const identity = { ...presentations[theme], theme, cover, ...presentation };
  const session = useCampaignKey(campaign);
  const story = useAdventure(session.key, campaign, identity.cover);
  const openingPlayer = campaign.entities.find((entity) => entity.id === campaign.playerId)!;
  const opening = campaign.entities.find((entity) => entity.id === openingPlayer.location)!;
  const location = story.game?.view.location ?? opening;
  const entities = story.game?.view.entities ?? [];
  const inventory = story.game?.view.inventory ?? [];
  const exits = story.game?.view.exits ?? {};
  const journal = story.game?.world.journal ?? [];
  const artwork = story.game?.world.artwork[location.id];
  const [words, setWords] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const journalRef = useRef<HTMLDialogElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const followingProse = useRef(true);
  const item = [...entities, ...inventory].find((entity) => entity.id === selected);
  const pending = story.game?.pending;
  const busy = story.working || !!pending;
  const currentParticipant = pending?.participants.find((id) => !pending.replies.includes(id));
  const participantName =
    story.game?.world.entities.find((entity) => entity.id === currentParticipant)?.name ??
    story.game?.neededSeats.find((seat) => seat.role === `person:${currentParticipant}`)?.name;
  const scene = story.game?.background.scene;
  const painting =
    scene?.placeId === location.id && (scene.status === "queued" || scene.status === "painting");
  const diagnostic = pending?.diagnostic?.replace(/^Error:\s*/, "") ?? "";
  const frontierName = diagnostic.startsWith("FRONTIER:")
    ? story.game?.world.entities.find(
        (entity) => entity.id === diagnostic.slice("FRONTIER:".length).trim()
      )?.name
    : undefined;
  const waiting = !story.game
    ? "Opening your journal…"
    : pending?.phase === "builder"
      ? pending.purpose === "frontier" || diagnostic.startsWith("FRONTIER:")
        ? `Exploring ${frontierName ?? "a new place"} for the first time; new places take a little longer…`
        : pending.purpose === "extension" || diagnostic.startsWith("UNMODELED:")
          ? "Making room for your idea…"
          : "The world keeper is repairing an unexpected turn…"
      : pending?.phase === "participants"
        ? participantName
          ? `${participantName} is responding…`
          : "Someone considers their next move…"
        : busy
          ? "Considering your intention…"
          : null;
  const error = navigationError ?? session.error ?? story.error ?? pending?.error;
  useEffect(() => {
    setSelected(null);
  }, [location.id]);
  useEffect(() => {
    const prose = proseRef.current;
    if (prose && followingProse.current) prose.scrollTop = prose.scrollHeight;
  }, [journal.at(-1)?.id]);
  useEffect(() => {
    setWords("");
    setSelected(null);
    setJournalOpen(false);
    followingProse.current = true;
  }, [session.key]);
  useEffect(() => {
    if (journalOpen) journalRef.current?.showModal();
    else journalRef.current?.close();
  }, [journalOpen]);
  async function play(text: string) {
    if (await story.play(text))
      setWords((current) => (current.trim() === text.trim() ? "" : current));
  }
  function compose(text: string) {
    setWords(text);
    document.getElementById("adventure-intention")?.focus();
  }
  const prose = journal.slice(-40);
  async function changeCampaign(id: string) {
    const destination = campaigns.find((option) => option.id === id);
    if (!destination || destination.id === campaign.id) return;
    try {
      await panel.reopen({ source: destination.source, stateArgs: {} });
    } catch (reason) {
      setNavigationError(reason instanceof Error ? reason.message : String(reason));
    }
  }
  const tide = location.components["tide"];
  const clock = location.components["clock"] ?? location.components["timeOfDay"];
  const sceneLoading = (
    <div className="adventure-image-wait" role="status">
      <Crest theme={theme} />
      <span>The scene comes into focus</span>
    </div>
  );
  const initialCover = location.id === opening.id && identity.cover;

  return (
    <main
      className={`adventure adventure-${theme}`}
      data-game-key={session.key ?? ""}
      data-location={location.id}
      data-revision={story.game?.world.revision ?? 0}
      data-tick={story.game?.world.tick ?? 0}
      data-asset-id={artwork?.id ?? ""}
      data-pending={pending?.phase ?? ""}
      data-ready={Boolean(story.game)}
      data-scene-fresh={Boolean(story.game?.visual.fresh)}
      data-scene-status={scene?.status ?? ""}
    >
      <header className="adventure-masthead">
        <div className="adventure-brand">
          <Crest theme={theme} />
          <div>
            <span className="adventure-imprint">{identity.imprint}</span>
            <h1>{campaign.title}</h1>
          </div>
        </div>
        <div className="adventure-header-actions">
          <button className="adventure-journal-button" onClick={() => setJournalOpen(true)}>
            Your journal <span aria-hidden="true">↗</span>
          </button>
          <details className="adventure-journey-menu">
            <summary>Journeys</summary>
            <div>
              <button disabled={busy} onClick={() => void session.newJourney()}>
                Begin a new journey
              </button>
              <p>Your existing journeys stay saved.</p>
              {session.journeys.length > 1 && (
                <label>
                  Resume a journey
                  <select
                    value={session.key ?? ""}
                    disabled={busy}
                    onChange={(event) => void session.chooseJourney(event.target.value)}
                  >
                    {session.journeys.map((journey) => (
                      <option key={journey.key} value={journey.key}>
                        {journey.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {campaigns.length > 0 && (
                <label>
                  Choose an adventure
                  <select
                    value={campaign.id}
                    disabled={busy}
                    onChange={(event) => void changeCampaign(event.target.value)}
                  >
                    {campaigns.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </details>
        </div>
      </header>
      <div className="adventure-edition">
        <span>{identity.chapter}</span>
        <span>
          Moment {String(story.game?.world.tick ?? 0).padStart(2, "0")}
          {typeof tide === "string" && (
            <>
              {" "}
              <i /> Tide: {tide}
            </>
          )}
          {typeof clock === "string" && (
            <>
              {" "}
              <i /> {clock}
            </>
          )}
        </span>
      </div>
      <AdventureScene
        caption={
          artwork && !story.game?.visual.fresh
            ? `Previous view${painting ? " · A new illustration is being painted" : ""}`
            : painting
              ? "A new illustration is being painted"
              : ""
        }
        image={
          artwork ? (
            <GeneratedImage
              asset={artwork}
              alt={location.description}
              loadingFallback={sceneLoading}
              errorFallback={() => (
                <div className="adventure-image-wait" role="alert">
                  <span>The illustration could not be opened.</span>
                  <p>You can keep exploring while it returns.</p>
                </div>
              )}
            />
          ) : initialCover ? (
            <img src={initialCover} alt={opening.description} />
          ) : painting ? (
            sceneLoading
          ) : (
            <div className="adventure-image-wait">
              <Crest theme={theme} />
              <span>This place has not been illustrated yet.</span>
              <p>You can keep exploring.</p>
            </div>
          )
        }
      >
        <div className="adventure-location-mark">
          <span>Presently</span>
          {typeof location.components["weather"] === "string" && (
            <span>{location.components["weather"]}</span>
          )}
        </div>
        <div className="adventure-location">
          <span className="adventure-eyebrow">{campaign.subtitle}</span>
          <h2>{location.name}</h2>
          <p>{location.description}</p>
        </div>
      </AdventureScene>
      <div className="adventure-body">
        <section className="adventure-story" aria-label="Your story">
          <div className="adventure-section-heading">
            <span className="adventure-eyebrow">Recent events</span>
            <span className="adventure-flourish" aria-hidden="true">
              ✦
            </span>
          </div>
          <div
            className="adventure-prose"
            ref={proseRef}
            onScroll={() => {
              const prose = proseRef.current;
              if (prose)
                followingProse.current =
                  prose.scrollHeight - prose.scrollTop - prose.clientHeight < 30;
            }}
            tabIndex={0}
            aria-label="Recent story"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {prose.length ? (
              prose.map((entry) => (
                <p
                  key={entry.id}
                  data-event-id={entry.id}
                  data-event-kind={entry.kind}
                  className={
                    entry.kind === "speech"
                      ? "adventure-dialogue"
                      : entry.kind === "player"
                        ? "adventure-player-intention"
                        : entry.kind === "narration"
                          ? ""
                          : "adventure-stage-direction"
                  }
                >
                  {entry.text}
                </p>
              ))
            ) : (
              <p>{campaign.intro}</p>
            )}
          </div>
          {pending && (
            <div className="adventure-pending" role="status">
              <span className={pending.error ? "" : "adventure-pulse"} />
              <span>
                {pending.error && pending.phase !== "builder" ? "Your story is paused." : waiting}
              </span>
            </div>
          )}
          {error && (
            <div className="adventure-error" role="alert">
              <strong>A little interruption.</strong>
              <p>
                {pending
                  ? pending.phase === "builder"
                    ? "The world keeper is working to resolve this. You can resume if the story has stopped."
                    : "Your last action is still here. Resume when you’re ready."
                  : story.game
                    ? "Part of the journey could not finish loading. Your progress is saved; you can keep exploring or try again."
                    : "We couldn’t open this journey yet. Please try again in a moment."}
              </p>
              <details>
                <summary>Details</summary>
                <p>{error}</p>
              </details>
              <button
                onClick={() => void (pending ? story.retry() : story.refresh())}
                disabled={story.working}
              >
                Resume the story
              </button>
            </div>
          )}
          <AdventureComposer
            value={words}
            onChange={setWords}
            onSubmit={(text) => void play(text)}
            disabled={busy || !story.game}
            pending={waiting}
            placeholder={identity.prompt}
          />
          <div className="adventure-turn-controls">
            {pending ? (
              <button disabled={story.working} onClick={() => void story.cancel()}>
                Cancel this intention
              </button>
            ) : (
              <button
                disabled={busy || !story.game}
                onClick={() =>
                  void play(
                    "Please give me a gentle, spoiler-light hint based only on what I have discovered. Suggest one useful next step without taking it for me."
                  )
                }
              >
                A gentle hint
              </button>
            )}
            <span>
              {pending
                ? "Completed actions stay in your journal."
                : "Time moves with your actions."}
            </span>
          </div>
          <div className="adventure-save-note">
            Your place in the story is kept automatically.<span aria-hidden="true">✦</span>
          </div>
        </section>
        <aside className="adventure-sidebar" aria-label="Explore your surroundings">
          <EntityCollection
            title="Here with you"
            entities={entities}
            selected={selected ?? undefined}
            onSelect={(entity) => setSelected(entity.id)}
            empty="Take a moment to look around."
          />
          {item && (
            <section className="adventure-inspector" aria-label={`About ${item.name}`}>
              <div>
                <h3>{item.name}</h3>
                <button aria-label="Close details" onClick={() => setSelected(null)}>
                  ×
                </button>
              </div>
              <p>{item.description}</p>
              {typeof item.components["effectiveLight"] === "boolean" && (
                <p aria-label="Light condition">
                  {item.components["effectiveLight"]
                    ? "Its light is shining."
                    : item.components["light"]
                      ? "Its light is blocked by a covering."
                      : "Its light is off."}
                </p>
              )}
              {typeof item.components["capacity"] === "number" && (
                <p>Capacity: {item.components["capacity"]} volume units.</p>
              )}
              {typeof item.components.readable === "string" && (
                <blockquote className="adventure-readable" aria-label={`Text of ${item.name}`}>
                  {item.components.readable}
                </blockquote>
              )}
              <div className="adventure-inspector-actions">
                <button onClick={() => compose(`Examine ${item.name}.`)}>Examine</button>
                {item.kind === "person" && (
                  <button onClick={() => compose(`Ask ${item.name} about `)}>Talk</button>
                )}
                {item.components["portable"] && item.location !== campaign.playerId && (
                  <button onClick={() => compose(`Pick up ${item.name}.`)}>Pick up</button>
                )}
                {item.components["readable"] && (
                  <button onClick={() => compose(`Read ${item.name}.`)}>Read</button>
                )}
                {(item.actions ?? []).map((action) => (
                  <button key={action} onClick={() => compose(`${action} ${item.name}.`)}>
                    {action}
                  </button>
                ))}
              </div>
            </section>
          )}
          <EntityCollection
            title={identity.inventoryTitle}
            entities={inventory}
            selected={selected ?? undefined}
            onSelect={(entity) => setSelected(entity.id)}
            empty="Only your curiosity, for now."
          />
          <section className="adventure-exits" aria-label="Ways onward">
            <h3>Ways onward</h3>
            {Object.entries(exits).map(([label, destination]) => (
              <button
                key={destination}
                disabled={busy || !story.game}
                onClick={() => void play(`Go ${label}.`)}
              >
                <span>
                  {label}
                  {story.game?.world.entities.find((entity) => entity.id === destination)
                    ?.components.frontier && <small>Unexplored</small>}
                </span>
                <span aria-hidden="true">⟶</span>
              </button>
            ))}
            {!Object.keys(exits).length && (
              <p className="adventure-muted">Look around to find your next step.</p>
            )}
          </section>
        </aside>
      </div>
      <footer className="adventure-colophon">
        <Crest theme={theme} />
        <span>{campaign.title}</span>
      </footer>
      <dialog
        className={`adventure-journal-dialog adventure-${theme}`}
        ref={journalRef}
        onCancel={() => setJournalOpen(false)}
        onClose={() => setJournalOpen(false)}
        onClick={(event) => {
          if (event.target === journalRef.current) setJournalOpen(false);
        }}
      >
        <div className="adventure-journal-sheet">
          <button className="adventure-journal-close" onClick={() => setJournalOpen(false)}>
            Close journal <span aria-hidden="true">×</span>
          </button>
          <JournalTabs
            game={story.game}
            history={<AdventureJournal entries={journal} title={identity.journalTitle} />}
          />
        </div>
      </dialog>
    </main>
  );
}
