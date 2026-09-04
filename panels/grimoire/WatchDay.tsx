/**
 * Watch the day: twenty-four ticks in short steps, refreshing between them so
 * the ink spreads on the map. Also seats chartered golems as agents as soon
 * as the world reports a charter, so a golem explains itself and writes to
 * the news while the household sleeps.
 */
import { useCallback, useRef, useState } from "react";
import type { Overview } from "@workspace/grimoire-engine";
import type { EstateClient } from "./lib/client.js";
import { errorText } from "./lib/client.js";
import { seatGolem } from "./lib/estate.js";
import "./enhancements.css";

export function useWatchDay(
  client: EstateClient,
  refresh: () => Promise<void>,
  onError: (text: string) => void,
) {
  const [watching, setWatching] = useState<string | null>(null);
  const run = useCallback(async () => {
    if (watching) return;
    try {
      for (let h = 0; h < 24; h += 2) {
        setWatching(`${h + 2} of 24 hours`);
        await client.call("advance", {
          ticks: 2,
          reason: "the apprentice watched the day",
        });
        await refresh();
        await new Promise((r) => setTimeout(r, 450));
      }
    } catch (err) {
      onError(errorText(err));
    } finally {
      setWatching(null);
    }
  }, [client, refresh, onError, watching]);
  return { watching, watchDay: run };
}

export function WatchDayButton({
  watching,
  onWatch,
  disabled,
}: {
  watching: string | null;
  onWatch: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="g-watch"
      disabled={disabled || !!watching}
      onClick={onWatch}
      title="watch a day pass, hour by hour"
    >
      {watching ?? "watch the day"}
    </button>
  );
}

/** Seat every chartered golem the world reports that has no seat yet. Idempotent; remembers what it seated. */
export function useGolemSeating(
  client: EstateClient,
  apprentice: string | null,
  onToast: (line: string) => void,
) {
  const seated = useRef(new Set<string>());
  return useCallback(
    async (ov: Overview) => {
      if (!apprentice) return;
      for (const g of ov.golems ?? []) {
        if (g.mode !== "charter" || seated.current.has(g.name)) continue;
        seated.current.add(g.name);
        const r = await seatGolem(client, g.name, apprentice).catch((err) => ({
          participant: null,
          error: errorText(err),
        }));
        if (r.error) {
          seated.current.delete(g.name);
          onToast(`${g.name} could not be seated: ${r.error}`);
        } else onToast(`${g.name} has a charter now, and a voice of its own.`);
      }
    },
    [client, apprentice, onToast],
  );
}
