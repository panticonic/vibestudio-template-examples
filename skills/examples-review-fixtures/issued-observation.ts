/** One immutable assigned snapshot, replayable by all readers; failed reads may retry. */
export function issuedObservation<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return async () => {
    const current = pending ??= load();
    try { return structuredClone(await current); }
    catch (error) { if (pending === current) pending = undefined; throw error; }
  };
}
