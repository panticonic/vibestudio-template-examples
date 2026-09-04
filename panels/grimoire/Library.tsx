/**
 * The familiar's library: the lineage's idioms, seed and learned. A ward
 * that fires cleanly three times is remembered here in the caster's name,
 * and every scry shows which idiom a writing drew on.
 */
import { useEffect, useState } from "react";
import type { Idiom } from "@workspace/grimoire-engine";
import type { EstateClient } from "./lib/client.js";
import "./enhancements.css";

export function Library({ client }: { client: EstateClient }) {
  const [idioms, setIdioms] = useState<Idiom[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      client
        .call("idioms", {})
        .then((rows) => {
          if (active) setIdioms(rows);
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [client]);
  const learned = idioms.filter((i) => i.origin !== "seed");
  return (
    <div className="g-library">
      <p className="g-muted">
        What the familiar reads, adapts and invokes when it writes. The seed
        idioms came with the estate.{" "}
        {learned.length
          ? `${learned.length} learned from this household.`
          : "Nothing learned yet: a ward that fires cleanly three times is remembered here, in your name."}
      </p>
      <ul>
        {idioms.map((i) => (
          <li key={i.id} className={i.origin}>
            <button
              className="g-idiom"
              onClick={() => setOpen(open === i.id ? null : i.id)}
            >
              <span className="g-idiom-name">{i.name}</span>
              <span className="g-idiom-meta">
                {i.origin === "seed"
                  ? "with the estate"
                  : i.origin === "master"
                    ? "the master's"
                    : `learned${i.provenance ? ` from ${i.provenance}` : ""}`}{" "}
                · {i.concepts.slice(0, 4).join(", ")}
              </span>
              <span className="g-idiom-about">{i.about}</span>
            </button>
            {open === i.id && <pre className="g-idiom-source">{i.source}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}
