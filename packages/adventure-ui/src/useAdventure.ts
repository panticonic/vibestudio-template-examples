import { useEffect, useMemo, useRef, useState } from "react";
import { panel } from "@workspace/runtime";
import { useStateArgs } from "@workspace/react";
import type { Campaign, ServiceView } from "@workspace/adventure-engine";
import { AdventureClient } from "./client.js";

export function useCampaignKey(campaign: Campaign) {
  const args = useStateArgs<{ gameKey?: string }>();
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
  return { key: args.gameKey ?? saved, error };
}

/** Polling is intentionally small: the world owns simulation and survives this view. */
export function useAdventure(key: string | null, campaign: Campaign, cover?: string) {
  const client = useMemo(
    () => (key ? new AdventureClient(key, campaign, cover) : null),
    [key, campaign, cover]
  );
  const [game, setGame] = useState<ServiceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const version = useRef(0);
  const locked = useRef(false);
  const alive = useRef(true);
  const activeClient = useRef(client);
  activeClient.current = client;
  const uncertain = useRef<{ id: string; text: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    setGame(null);
    setError(null);
    setReadError(null);
    if (!client) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const previous = version.current;
      try {
        const next = await client!.get();
        if (!stopped && previous === version.current) {
          setGame(next);
          setReadError(null);
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
        setGame(next);
        uncertain.current = null;
      }
      return true;
    } catch (reason) {
      if (alive.current && activeClient.current === client)
        setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      locked.current = false;
      version.current++;
      if (alive.current) setWorking(false);
    }
  }

  return {
    game,
    error: error ?? readError,
    working,
    play: (text: string) =>
      run(() => {
        const request =
          uncertain.current?.text === text ? uncertain.current : { id: crypto.randomUUID(), text };
        uncertain.current = request;
        return client!.play(request.id, request.text);
      }),
    retry: () => run(() => client!.retry()),
    refresh: () => run(() => client!.get()),
  };
}
