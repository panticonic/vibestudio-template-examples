import { StoryText } from "@workspace/living-canvas/react";
import { useEffect, useRef, useState } from "react";
import { useStateArgs } from "@workspace/react";
import { panel } from "@workspace/runtime";
import { initialGame } from "@workspace/grimoire-engine";
import { Garden } from "./Garden.js";
import { useStory } from "./lib/useStory.js";
import { chime, closeAudio } from "@workspace/living-canvas/sound";
import "./styles.css";
export default function Grimoire() {
  const args = useStateArgs<{ estateKey?: string }>();
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const proposedKey = useRef<string | null>(null);
  async function createWorld() {
    proposedKey.current ??= crypto.randomUUID();
    setCreating(true);
    setCreationError(null);
    try {
      await panel.stateArgs.patch({ estateKey: proposedKey.current });
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }
  if (!args.estateKey)
    return (
      <main className="grimoire story-entry">
        <h1>Grimoire</h1>
        <p>
          Begin your own garden. Your progress stays with this panel so you can
          return later.
        </p>
        {creationError ? <p role="alert">{creationError}</p> : null}
        <button disabled={creating} onClick={() => void createWorld()}>
          {creating ? "Creating…" : "Begin a new story"}
        </button>
      </main>
    );
  return <GrimoireWorld key={args.estateKey} worldKey={args.estateKey} />;
}

function GrimoireWorld({ worldKey }: { worldKey: string }) {
  const story = useStory(worldKey);
  const game = story.view?.game ?? initialGame();
  const [wish, setWish] = useState(""),
    [sound, setSound] = useState(false);
  const last = useRef(game.turn),
    log = useRef<HTMLDivElement>(null);
  const garden = story.view?.garden ?? game.life.garden;
  const busy = story.working || !!story.view?.pending;
  useEffect(() => {
    if (game.turn > last.current && sound) chime();
    last.current = game.turn;
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [game.turn, busy, sound]);
  useEffect(() => () => closeAudio(), []);
  async function cast(text: string) {
    if (text.trim() && (await story.play(text.trim())))
      setWish((current) => (current.trim() === text.trim() ? "" : current));
  }
  if (!story.view)
    return (
      <main className="grimoire story-entry" aria-busy={!story.error}>
        <h1>Grimoire</h1>
        {story.error ? (
          <>
            <p role="alert">{story.error}</p>
            <button
              onClick={() => void story.refresh()}
              disabled={story.working}
            >
              Try opening again
            </button>
          </>
        ) : (
          <p>Opening your story…</p>
        )}
      </main>
    );
  return (
    <main className="grimoire" aria-busy={busy}>
      {story.view.artError ? (
        <p role="status">
          The story is ready, but its illustration could not load:{" "}
          {story.view.artError}. It will refresh when the artwork is available.
        </p>
      ) : null}
      <header className="g-header">
        <a className="wordmark" href="#garden">
          <span aria-hidden="true">✧</span> Grimoire
        </a>
        <span className="edition">a world we haven’t imagined yet</span>
        <button
          className="sound"
          aria-pressed={sound}
          onClick={() => {
            if (!sound) chime();
            setSound(!sound);
          }}
        >
          {sound ? "♪ Sound on" : "♪ Sound off"}
        </button>
      </header>
      <section
        id="garden"
        className="garden-stage"
        aria-label="Your living world"
      >
        <Garden
          scene={game.scene}
          world={garden}
          annotations={garden.residents.map((resident) => ({
            x: resident.x,
            y: resident.y,
            label: resident.name,
            detail: resident.activity,
            kind: "observed" as const,
          }))}
          onInspect={(name) => {
            const resident = garden.residents.find((r) => r.name === name);
            if (resident && !busy) void story.visit(resident.id);
          }}
          artworks={story.view?.artworks}
          busy={busy}
          onRepair={(error) =>
            void cast(
              "Please mend the drawing while keeping our world. Drawing feedback: " +
                error.slice(0, 250),
            )
          }
        />
        <div className="garden-caption">
          <span className="eyebrow">
            DAY {garden.day} ·{" "}
            {["MORNING", "AFTERNOON", "EVENING", "NIGHT"][garden.phase]}
          </span>
          <h1>
            {game.turn ? (
              game.title
            ) : (
              <>
                Some things grow
                <br />
                <em>when we talk.</em>
              </>
            )}
          </h1>
        </div>
        <span className="garden-label">✦ {garden.weather}</span>
      </section>
      <section className="garden-observations" aria-label="Life in the garden">
        <p aria-live="polite">{story.view?.notice || garden.traces[0]}</p>
        <button
          disabled={busy || !story.view}
          onClick={() => void story.linger()}
        >
          Linger a little <span>◷</span>
        </button>
      </section>
      <section className="wish-card" aria-label="Conversation with Moth">
        <div className="conversation-heading">
          <span className={`familiar-mark ${busy ? "breathing" : ""}`}>✧</span>
          <div>
            <span className="eyebrow">MOTH</span>
            <span className="conversation-subtitle">
              Your familiar. Your accomplice.
            </span>
          </div>
        </div>
        <div
          className="conversation-log"
          ref={log}
          role="log"
          aria-label="Your conversation"
        >
          {!game.history.length && (
            <StoryText className="moth-message">{game.response}</StoryText>
          )}
          {game.history.map((entry) => (
            <div className="exchange" key={entry.id}>
              <p className="player-message">
                <span>You</span>
                {entry.wish}
              </p>
              <div className="moth-message">
                <span>Moth</span>
                <StoryText>{entry.response}</StoryText>
              </div>
            </div>
          ))}
          {busy && story.view?.pending?.reply && (
            <StoryText className="moth-message incoming-reply">
              {story.view.pending.reply}
            </StoryText>
          )}
          {busy && (
            <p className="waiting-message" role="status">
              {story.view?.pending
                ? `“${story.view.pending.wish}” — a flutter of wings; Moth is thinking…`
                : "Moth is coming to meet you…"}
            </p>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cast(wish);
          }}
        >
          <label htmlFor="wish" className="sr-only">
            Talk to Moth
          </label>
          <div className="composer">
            <textarea
              id="wish"
              rows={2}
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              maxLength={500}
              placeholder="Ask, imagine, tell Moth something…"
              disabled={!story.view}
            />
            <button
              type="submit"
              aria-label="Send your message to Moth"
              disabled={busy || !story.view || !wish.trim()}
            >
              {busy ? "✧" : "Say it ↗"}
            </button>
          </div>
        </form>
        {!busy && (
          <div className="suggestions">
            {game.suggestions.map((text) => (
              <button
                key={text}
                disabled={!story.view}
                onClick={() => void cast(text)}
              >
                {text} ↗
              </button>
            ))}
          </div>
        )}
        {(story.error || story.view?.pending?.error || story.slow) && (
          <div
            className="recovery"
            role={
              story.error || story.view?.pending?.error ? "alert" : "status"
            }
          >
            <p>
              {story.view?.pending
                ? story.view.pending.error
                  ? "Moth could not finish this request. Your message is kept below."
                  : "Moth is still working on your request."
                : "The conversation couldn’t reach Moth."}
            </p>
            {story.view?.pending && (
              <>
                <button
                  disabled={story.working}
                  onClick={() => void story.retry()}
                >
                  Try again
                </button>
                <button
                  disabled={story.working}
                  onClick={() => void story.cancel()}
                >
                  Leave it for now
                </button>
              </>
            )}
            <details>
              <summary>Connection details</summary>
              {story.error || story.view?.pending?.error || "Still thinking."}
            </details>
          </div>
        )}
      </section>
      {garden.discoveries.length > 0 && (
        <section
          className="garden-keepsakes"
          aria-label="Things we have discovered"
        >
          <span className="eyebrow">THINGS THAT HAVE BECOME OURS</span>
          {garden.discoveries.slice(-3).map((discovery) => (
            <article key={discovery.id}>
              <span>✧</span>
              <div>
                <h2>{discovery.title}</h2>
                <p>{discovery.text}</p>
                <small>Day {discovery.day}</small>
              </div>
            </article>
          ))}
          {garden.discoveries.length > 3 && (
            <details className="earlier-keepsakes">
              <summary>Earlier discoveries</summary>
              {garden.discoveries.slice(0, -3).map((d) => (
                <p key={d.id}>
                  <strong>{d.title}</strong>
                  <br />
                  {d.text}
                </p>
              ))}
            </details>
          )}
        </section>
      )}
      <footer>
        <span>No right words. Just your imagination.</span>
      </footer>
    </main>
  );
}
