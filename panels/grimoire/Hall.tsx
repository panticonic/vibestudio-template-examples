/**
 * Convene a hall: two or three awake spirits in one channel, arguing in
 * public about a matter, with the player admitted. The world wakes each of
 * them with the others' refs; the panel seats them and opens the door.
 */
import { useState } from "react";
import type { Overview, SpiritId } from "@workspace/grimoire-engine";
import type { EstateClient } from "./lib/client.js";
import { errorText } from "./lib/client.js";
import { convene, openHallConversation } from "./lib/estate.js";
import { SPIRIT_INK } from "./lib/palette.js";
import "./enhancements.css";

const HALL_TOPICS = [
  "the staff: silver and glass, and who holds the heat",
  "the orchard sluice: the River's water, the Orchard's feet",
  "the bell: glass for a season, or silver for good",
  "the deep: whether the nine should be released",
  "the cairns: ether for the lines, ether for the moor",
];

export function Hall({
  client,
  apprentice,
  overview,
  onToast,
}: {
  client: EstateClient;
  apprentice: string;
  overview: Overview;
  onToast: (line: string) => void;
}) {
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const awake = overview.spirits.filter((s) => s.awake && s.id !== "moor");
  const toggle = (id: string) => {
    const n = new Set(pick);
    if (n.has(id)) n.delete(id);
    else if (n.size < 3) n.add(id);
    setPick(n);
  };
  const open = async () => {
    if (pick.size < 2 || !topic.trim()) return;
    setBusy(true);
    try {
      const r = await convene(
        client,
        [...pick] as SpiritId[],
        topic.trim(),
        apprentice,
      );
      onToast(
        r.ok
          ? "They are convened. Open the hall and listen; you may speak there too."
          : (r.reason ?? "The hall stayed empty."),
      );
      if (r.ok)
        await openHallConversation(
          client,
          r.channelId,
          [...pick] as SpiritId[],
          apprentice,
        );
    } catch (err) {
      onToast(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="g-hall">
      <h3>convene a hall</h3>
      <p className="g-muted">
        Pick two or three awake spirits and a matter. They argue in public, in
        their own channel, and you may be admitted.
      </p>
      <div className="g-hall-picks">
        {awake.length ? (
          awake.map((s) => {
            const ink = SPIRIT_INK[s.id as SpiritId] ?? {
              colour: "#888",
              ornament: "✦",
            };
            return (
              <button
                key={s.id}
                className={`g-hall-pick${pick.has(s.id) ? " on" : ""}`}
                style={{ ["--spirit" as string]: ink.colour }}
                onClick={() => toggle(s.id)}
              >
                {ink.ornament} {s.title}
              </button>
            );
          })
        ) : (
          <span className="g-muted">
            No spirit is awake yet. Meet a want, and one will speak.
          </span>
        )}
      </div>
      <div className="g-hall-topic">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="the matter before them"
          list="g-hall-topics"
        />
        <datalist id="g-hall-topics">
          {HALL_TOPICS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          className="g-primary"
          disabled={busy || pick.size < 2 || !topic.trim()}
          onClick={() => void open()}
        >
          convene
        </button>
      </div>
      {(overview.halls ?? []).length > 0 && (
        <ul className="g-halls">
          {[...overview.halls].reverse().map((h) => (
            <li key={h.key}>
              <button
                className="g-text-action"
                onClick={() =>
                  void openHallConversation(
                    client,
                    h.key,
                    h.spirits,
                    apprentice,
                  ).catch((cause) => onToast(errorText(cause)))
                }
              >
                {h.spirits
                  .map(
                    (id) =>
                      overview.spirits.find((s) => s.id === id)?.title ?? id,
                  )
                  .join(" & ")}
              </button>{" "}
              — <em>{h.topic}</em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
