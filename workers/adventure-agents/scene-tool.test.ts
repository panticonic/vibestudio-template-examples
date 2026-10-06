import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModels } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  Harness,
  createRegistry,
  defineExtension,
  MemoryStorage,
  StorageRejected,
  type Storage,
  type StorageWrite,
} from "@panticonic/pi-durable";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import type {
  ImageAsset,
  ImageGenerationJob,
  ImageGenerationRequest,
  ImagesClient,
} from "@workspace/runtime/images";
import { adventureSceneTool } from "./scene-tool.js";
const context = BACKGROUND_CONTEXT;
const sessions: Harness[] = [],
  directories: string[] = [];
afterEach(async () => {
  const results = await Promise.allSettled(
    sessions.splice(0).map((h) => h.close(context)),
  );
  const cleanup = await Promise.allSettled(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
  for (const r of [...results, ...cleanup])
    if (r.status === "rejected") throw r.reason;
});
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
const asset = (id: string): ImageAsset => ({
  id,
  digest: id,
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  byteLength: 1,
  provenance: { provider: "test", imageModel: "test", createdAt: 1 },
});
class RejectingStorage extends MemoryStorage {
  rejectRecipe = false;
  readonly original = new StorageRejected("Image recipe transaction rejected");
  override async commit(
    writes: readonly StorageWrite[],
    ctx: Parameters<Storage["commit"]>[1],
  ) {
    if (
      this.rejectRecipe &&
      writes.some(
        (w) =>
          w.type === "document.create" &&
          w.record.kind === "examples.adventure-owned-images",
      )
    ) {
      this.rejectRecipe = false;
      throw this.original;
    }
    return super.commit(writes, ctx);
  }
}
function dependencies(
  options: {
    references?: any[];
    lostAdmission?: Error;
    cleanupError?: Error;
    running?: boolean;
    cancelError?: Error;
    publicationError?: Error;
    previousAsset?: ImageAsset;
  } = {},
) {
  const jobs = new Map<string, ImageGenerationJob>(),
    recipes = new Map<string, ImageGenerationRequest>(),
    receipts = new Map<string, any>();
  const waits: string[] = [],
    cancellations: string[] = [],
    forgets: string[] = [];
  const started = gate();
  let lost = Boolean(options.lostAdmission),
    forgetFail = Boolean(options.cleanupError),
    cancelFail = Boolean(options.cancelError),
    publicationFail = Boolean(options.publicationError);
  const key = (input: any, purpose: string) =>
    `${input.operationId}:${purpose}:${input.key ?? ""}`;
  const call = vi.fn(async (method: string, input?: any) => {
    if (method === "perspective")
      return {
        pending: { id: "turn:one", phase: "artist" },
        view: { location: { id: "square" }, entities: [] },
        artDirection: "Oil painting",
        artwork: options.previousAsset ? { square: options.previousAsset } : {},
        references: options.references ?? [],
      };
    if (method === "illustrationPublication")
      return receipts.get(key(input, input.purpose)) ?? null;
    if (method === "publishArtwork" || method === "publishReference") {
      receipts.set(
        key(
          input,
          method === "publishReference"
            ? "reference"
            : input.asset
              ? "artwork"
              : "error",
        ),
        { input, result: { ok: true } },
      );
      if (method === "publishArtwork" && publicationFail) {
        publicationFail = false;
        throw options.publicationError;
      }
      return { ok: true };
    }
    return { ok: true };
  });
  const images = {
    generate: vi.fn(async (request: ImageGenerationRequest) => {
      if (!recipes.has(request.requestId)) {
        recipes.set(request.requestId, request);
        jobs.set(request.requestId, {
          id: request.requestId,
          requestId: request.requestId,
          status: options.running ? "running" : "succeeded",
          attempt: 1,
          createdAt: 1,
          updatedAt: 1,
          asset: options.running ? undefined : asset(request.requestId),
        });
      }
      if (lost) {
        lost = false;
        throw options.lostAdmission;
      }
      return jobs.get(request.requestId)!;
    }),
    getJob: vi.fn(async (id: string) => {
      const job = jobs.get(id);
      if (!job) throw new Error(`Unknown canonical job ${id}`);
      return job;
    }),
    retry: vi.fn(async (id: string) => jobs.get(id)!),
    wait: vi.fn(async (id: string, opts?: { signal?: AbortSignal }) => {
      waits.push(id);
      if (waits.length === (options.references?.length ?? 0)) started.resolve();
      const job = jobs.get(id)!;
      if (job.status !== "running") return job;
      return new Promise<ImageGenerationJob>((resolve, reject) => {
        const abort = () => reject(opts?.signal?.reason);
        opts?.signal?.addEventListener("abort", abort, { once: true });
        opts?.signal?.throwIfAborted();
        // Actual cancellation changes the owning job and releases its wait below.
        (job as any).finish = () => {
          opts?.signal?.removeEventListener("abort", abort);
          resolve(job);
        };
      });
    }),
    cancel: vi.fn(async (id: string) => {
      cancellations.push(id);
      if (cancelFail) {
        cancelFail = false;
        throw options.cancelError;
      }
      const job = jobs.get(id)!;
      job.status = "cancelled";
      (job as any).finish?.();
      return job;
    }),
    forgetJob: vi.fn(async (id: string) => {
      forgets.push(id);
      if (forgetFail) {
        forgetFail = false;
        throw options.cleanupError;
      }
    }),
    retain: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
  } as unknown as ImagesClient;
  const tool = adventureSceneTool("journey", {
    operationId: "native:owner:original-scene",
    call: call as any,
    images,
  });
  return {
    tool,
    images,
    call,
    jobs,
    recipes,
    receipts,
    started,
    waits,
    cancellations,
    forgets,
  };
}
async function fixture(
  deps: ReturnType<typeof dependencies>,
  storage: Storage = new MemoryStorage(),
) {
  const registry = createRegistry();
  registry.install(defineExtension({ name: "scene-test", tools: [deps.tool] }));
  const options = {
    models: createModels(),
    registry,
    publishWake: async () => {},
  };
  const harness = await Harness.open(storage, options, context);
  sessions.push(harness);
  const conversation = await harness.root(context, {
    agent: { tools: [deps.tool] },
  });
  const taskId = await conversation.invokeTool(
    {
      id: "original-direct-call",
      name: deps.tool.name,
      arguments: { turnId: "turn:one", prompt: "The square" },
    },
    context,
  );
  return { harness, conversation, taskId, options };
}
async function incident(harness: Harness, id: number) {
  const task = await harness.getTask(id as any, context);
  if (
    !task ||
    task.state.status !== "waiting" ||
    task.state.condition.kind !== "failure"
  )
    throw new Error("Native image ownership was not retained for exact repair");
  return task.state.condition.incident;
}
describe("native scene image ownership", () => {
  it("retains the stable image admission before dispatch and cancels the accepted job after its reply was lost", async () => {
    const original = new Error("Accepted image admission reply lost"),
      d = dependencies({ lostAdmission: original, running: true }),
      f = await fixture(d);
    await expect(f.harness.waitForTask(f.taskId, context)).rejects.toThrow(
      original.message,
    );
    expect(d.jobs.size).toBe(1);
    await f.harness.abortTask(f.taskId, context);
    await f.harness.waitForTask(f.taskId, context);
    expect(d.recipes.size).toBe(1);
    expect(d.cancellations).toEqual([...d.jobs.keys()]);
    expect(d.forgets).toEqual([...d.jobs.keys()]);
  });
  it("retains post-publication cleanup failure on the real ToolTask and repairs without another provider request", async () => {
    const original = new Error("Provider job cleanup refused"),
      d = dependencies({ cleanupError: original }),
      f = await fixture(d);
    await expect(f.harness.waitForTask(f.taskId, context)).rejects.toThrow(
      original.message,
    );
    expect(d.receipts.size).toBe(1);
    expect(
      d.call.mock.calls.filter((call) => call[0] === "publishArtwork"),
    ).toHaveLength(1);
    await f.harness.retryTask(
      f.taskId,
      await incident(f.harness, f.taskId),
      context,
    );
    expect(
      (await f.harness.waitForTask(f.taskId, context)).state.outcome.status,
    ).toBe("completed");
    expect(d.images.generate).toHaveBeenCalledTimes(1);
    expect(
      d.call.mock.calls.filter((call) => call[0] === "publishArtwork"),
    ).toHaveLength(2);
    expect(d.forgets).toHaveLength(2);
  });
  it("joins the same accepted world publication after its successor delivery failed without recreating an image", async () => {
    const original = new Error("Original successor delivery refused"),
      d = dependencies({ publicationError: original }),
      f = await fixture(d);
    await expect(f.harness.waitForTask(f.taskId, context)).rejects.toThrow(
      original.message,
    );
    expect(d.receipts.size).toBe(1);
    expect(d.forgets).toHaveLength(0);
    await f.harness.retryTask(
      f.taskId,
      await incident(f.harness, f.taskId),
      context,
    );
    expect(
      (await f.harness.waitForTask(f.taskId, context)).state.outcome.status,
    ).toBe("completed");
    const publications = d.call.mock.calls.filter(
      (call) => call[0] === "publishArtwork",
    );
    expect(publications).toHaveLength(2);
    expect(publications[1]).toEqual(publications[0]);
    expect(d.images.generate).toHaveBeenCalledTimes(1);
    expect(d.receipts.size).toBe(1);
    expect(d.forgets).toEqual([...d.jobs.keys()]);
  });
  it("joins every independent reference cancellation while preserving the original cleanup failure", async () => {
    const original = new Error("First reference cancellation refused"),
      d = dependencies({
        running: true,
        cancelError: original,
        references: [
          { key: "person:one", kind: "portrait", prompt: "One" },
          { key: "person:two", kind: "portrait", prompt: "Two" },
        ],
      }),
      f = await fixture(d);
    const pass = f.harness.runPass(context);
    await d.started.promise;
    await f.harness.abortTask(f.taskId, context);
    await pass;
    await expect(f.harness.waitForTask(f.taskId, context)).rejects.toThrow(
      original.message,
    );
    expect(d.cancellations).toHaveLength(2);
    // Independent references may reach cancellation in either order. The
    // fixture refuses the first actual cancellation, so inspect those owners
    // rather than assuming the second prompt was cancelled successfully.
    const [refused, joined] = d.cancellations;
    expect(d.jobs.get(refused!)!.status).toBe("running");
    expect(d.jobs.get(joined!)!.status).toBe("cancelled");
    expect(d.forgets).toEqual([joined]);
    await f.harness.retryTask(
      f.taskId,
      await incident(f.harness, f.taskId),
      context,
    );
    await f.harness.waitForTask(f.taskId, context);
    expect(
      Array.from(d.jobs.values()).every((job) => job.status === "cancelled"),
    ).toBe(true);
  });
  it("joins accepted publication and original replaced-asset cleanup on cancellation after a lost domain acknowledgement", async () => {
    const original = new Error("Original accepted artwork reply lost"),
      previousAsset = asset("previous-world-art"),
      d = dependencies({ publicationError: original, previousAsset }),
      f = await fixture(d);
    await expect(f.harness.waitForTask(f.taskId, context)).rejects.toThrow(
      original.message,
    );
    await f.harness.abortTask(f.taskId, context);
    expect(
      (await f.harness.waitForTask(f.taskId, context)).state.outcome.status,
    ).toBe("aborted");
    const publications = d.call.mock.calls.filter(
      (call) => call[0] === "publishArtwork",
    );
    expect(publications).toHaveLength(2);
    expect(publications[1]).toEqual(publications[0]);
    expect(d.images.release).toHaveBeenCalledWith({
      assetId: previousAsset.id,
      owner: "adventure:journey:square",
    });
    expect(d.images.generate).toHaveBeenCalledTimes(1);
    expect(d.forgets).toEqual([...d.jobs.keys()]);
  });
  it("cannot dispatch an image when storage rejects its retained recipe", async () => {
    const d = dependencies(),
      storage = new RejectingStorage();
    storage.rejectRecipe = true;
    const f = await fixture(d, storage);
    const terminal = await f.harness.waitForTask(f.taskId, context);
    expect(terminal.state.outcome).toMatchObject({
      status: "failed",
      error: { message: storage.original.message },
    });
    expect(d.images.generate).not.toHaveBeenCalled();
  });
  it("reopens actual SQLite ownership and cancels the same uncertain provider admission after losing the heap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vibestudio-scene-native-"));
    directories.push(directory);
    const filename = join(directory, "scene.sqlite");
    const d = dependencies({
        lostAdmission: new Error("Original admission reply lost"),
        running: true,
      }),
      first = await fixture(d, await openNodeSqliteStorage(filename));
    await expect(
      first.harness.waitForTask(first.taskId, context),
    ).rejects.toThrow("Original admission reply lost");
    await first.harness.close(context);
    sessions.splice(sessions.indexOf(first.harness), 1);
    const second = await Harness.open(
      await openNodeSqliteStorage(filename),
      first.options,
      context,
    );
    sessions.push(second);
    await second.abortTask(first.taskId, context);
    await second.waitForTask(first.taskId, context);
    expect(d.jobs.size).toBe(1);
    expect(d.cancellations).toEqual([...d.jobs.keys()]);
    expect(d.forgets).toEqual([...d.jobs.keys()]);
  });
});
