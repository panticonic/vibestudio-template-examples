import { describe, it, expect, vi, afterEach } from "vitest";
import { runInNewContext } from "node:vm";
import { sceneDocument } from "./runtime.js";
afterEach(() => vi.useRealTimers());
function frame() {
  vi.useFakeTimers();
  const outgoing: any[] = [],
    reports: any[] = [],
    listeners: Record<string, Function> = {};
  let worker: any;
  class Worker {
    onmessage?: Function;
    onerror?: Function;
    terminated = false;
    constructor() {
      worker = this;
    }
    postMessage(value: unknown) {
      outgoing.push(value);
    }
    terminate() {
      this.terminated = true;
    }
  }
  const parent = { postMessage: (value: unknown) => reports.push(value) },
    canvas = {
      width: 0,
      height: 0,
      addEventListener() {},
      getContext: () => ({ transferFromImageBitmap() {} }),
    };
  const html = sceneDocument("ctx.fillRect(0,0,1,1)", "test-token", {}, {}),
    script = html.slice(
      html.indexOf("<script>") + 8,
      html.lastIndexOf("</script>"),
    );
  runInNewContext(script, {
    Worker,
    Blob,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    document: { querySelector: () => canvas, hidden: false },
    parent,
    performance: { now: () => 0 },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    setTimeout,
    clearTimeout,
    addEventListener: (name: string, fn: Function) => {
      listeners[name] = fn;
    },
  });
  return {
    outgoing,
    reports,
    worker,
    world: (world: unknown) =>
      listeners["message"]!({
        source: parent,
        data: { token: "test-token", world },
      }),
  };
}
describe("scene initialization and world updates", () => {
  it("does not race world delivery against asset loading or leave a stale loading deadline", () => {
    const f = frame();
    f.world({ day: 2 });
    expect(f.outgoing.length).toBe(1);
    f.worker.onmessage({ data: { loaded: true } });
    expect(f.outgoing.at(-1).world).toEqual({ day: 2 });
    f.worker.onmessage({ data: { bitmap: { width: 800, height: 600 } } });
    vi.advanceTimersByTime(11000);
    expect(f.reports).toEqual([
      { grimoire: "test-token", status: "ready", error: undefined },
    ]);
    expect(f.worker.terminated).toBe(false);
  });
  it("still terminates a loaded program that never produces its frame", () => {
    const f = frame();
    f.worker.onmessage({ data: { loaded: true } });
    vi.advanceTimersByTime(2100);
    expect(f.worker.terminated).toBe(true);
    expect(f.reports.at(-1).error).toContain("too long to draw");
  });
});
