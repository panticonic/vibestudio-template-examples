import { StoryText } from "@workspace/living-canvas/react";
import { useEffect, useRef, useState } from "react";
import { useStateArgs } from "@workspace/react";
import { panel } from "@workspace/runtime";
import { initialGame } from "@workspace/regency-engine";
import { Kingdom } from "./Kingdom.js";
import { RealmScene } from "./RealmScene.js";
import { useStory } from "./lib/useStory.js";
import { chime, closeAudio } from "./lib/sound.js";
import "./styles.css";
export default function Regency() {
  const args = useStateArgs<{ gameKey?: string }>();
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const proposedKey = useRef<string | null>(null);
  async function createWorld() {
    proposedKey.current ??= crypto.randomUUID();
    setCreating(true);
    setCreationError(null);
    try {
      await panel.stateArgs.set({ gameKey: proposedKey.current });
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }
  if (!args.gameKey)
    return (
      <main className="regency story-entry">
        <h1>Regency</h1>
        <p>
          Begin your own realm. Your progress stays with this panel so you can
          return later.
        </p>
        {creationError ? <p role="alert">{creationError}</p> : null}
        <button disabled={creating} onClick={() => void createWorld()}>
          {creating ? "Creating…" : "Begin a new story"}
        </button>
      </main>
    );
  return <RegencyWorld key={args.gameKey} worldKey={args.gameKey} />;
}

function RegencyWorld({ worldKey }: { worldKey: string }) {
  const story = useStory(worldKey);
  const game = story.view?.game ?? initialGame();
  const [words, setWords] = useState(""),
    [sound, setSound] = useState(false),
    log = useRef<HTMLDivElement>(null),
    last = useRef(game.turn);
  const busy = story.working || !!story.view?.pending;
  const place = game.world.places.find((p) => p.id === game.world.location);
  useEffect(() => {
    if (game.turn > last.current && sound) chime();
    last.current = game.turn;
  }, [game.turn, busy, sound]);
  useEffect(() => () => closeAudio(), []);
  async function say(text: string) {
    if (text.trim() && (await story.play(text.trim())))
      setWords((current) => (current.trim() === text.trim() ? "" : current));
  }
  if (!story.view)
    return (
      <main className="regency story-entry" aria-busy={!story.error}>
        <h1>Regency</h1>
        {story.error ? (
          <p role="alert">{story.error}</p>
        ) : (
          <p>Opening your story…</p>
        )}
      </main>
    );
  return (
    <main className="regency" aria-busy={busy}>
      {story.view.artError ? (
        <p role="status">
          The story is ready, but its illustration could not load:{" "}
          {story.view.artError}. It will refresh when the artwork is available.
        </p>
      ) : null}
      <header className="r-header">
        <a href="#kingdom" className="wordmark">
          <span>♜</span> Regency
        </a>
        <span className="edition">the art of ruling</span>
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
      <div className="storybook">
        <div className="realm-exploration">
          <RealmScene
            game={game}
            artworks={story.view?.artworks}
            busy={busy || !story.view}
            onIntent={(text) => void say(text)}
          />
          <details className="realm-atlas">
            <summary>
              Open the living atlas · economy and administration
            </summary>
            <section
              id="kingdom"
              className="kingdom-stage"
              aria-label="The world around you"
            >
              <Kingdom
                scene={game.scene}
                world={game.world}
                annotations={game.world.economy.regions.map((region) => ({
                  x: region.x,
                  y: region.y,
                  label: region.name,
                  kind: "observed" as const,
                  detail:
                    region.character +
                    " Food reserves: " +
                    Math.round(
                      (region.grain / Math.max(1, region.consumption)) * 4,
                    ) +
                    " weeks. " +
                    (game.world.economy.reports.find((report) =>
                      report.startsWith(region.name),
                    ) ?? ""),
                }))}
                artworks={story.view?.artworks}
                busy={busy}
                onRepair={(error) =>
                  void say(
                    "Please repair the illustration without changing policy or time. Drawing feedback: " +
                      error.slice(0, 250),
                  )
                }
              />
              <div className="scene-caption">
                <span className="eyebrow">{game.world.time}</span>
                <h1>{game.title}</h1>
              </div>
              <div className="realm-signals">
                {game.world.ledger.slice(0, 3).map((item) => (
                  <div key={item.id} title={item.context}>
                    <span>{item.label}</span>
                    <strong>
                      {item.amount} <small>{item.unit}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <div className="realm-moment">
                <span>{game.world.economy.reports[0]}</span>
                <button
                  disabled={busy || !story.view}
                  onClick={() => void story.advance()}
                >
                  Let a month pass ↗
                </button>
              </div>
            </section>
          </details>
        </div>
        <section className="conversation" aria-label="Your council">
          <div className="conversation-heading">
            <span className="eyebrow">{place?.name}</span>
            <span className="present">
              {game.people
                .filter((p) => p.place === game.world.location)
                .map((p) => p.name)
                .join(" · ")}
            </span>
          </div>
          <div
            className="conversation-log"
            role="log"
            ref={log}
            aria-label="Council conversation"
          >
            {!game.history.length && (
              <>
                <p className="narration">{game.response}</p>
                {game.dialogue.map((line, i) => (
                  <div className="character-message" key={i}>
                    <span>{line.speaker}</span>
                    <StoryText>{line.text}</StoryText>
                  </div>
                ))}
              </>
            )}
            {game.history.map((entry) => (
              <div className="exchange" key={entry.id}>
                <p className="player-message">
                  <span>You</span>
                  {entry.wish}
                </p>
                <p className="narration">{entry.response}</p>
                {entry.dialogue.map((line, i) => (
                  <div className="character-message" key={i}>
                    <span>{line.speaker}</span>
                    <StoryText>{line.text}</StoryText>
                  </div>
                ))}
              </div>
            ))}
            {busy &&
              story.view?.pending?.audience?.map((id) => {
                const voice = story.view!.pending!.voices[id];
                return voice ? (
                  <div className="character-message incoming-advice" key={id}>
                    <span>
                      {story.view!.pending!.cast.find((p) => p.id === id)?.name}
                    </span>
                    <StoryText>{voice.text}</StoryText>
                  </div>
                ) : null;
              })}
            {busy && (
              <p className="waiting-message" role="status">
                {story.view?.pending
                  ? `“${story.view.pending.wish}” — the conversation is unfolding…`
                  : "A moment, while everyone arrives…"}
              </p>
            )}
          </div>
          {game.proposals
            .filter((p) => !game.programs.some((active) => active.id === p.id))
            .slice(-1)
            .map((p) => (
              <aside className="policy-proposal" key={p.id}>
                <span className="eyebrow">PROPOSED · NOT ENACTED</span>
                <h2>{p.title}</h2>
                <p>{p.summary}</p>
                {p.forecast.slice(0, 4).map((line, i) => (
                  <span className="forecast-line" key={i}>
                    {line}
                  </span>
                ))}
                {p.forecast.length > 4 && (
                  <details className="forecast-detail">
                    <summary>Why the forecast changes</summary>
                    {p.forecast.slice(4).map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </details>
                )}
                <button disabled={busy} onClick={() => void story.enact(p.id)}>
                  Enact this decree ↗
                </button>
              </aside>
            ))}
          {game.world.policies.length > 0 && (
            <details className="enacted-policies">
              <summary>
                {game.world.policies.length} enacted{" "}
                {game.world.policies.length === 1 ? "policy" : "policies"}
              </summary>
              {game.world.policies.map((p) => (
                <p key={p.id}>
                  <strong>{p.title}</strong>
                  <br />
                  {p.status}
                </p>
              ))}
            </details>
          )}
          {game.world.month > 0 && (
            <details className="realm-evidence">
              <summary>
                What changed this month <span>↗</span>
              </summary>
              <div className="account-line">
                <span>Income {game.world.economy.accounts.revenue}</span>
                <span>Services {game.world.economy.accounts.services}</span>
                <span>Works {game.world.economy.accounts.works}</span>
                <span>Standing {game.world.economy.accounts.standing}</span>
              </div>
              {game.world.economy.reports.map((report, i) => (
                <p key={i}>{report}</p>
              ))}
            </details>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void say(words);
            }}
          >
            <label htmlFor="words" className="sr-only">
              What would you like to ask or decree?
            </label>
            <div className="composer">
              <textarea
                id="words"
                value={words}
                onChange={(e) => setWords(e.target.value)}
                rows={2}
                maxLength={500}
                disabled={!story.view}
                placeholder="Ask your council. Consider a policy. Give an order."
              />
              <button
                type="submit"
                aria-label="Say it"
                disabled={busy || !story.view || !words.trim()}
              >
                {busy ? "✧" : "↗"}
              </button>
            </div>
          </form>
          {!busy && (
            <div className="suggestions">
              {game.suggestions.map((text) => (
                <button
                  disabled={!story.view}
                  key={text}
                  onClick={() => void say(text)}
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
                  ? "The story needs a little more time."
                  : "We couldn’t reach the story."}
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
      </div>
      <footer>Advice is not an order. Your decrees shape the realm.</footer>
    </main>
  );
}
