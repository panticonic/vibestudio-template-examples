import { useEffect, useMemo, useRef, useState } from "react";
import { StoryClient, type View } from "./client.js";
export function useStory(key: string) {
  const client = useMemo(() => new StoryClient(key), [key]);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [slow, setSlow] = useState(false);
  const revision = useRef(0),
    locked = useRef(false),
    alive = useRef(true);
  const uncertain = useRef<{ id: string; wish: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = revision.current;
      try {
        const next = await client.get();
        if (!stopped && version === revision.current) {
          setView(next);
          setReadError(null);
        }
      } catch (e) {
        if (!stopped && version === revision.current)
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
      alive.current = false;
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
    if (locked.current) return false;
    locked.current = true;
    revision.current++;
    setWorking(true);
    setError(null);
    try {
      const next = await operation();
      if (alive.current) {
        setView(next);
        uncertain.current = null;
      }
      return true;
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      locked.current = false;
      revision.current++;
      if (alive.current) setWorking(false);
    }
  }
  const play = (wish: string) =>
    run(async () => {
      // Reuse the request id if delivery succeeded but the response was lost.
      const request =
        uncertain.current?.wish === wish
          ? uncertain.current
          : { id: crypto.randomUUID(), wish };
      uncertain.current = request;
      if (!view?.seated) await client.seat();
      return client.play(request.id, wish);
    });
  const advance = () =>
    run(async () => {
      const request =
        uncertain.current?.wish === "advance:1"
          ? uncertain.current
          : { id: crypto.randomUUID(), wish: "advance:1" };
      uncertain.current = request;
      if (!view?.seated) await client.seat();
      return client.advance(request.id, 1);
    });
  const enact = (proposalId: string) =>
    run(async () => {
      const key = "enact:" + proposalId,
        request =
          uncertain.current?.wish === key
            ? uncertain.current
            : { id: crypto.randomUUID(), wish: key };
      uncertain.current = request;
      if (!view?.seated) await client.seat();
      return client.enact(request.id, proposalId);
    });
  return {
    view,
    error: error ?? readError,
    working,
    slow,
    play,
    advance,
    enact,
    retry: () => run(() => client.retry()),
    cancel: () => run(() => client.cancel()),
  };
}
