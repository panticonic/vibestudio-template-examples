import { StoryText } from "@workspace/living-canvas/react";
import { useEffect, useRef, useState } from "react";
import { useStateArgs } from "@workspace/react";
import { initialGame } from "@workspace/grimoire-engine";
import { Garden } from "./Garden.js";
import { useStory } from "./lib/useStory.js";
import { chime, closeAudio } from "./lib/sound.js";
import "./styles.css";
export default function Grimoire() {
  const args = useStateArgs<{ estateKey?: string }>(),
    story = useStory(args.estateKey || "garden");
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
      behavior: "smooth",
    });
  }, [game.turn, busy, sound]);
  useEffect(() => () => closeAudio(), []);
  async function cast(text: string) {
    if (text.trim() && (await story.play(text.trim())))
      setWish((current) => (current.trim() === text.trim() ? "" : current));
  }
  return (
    <main className="grimoire" aria-busy={busy}>
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
          <div className="recovery" role="status">
            <p>
              {story.view?.pending
                ? "Moth needs a little more time."
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
