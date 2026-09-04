/**
 * The household: who shares the valley, where they are, and a door to open
 * the estate as another apprentice. Two to five apprentices share one
 * valley; rituals need more than one voice and irreversible workings need
 * another's seal.
 */
import { openPanel, contextId as runtimeContextId } from "@workspace/runtime";
import type { Overview } from "@workspace/grimoire-engine";
import type { EstateClient } from "./lib/client.js";
import { mintApprenticeId } from "./lib/estate.js";
import "./enhancements.css";

export function Household({
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
  const another = async () => {
    try {
      await openPanel("panels/grimoire", {
        focus: true,
        contextId: runtimeContextId ?? undefined,
        placement: { disposition: "side-if-room" },
        stateArgs: {
          estateKey: client.estateKey,
          apprentice: mintApprenticeId(),
        },
      });
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <section className="g-household">
      <h3>the household</h3>
      <ul>
        {overview.apprentices.map((a) => (
          <li key={a.id}>
            <span className={`g-dot${a.present ? " present" : ""}`} />
            {a.name}
            {a.id === apprentice ? " (you)" : ""} ·{" "}
            {a.present ? `in ${a.region}` : "away"} · {a.reserve}/{a.reserveMax}{" "}
            ether
          </li>
        ))}
      </ul>
      <p className="g-muted">
        Everything is shared but the familiar's conversation, the reserve and
        the spellbook. Shelve a verse in the chapel and the others may speak it.
        A council card needs another's seal when there is another.
      </p>
      <button className="g-text-action" onClick={() => void another()}>
        open the estate as another apprentice →
      </button>
    </section>
  );
}
