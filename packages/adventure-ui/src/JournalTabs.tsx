import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { ServiceView } from "@workspace/adventure-engine";

/** These pages project only the player view and witnessed journal; they invent no story facts. */
export function JournalTabs({ game, history }: { game: ServiceView | null; history: ReactNode }) {
  const [tab, setTab] = useState("Events");
  const tabs = ["Events", "People", "Papers", "Leads", "Map"];
  const view = game?.view;
  const visible = view ? [view.location, ...view.entities, ...view.inventory] : [];
  const people = visible.filter((entity) => entity.kind === "person");
  const papers = visible.filter((entity) => typeof entity.components.readable === "string");
  const observations = game?.world.journal.filter((entry) => entry.kind === "observation") ?? [];
  const relations =
    game?.world.relations.filter(
      (relation) =>
        visible.some((entity) => entity.id === relation.from) &&
        visible.some((entity) => entity.id === relation.to)
    ) ?? [];
  const conversations = game?.world.journal.filter((entry) => entry.kind === "speech") ?? [];
  return (
    <>
      <nav className="adventure-journal-tabs" aria-label="Journal sections">
        {tabs.map((name) => (
          <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === "Events" ? (
        history
      ) : (
        <section className="adventure-notebook-page" aria-label={tab}>
          <h2>{tab}</h2>
          {tab === "People" && (
            <>
              <p className="adventure-notebook-note">
                People here, and the conversations you have witnessed.
              </p>
              {people.map((person) => (
                <article key={person.id}>
                  <h3>{person.name}</h3>
                  <p>{person.description}</p>
                </article>
              ))}
              {conversations.map((entry) => (
                <blockquote key={entry.id}>
                  <ReactMarkdown skipHtml>{entry.text}</ReactMarkdown>
                </blockquote>
              ))}
              {!people.length && !conversations.length && <p>No encounters recorded yet.</p>}
            </>
          )}
          {tab === "Papers" && (
            <>
              <p className="adventure-notebook-note">
                Legible papers currently within reach. Sealed contents stay sealed.
              </p>
              {papers.map((paper) => (
                <article key={paper.id}>
                  <h3>{paper.name}</h3>
                  <p className="adventure-readable">{paper.components.readable}</p>
                </article>
              ))}
              {!papers.length && <p>There are no open papers to consult here.</p>}
            </>
          )}
          {tab === "Leads" && (
            <>
              <p className="adventure-notebook-note">
                Your observations and the connections visible here.
              </p>
              {relations.map((relation) => (
                <article key={relation.id}>
                  <p>
                    {visible.find((entity) => entity.id === relation.from)!.name}{" "}
                    <em>{relation.kind.replaceAll("_", " ").replaceAll("-", " ")}</em>{" "}
                    {visible.find((entity) => entity.id === relation.to)!.name}
                  </p>
                </article>
              ))}
              {observations.map((entry) => (
                <article key={entry.id}>
                  <ReactMarkdown skipHtml>{entry.text}</ReactMarkdown>
                </article>
              ))}
              {!relations.length && !observations.length && (
                <p>Look closely, read something, or ask a question to discover a lead.</p>
              )}
            </>
          )}
          {tab === "Map" && view && (
            <>
              <p className="adventure-notebook-note">
                You are at {view.location.name}. These are the routes currently offered to you.
              </p>
              <ul className="adventure-notebook-map">
                {Object.entries(view.exits).map(([label, destination]) => {
                  const place = game?.world.entities.find((entity) => entity.id === destination);
                  return (
                    <li key={destination}>
                      <span>{label}</span>
                      <small>{place?.components.frontier ? "Unexplored" : "Route from here"}</small>
                    </li>
                  );
                })}
              </ul>
              {!Object.keys(view.exits).length && <p>No onward route is apparent from here.</p>}
            </>
          )}
        </section>
      )}
    </>
  );
}
