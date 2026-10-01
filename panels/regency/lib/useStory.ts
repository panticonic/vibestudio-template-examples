import { useEffect, useMemo, useState } from "react";
import { StoryClient, type View } from "./client.js";
export function useStory(key: string) {
  const client = useMemo(() => new StoryClient(key), [key]);
  const [owner, setOwner] = useState(client);
  const [storedView, setView] = useState<View | null>(null);
  const view = owner === client ? storedView : null;
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [slow, setSlow] = useState(false);
  const lifecycle = useMemo(
    () => ({
      revision: 0,
      locked: false,
      active: false,
      artRevision: 0,
      uncertain: null as { id: string; wish: string } | null,
    }),
    [client],
  );
  function showView(next: View) {
    if (!lifecycle.active) return;
    setView(next);
    const version = ++lifecycle.artRevision;
    void client
      .getArt(next)
      .then((art) => {
        if (lifecycle.active && lifecycle.artRevision === version) setView(art);
      })
      .catch((error) => {
        if (lifecycle.active && lifecycle.artRevision === version)
          setView({
            ...next,
            artError: error instanceof Error ? error.message : String(error),
          });
      });
  }
  useEffect(() => {
    lifecycle.active = true;
    setOwner(client);
    setView(null);
    setError(null);
    setReadError(null);
    setWorking(false);
    setSlow(false);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = lifecycle.revision;
      try {
        const next = await client.get();
        if (!stopped && version === lifecycle.revision) {
          showView(next);
          setReadError(null);
        }
      } catch (e) {
        if (!stopped && version === lifecycle.revision)
          setReadError(e instanceof Error ? e.message : String(e));
      }
      if (!stopped)
        timer = setTimeout(
          poll,
          document.visibilityState === "hidden" ? 10000 : 1800,
        );
    }
    void poll();
    return () => {
      stopped = true;
      lifecycle.active = false;
      clearTimeout(timer);
    };
  }, [client]);
  useEffect(() => {
    const check = () =>
      setSlow(!!view?.pending && Date.now() - view.pending.started > 45000);
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [view?.pending?.started]);
  async function run(operation: () => Promise<View>) {
    if (lifecycle.locked) return false;
    lifecycle.locked = true;
    lifecycle.revision++;
    setWorking(true);
    setError(null);
    try {
      const next = await operation();
      if (lifecycle.active) {
        showView(next);
        setReadError(null);
      }
      return lifecycle.active;
    } catch (e) {
      if (lifecycle.active)
        setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      lifecycle.locked = false;
      lifecycle.revision++;
      if (lifecycle.active) setWorking(false);
    }
  }
  const play = (wish: string) =>
    run(async () => {
      // Reuse the request id if delivery succeeded but the response was lost.
      const request =
        lifecycle.uncertain?.wish === wish
          ? lifecycle.uncertain
          : { id: crypto.randomUUID(), wish };
      lifecycle.uncertain = request;
      if (!view?.seated) await client.seat();
      const next = await client.play(request.id, wish);
      lifecycle.uncertain = null;
      return next;
    });
  const advance = () =>
    run(async () => {
      const request =
        lifecycle.uncertain?.wish === "advance:1"
          ? lifecycle.uncertain
          : { id: crypto.randomUUID(), wish: "advance:1" };
      lifecycle.uncertain = request;
      if (!view?.seated) await client.seat();
      const next = await client.advance(request.id, 1);
      lifecycle.uncertain = null;
      return next;
    });
  const enact = (proposalId: string) =>
    run(async () => {
      const key = "enact:" + proposalId,
        request =
          lifecycle.uncertain?.wish === key
            ? lifecycle.uncertain
            : { id: crypto.randomUUID(), wish: key };
      lifecycle.uncertain = request;
      if (!view?.seated) await client.seat();
      const next = await client.enact(request.id, proposalId);
      lifecycle.uncertain = null;
      return next;
    });
  return {
    view,
    error: owner === client ? (error ?? readError) : null,
    working: owner === client && working,
    slow: owner === client && slow,
    play,
    advance,
    enact,
    refresh: () => run(() => client.get()),
    retry: () => run(() => client.retry()),
    cancel: () => run(() => client.cancel()),
  };
}
