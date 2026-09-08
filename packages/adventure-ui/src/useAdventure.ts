import { useEffect, useMemo, useRef, useState } from "react";
import { panel } from "@workspace/runtime";
import { useStateArgs } from "@workspace/react";
import type { Campaign, ServiceView } from "@workspace/adventure-engine";
import { AdventureClient } from "./client.js";

export function useCampaignKey(campaign: Campaign) {
  const args = useStateArgs<{
    gameKey?: string;
    journeys?: Array<{ key: string; label: string }>;
  }>();
  const generated = useMemo(() => `${campaign.id}-${crypto.randomUUID()}`, [campaign.id]);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (args.gameKey) return;
    let active = true;
    void panel.stateArgs.set({ gameKey: generated }).then(
      () => {
        if (active) setSaved(generated);
      },
      (reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    );
    return () => {
      active = false;
    };
  }, [args.gameKey, generated]);
  const key = args.gameKey ?? saved;
  async function chooseJourney(nextKey: string) {
    const journeys = [...(args.journeys ?? [])];
    for (const journeyKey of [key, nextKey]) {
      if (journeyKey && !journeys.some((journey) => journey.key === journeyKey))
        journeys.push({ key: journeyKey, label: `Journey ${journeys.length + 1}` });
    }
    try {
      await panel.stateArgs.set({ gameKey: nextKey, journeys });
      setSaved(nextKey);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }
  return {
    key,
    error,
    journeys: args.journeys ?? [],
    chooseJourney,
    newJourney: () => chooseJourney(`${campaign.id}-${crypto.randomUUID()}`),
  };
}

/** Polling is intentionally small: the world owns simulation and survives this view. */
export function useAdventure(key: string | null, campaign: Campaign, cover?: string) {
  const client = useMemo(
    () => (key ? new AdventureClient(key, campaign, cover) : null),
    [key, campaign, cover]
  );
  const [snapshot, setSnapshot] = useState<{ client: AdventureClient; game: ServiceView } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const version = useRef(0);
  const locked = useRef(false);
  const alive = useRef(true);
  const activeClient = useRef(client);
  activeClient.current = client;
  const uncertain = useRef<{ client: AdventureClient; id: string; text: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    version.current++;
    locked.current = false;
    uncertain.current = null;
    setWorking(false);
    setSnapshot(null);
    setError(null);
    setReadError(null);
    setPreparationError(null);
    if (!client) return;
    let stopped = false;
    let preparationVersion = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const previous = version.current;
      try {
        const next = await client!.get();
        if (!stopped && previous === version.current) {
          setSnapshot({ client: client!, game: next });
          setReadError(null);
          // Seating or importing art must not hide subsequent world updates.
          // The client owns per-role single-flight work; errors still belong to this view.
          const preparation = ++preparationVersion;
          void client!.prepare(next).then(
            () => {
              if (!stopped && preparation === preparationVersion) setPreparationError(null);
            },
            (reason) => {
              if (!stopped && preparation === preparationVersion)
                setPreparationError(reason instanceof Error ? reason.message : String(reason));
            }
          );
        }
      } catch (reason) {
        if (!stopped && previous === version.current)
          setReadError(reason instanceof Error ? reason.message : String(reason));
      }
      if (!stopped) timer = setTimeout(poll, document.visibilityState === "hidden" ? 10000 : 2000);
    }
    void poll();
    return () => {
      stopped = true;
      alive.current = false;
      clearTimeout(timer);
    };
  }, [client]);

  async function run(operation: () => Promise<ServiceView>) {
    if (locked.current || !client) return false;
    locked.current = true;
    version.current++;
    setWorking(true);
    setError(null);
    try {
      const next = await operation();
      if (alive.current && activeClient.current === client) {
        setSnapshot({ client, game: next });
        return true;
      }
      return false;
    } catch (reason) {
      if (alive.current && activeClient.current === client)
        setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      if (alive.current && activeClient.current === client) {
        locked.current = false;
        version.current++;
        setWorking(false);
      }
    }
  }

  return {
    game: snapshot?.client === client ? snapshot.game : null,
    error: error ?? readError ?? preparationError,
    working,
    play: (text: string) =>
      run(() => {
        const request =
          uncertain.current?.client === client && uncertain.current.text === text
            ? uncertain.current
            : { client: client!, id: crypto.randomUUID(), text };
        uncertain.current = request;
        return client!.play(request.id, request.text).then((next) => {
          if (uncertain.current === request) uncertain.current = null;
          return next;
        });
      }),
    retry: () => run(() => client!.retry()),
    cancel: () =>
      run(() =>
        client!.cancel().then((next) => {
          if (uncertain.current?.client === client) uncertain.current = null;
          return next;
        })
      ),
    refresh: () => run(() => client!.get()),
  };
}
