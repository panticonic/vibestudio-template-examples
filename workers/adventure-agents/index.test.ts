import { describe, it, expect, vi } from "vitest";
import { executeTool } from "@workspace/harness/testing/native-tool";
import { createModels } from "@panticonic/pi-ai";
import {
  createRegistry,
  defineExtension,
  MemoryStorage,
  Harness,
  DirectToolResultEntry,
  type ToolRegistration,
  type JsonObject,
} from "@panticonic/pi-durable";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
vi.mock("../agent-worker/ai-chat-worker.js", () => ({
  AiChatWorker: class {
    static schemaVersion = 1;
    role = "artist";
    calls: any[] = [];
    stored = new Map<string, string>();
    execution: any;
    subscriptions = {
      getConfig: () => ({ gameKey: "journey", role: this.role }),
      getParticipantId: () => "artist",
    };
    rpc = {
      call: async (target: string, method: string, args: any[]) => {
        this.calls.push({ target, method, args });
        if (method === "workers.resolveService")
          return { kind: "durable-object", targetId: "do:world" };
        return { ok: true };
      },
    };
    get agentRpc() {
      return this.rpc;
    }
    async bindNativeToolExecution() {
      return (
        this.execution ?? {
          rpc: this.rpc,
          commandId: "command:one",
          invocationId: "invocation:one",
        }
      );
    }
    getStateValue(key: string) {
      return this.stored.get(key);
    }
    setStateValue(key: string, value: string) {
      this.stored.set(key, value);
    }
    deleteStateValue(key: string) {
      this.stored.delete(key);
    }
    async onNativeInputSettled() {}
    async interruptChannel(...args: any[]) {
      this.calls.push({ method: "interrupt", args });
    }
    async submitAgentInitiatedTurn(...args: any[]) {
      this.calls.push({ method: "submit", args });
    }
  },
}));
import { AdventureAgentWorker } from "./index.js";
const instance = () =>
  new AdventureAgentWorker(undefined as never, undefined as never) as any;
async function executeOwnedTool(
  tool: ToolRegistration,
  args: JsonObject,
): Promise<Record<string, unknown>> {
  const registry = createRegistry();
  registry.install(defineExtension({ name: "adventure-test", tools: [tool] }));
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models: createModels(),
      registry,
      publishWake: async () => {},
    },
    BACKGROUND_CONTEXT,
  );
  try {
    const conversation = await harness.root(BACKGROUND_CONTEXT, {
      agent: { tools: [tool] },
    });
    const id = await conversation.invokeTool(
      { id: "actual-game-call", name: tool.name, arguments: args },
      BACKGROUND_CONTEXT,
    );
    const task = await harness.waitForTask(id, BACKGROUND_CONTEXT);
    if (task.state.outcome.status !== "completed")
      throw new Error("Native game tool did not complete");
    const outcome = task.state.outcome.result;
    if (!outcome) throw new Error("Native game tool lost its terminal result");
    const entry = (
      await conversation.entries({}, 100, undefined, BACKGROUND_CONTEXT)
    ).items.find((entry) => entry.id === outcome.entryId);
    if (!DirectToolResultEntry.is(entry))
      throw new Error("Native game tool lost its actual result entry");
    const result = entry.data.result;
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error("Native game tool result must be an object");
    return { ...result, control: outcome.control };
  } finally {
    await harness.close(BACKGROUND_CONTEXT);
  }
}
describe("adventure native turn contract", () => {
  it.each([false, true])(
    "prepares and durably retains a missing portrait (resuming failed job: %s)",
    async (resume) => {
      const agent = instance();
      const calls: Array<{ method: string; args: any[] }> = [];
      const asset = (id: string) => ({
        id,
        digest: id,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        byteLength: 1,
        provenance: { provider: "test", imageModel: "test", createdAt: 1 },
      });
      let retried = false;
      const execution = {
        invocationId: "native:artist-invocation",
        commandId: "native:artist-command",
        rpc: {
          call: async (_target: string, method: string, args: any[]) => {
            calls.push({ method, args });
            if (method === "workers.resolveService")
              return { kind: "durable-object", targetId: args[0] };
            if (method === "illustrationPublication") return null;
            if (method === "perspective")
              return {
                pending: { id: "one", phase: "artist" },
                view: {
                  location: { id: "square" },
                  entities: [{ id: "vesper" }],
                },
                artDirection: "Oil painting",
                artwork: {},
                references: [
                  {
                    key: "place:square",
                    name: "Square",
                    kind: "place",
                    asset: asset("empty-square"),
                  },
                  {
                    key: "person:vesper",
                    name: "Vesper",
                    kind: "portrait",
                    prompt: "Vesper alone, silver bun",
                    jobId: resume ? "portrait-job" : undefined,
                  },
                ],
              };
            if (method === "generate")
              return {
                id:
                  args[0].references.length === 0
                    ? "portrait-job"
                    : "scene-job",
                status: "running",
              };
            if (method === "retry") {
              retried = true;
              return { id: args[0], status: "running" };
            }
            if (method === "getJob")
              return resume && args[0] === "portrait-job" && !retried
                ? {
                    id: args[0],
                    status: "failed",
                    error: "Temporary provider failure",
                  }
                : { id: args[0], status: "succeeded", asset: asset(args[0]) };
            return { ok: true };
          },
        },
      };
      const paint = (
        await ((agent.execution = execution), agent.getTools("artist"))
      ).find((tool: any) => tool.name === "paint_scene");
      const result = await executeOwnedTool(paint, {
        turnId: "one",
        prompt: "Vesper in the square",
      });
      expect(result["details"]).toMatchObject({ asset: { id: "scene-job" } });
      const generations = calls.filter((call) => call.method === "generate");
      expect(generations).toHaveLength(resume ? 1 : 2);
      if (!resume) {
        expect(generations[0]!.args[0].references).toEqual([]);
        expect(calls.some((call) => call.method === "setReferenceJob")).toBe(
          true,
        );
      } else
        expect(calls.find((call) => call.method === "retry")?.args).toEqual([
          "portrait-job",
        ]);
      expect(
        generations.at(-1)!.args[0].references.map((image: any) => image.id),
      ).toEqual(["empty-square", "portrait-job"]);
      expect(
        calls.find((call) => call.method === "publishReference")?.args[0],
      ).toEqual({
        operationId: execution.commandId,
        turnId: "one",
        key: "person:vesper",
        asset: asset("portrait-job"),
      });
      expect(
        calls
          .filter((call) => call.method === "retain")
          .map((call) => call.args[0].owner),
      ).toContain("adventure:journey:reference:person:vesper");
      expect(
        calls
          .filter((call) => call.method === "forgetJob")
          .map((call) => call.args[0]),
      ).toEqual(["portrait-job", "scene-job"]);
    },
  );
  it.each([false, true])(
    "uses labelled canonical references, never a cover or finished scene (same place: %s)",
    async (samePlace) => {
      const agent = instance();
      agent.rpc.call = async () => {
        throw new Error("Unscoped worker RPC must not be used");
      };
      const calls: any[] = [];
      const reference = {
        id: "landing-art",
        digest: "reference",
        mimeType: "image/png",
        width: 1536,
        height: 1024,
        byteLength: 123,
        provenance: { provider: "test", imageModel: "test", createdAt: 1 },
      };
      const asset = { ...reference, id: "customs-art", digest: "generated" };
      const execution = {
        invocationId: "invocation",
        commandId: "command",
        rpc: {
          call: async (target: string, method: string, args: any[]) => {
            calls.push({ target, method, args });
            if (method === "workers.resolveService")
              return {
                kind: "durable-object",
                targetId:
                  args[0] === "vibestudio.images.v1" ? "do:images" : "do:world",
              };
            if (method === "illustrationPublication") return null;
            if (method === "perspective")
              return {
                pending: { id: "one", phase: "artist" },
                view: { location: { id: "customs" } },
                artDirection: "Painted harbour",
                artwork: samePlace
                  ? { customs: reference }
                  : { landing: reference },
                openingArtwork: reference,
                references: [
                  {
                    key: "place:customs",
                    name: "Customs",
                    kind: "place",
                    asset: { ...reference, id: "empty-customs" },
                  },
                  {
                    key: "person:elin",
                    name: "Elin Vale",
                    kind: "portrait",
                    asset: { ...reference, id: "elin-portrait" },
                  },
                ],
              };
            if (method === "generate")
              return { id: "scene-job", status: "running" };
            if (method === "getJob")
              return { id: "scene-job", status: "succeeded", asset };
            return { ok: true };
          },
        },
      };
      const paint = (
        await ((agent.execution = execution), agent.getTools("artist"))
      ).find((tool: any) => tool.name === "paint_scene");
      const result = await executeOwnedTool(paint, {
        turnId: "one",
        prompt: "The customs counter at dusk",
      });
      expect(result["isError"]).not.toBe(true);
      expect(result["control"]).toMatchObject({ terminate: true });
      expect(result["details"]).toMatchObject({ asset: { id: "customs-art" } });
      const generation = calls.find((c) => c.method === "generate");
      expect(generation.target).toBe("do:images");
      expect(
        generation.args[0].references.map((asset: any) => asset.id),
      ).toEqual(["empty-customs", "elin-portrait"]);
      expect(generation.args[0].prompt).toContain("Image 1: place:customs");
      expect(generation.args[0].prompt).toContain("Image 2: person:elin");
      expect(generation.args[0].prompt).toContain(
        "AUTHORITATIVE VISIBLE SCENE:",
      );
      expect(calls.find((c) => c.method === "publishArtwork").args[0]).toEqual({
        operationId: execution.commandId,
        turnId: "one",
        asset,
      });
      expect(calls.find((c) => c.method === "retain").args[0].assetId).toBe(
        "customs-art",
      );
      expect(calls.find((c) => c.method === "forgetJob").args).toEqual([
        "scene-job",
      ]);
    },
  );
  it("pins the original domain turn and reports only its genuine settled input", async () => {
    const agent = instance();
    await agent.receiveMoment({
      channelId: "artist",
      turnId: "one",
      steeringId: "delivery",
    });
    const metadata = agent.calls.find((c: any) => c.method === "submit")
      .args[2];
    expect(metadata).toEqual({
      steeringId: "delivery",
      deliverAfterTurn: true,
      domain: {
        kind: "examples.adventure-moment",
        data: { gameKey: "journey", turnId: "one" },
      },
    });
    await agent.onNativeInputSettled(
      "artist",
      {
        id: 1,
        conversationId: 1,
        type: "input",
        status: "unanswered",
        reason: "Cancelled",
      },
      metadata,
      BACKGROUND_CONTEXT,
    );
    expect(
      agent.calls.find((c: any) => c.method === "participantStopped").args[0],
    ).toEqual({ turnId: "one", reason: "The participant paused: Cancelled" });
    expect(agent.getStateValue("adventure-turn:artist")).toBeUndefined();
    // A repaired/replayed notification cannot claim the next domain moment.
    agent.setStateValue("adventure-turn:artist", "two");
    await agent.onNativeInputSettled(
      "artist",
      {
        id: 1,
        conversationId: 1,
        type: "input",
        status: "unanswered",
        reason: "Cancelled",
      },
      metadata,
      BACKGROUND_CONTEXT,
    );
    expect(
      agent.calls.filter((c: any) => c.method === "participantStopped"),
    ).toHaveLength(1);
    expect(agent.getStateValue("adventure-turn:artist")).toBe("two");
  });
  it("cancels only its matching game turn through the native interrupt API", async () => {
    const agent = instance();
    await agent.receiveMoment({
      channelId: "player",
      turnId: "old",
      steeringId: "old",
    });
    await agent.cancelMoment({ channelId: "player", turnId: "other" });
    expect(agent.calls.some((call: any) => call.method === "interrupt")).toBe(
      false,
    );
    await agent.cancelMoment({ channelId: "player", turnId: "old" });
    expect(
      agent.calls.find((call: any) => call.method === "interrupt").args,
    ).toEqual(["player", true]);
    expect(agent.getStateValue("adventure-turn:player")).toBeUndefined();
  });
  it("publishes a no-action answer through the terminal finish tool without running simulation", async () => {
    const agent = instance();
    agent.role = "player";
    const tools = await agent.getTools("player");
    const finish = tools.find((tool: any) => tool.name === "finish_turn");
    const result = await executeTool(finish, {
      turnId: "question",
      text: "The customs house is green-black timber.",
    });
    expect(result["control"]).toMatchObject({ terminate: true });
    expect(
      agent.calls.find((call: any) => call.method === "finish").args[0],
    ).toEqual({
      turnId: "question",
      text: "The customs house is green-black timber.",
    });
    expect(agent.calls.some((call: any) => call.method === "execute")).toBe(
      false,
    );
  });
});
