import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GeneratedImage } from "@workspace/react";
import type { Campaign, Entity, JournalEntry } from "@workspace/adventure-engine";
import { useAdventure, useCampaignKey } from "./useAdventure.js";
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
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (value.trim() && !disabled) onSubmit(value.trim());
          }
        }}
      />
      <div className="adventure-composer-footer">
        <span>{pending || "Speak naturally. The world is listening."}</span>
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
}: {
  campaign: Campaign;
  theme: AdventureTheme;
  cover?: string;
  presentation?: Partial<AdventurePresentation>;
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
  const journalRef = useRef<HTMLDialogElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const item = [...entities, ...inventory].find((entity) => entity.id === selected);
  const pending = story.game?.pending;
  const busy = story.working || (!!pending && !pending.error);
  const waiting = !story.game
    ? "Opening your journal…"
    : pending?.phase === "builder"
      ? "The world keeper is resolving an unexpected turn…"
      : pending?.phase === "artist"
        ? "The scene comes into focus…"
        : busy
          ? "The world responds…"
          : null;
  const error = session.error ?? story.error ?? pending?.error;
  useEffect(() => {
    setSelected(null);
  }, [location.id]);
  useEffect(() => {
    const prose = proseRef.current;
    if (prose) prose.scrollTop = prose.scrollHeight;
  }, [journal.at(-1)?.id]);
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
  const prose = journal
    .filter((entry) => ["narration", "speech", "player"].includes(entry.kind))
    .slice(-4);
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
    >
      <header className="adventure-masthead">
        <div className="adventure-brand">
          <Crest theme={theme} />
          <div>
            <span className="adventure-imprint">{identity.imprint}</span>
            <h1>{campaign.title}</h1>
          </div>
        </div>
        <button className="adventure-journal-button" onClick={() => setJournalOpen(true)}>
          Your journal <span aria-hidden="true">↗</span>
        </button>
      </header>
      <div className="adventure-edition">
        <span>{identity.chapter}</span>
        <span>
          Chapter I <i /> Moment {String(story.game?.world.tick ?? 0).padStart(2, "0")}
        </span>
      </div>
      <AdventureScene
        caption=""
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
          ) : pending?.phase === "artist" ? (
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
          <span>{String(story.game?.world.tick ?? 0).padStart(2, "0")} / ∞</span>
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
            tabIndex={0}
            aria-label="Recent story"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {prose.length ? (
              prose.map((entry) => (
                <p
                  key={entry.id}
                  className={
                    entry.kind === "speech"
                      ? "adventure-dialogue"
                      : entry.kind === "player"
                        ? "adventure-player-intention"
                        : ""
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
            disabled={busy || !story.game || !!pending?.error}
            pending={waiting}
            placeholder={identity.prompt}
          />
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
                disabled={busy || !story.game || !!pending?.error}
                onClick={() => void play(`Go ${label}.`)}
              >
                <span>{label}</span>
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
          <AdventureJournal entries={journal} title={identity.journalTitle} />
        </div>
      </dialog>
    </main>
  );
}
