import { expect, it, vi } from "vitest";
import { issuedObservation } from "./issued-observation.js";
it("joins concurrent assigned reads, isolates returned values, and retries a failed acquisition", async () => {
  let resolve!: (value: { source: string }) => void;
  const load = vi.fn(() => new Promise<{ source: string }>(done => { resolve = done; }));
  const observe = issuedObservation(load);
  const a = observe(), b = observe();
  resolve({ source: "owned bytes" });
  const first = await a; first.source = "forged";
  expect(await b).toEqual({ source: "owned bytes" });
  expect(await observe()).toEqual({ source: "owned bytes" });
  expect(load).toHaveBeenCalledTimes(1);
  const fail = vi.fn().mockRejectedValueOnce(new Error("native read failed")).mockResolvedValue({ revision: "current" });
  const retry = issuedObservation(fail);
  await expect(retry()).rejects.toThrow("native read failed");
  expect(await retry()).toEqual({ revision: "current" });
});
