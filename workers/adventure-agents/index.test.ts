import { describe, it, expect, vi } from "vitest";
vi.mock("../agent-worker/ai-chat-worker.js", () => ({
  AiChatWorker: class {
    static schemaVersion = 1;
    role = "artist";
    calls: any[] = [];
    stored = new Map<string, string>();
    loop: any = { state: { openTurn: null, pendingPrompt: null, deferredPostTurnQueue: [] } };
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
    driver = { peekLoadedLoop: () => this.loop };
    getStateValue(key: string) {
      return this.stored.get(key);
    }
    setStateValue(key: string, value: string) {
      this.stored.set(key, value);
    }
    deleteStateValue(key: string) {
      this.stored.delete(key);
    }
    async onTurnClosed() {}
    async submitAgentInitiatedTurn(...args: any[]) {
      this.calls.push({ method: "submit", args });
    }
  },
}));
import { AdventureAgentWorker } from "./index.js";
const instance = () => new AdventureAgentWorker(undefined as never, undefined as never) as any;
describe("adventure native turn contract", () => {
  it("ends artist work through successful terminal tools, leaving rejected work active", async () => {
    const agent = instance(),
      tools = await agent.getLoopTools("artist");
    expect(
      (await tools.find((t: any) => t.name === "read_world").execute("read", {})).terminate
    ).toBe(false);
    expect(
      (await tools.find((t: any) => t.name === "skip_scene").execute("skip", { turnId: "one" }))
        .terminate
    ).toBe(true);
    agent.rpc.call = async () => {
      throw new Error("This place has no illustration");
    };
    const rejected = await (await agent.getLoopTools("artist"))
      .find((t: any) => t.name === "skip_scene")
      .execute("retry", { turnId: "one" });
    expect(rejected.isError).toBe(true);
    expect(rejected.terminate).not.toBe(true);
  });
  it("generates and publishes through the invocation-scoped images client without a global worker runtime", async () => {
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
              targetId: args[0] === "vibestudio.images.v1" ? "do:images" : "do:world",
            };
          if (method === "perspective")
            return {
              pending: { id: "one", phase: "artist" },
              view: { location: { id: "customs" } },
              artDirection: "Painted harbour",
              artwork: { landing: reference },
            };
          if (method === "generate") return { id: "scene-job", status: "running" };
          if (method === "getJob") return { id: "scene-job", status: "succeeded", asset };
          return { ok: true };
        },
      },
    };
    const paint = (await agent.getLoopTools("artist", execution)).find(
      (tool: any) => tool.name === "paint_scene"
    );
    const result = await paint.execute("paint", {
      turnId: "one",
      prompt: "The customs counter at dusk",
    });
    expect(result.isError).not.toBe(true);
    expect(result.terminate).toBe(true);
    expect(result.details.asset.id).toBe("customs-art");
    const generation = calls.find((c) => c.method === "generate");
    expect(generation.target).toBe("do:images");
    expect(generation.args[0].references).toEqual([reference]);
    expect(calls.find((c) => c.method === "publishArtwork").args[0]).toEqual({
      turnId: "one",
      asset,
    });
    expect(calls.find((c) => c.method === "retain").args[0].assetId).toBe("customs-art");
    expect(calls.find((c) => c.method === "forgetJob").args).toEqual(["scene-job"]);
  });
  it("uses native post-turn delivery and does not mistake its queued successor for an idle failure", async () => {
    const agent = instance();
    await agent.receiveMoment({ channelId: "artist", turnId: "one", steeringId: "delivery" });
    expect(agent.calls.find((c: any) => c.method === "submit").args[2]).toEqual({
      steeringId: "delivery",
      deliverAfterTurn: true,
    });
    agent.loop.state.deferredPostTurnQueue = [{ envelopeId: "next" }];
    await agent.onTurnClosed({
      channelId: "artist",
      turnId: "closed",
      metadata: {},
      effectFailures: [],
    });
    expect(agent.calls.some((c: any) => c.method === "participantStopped")).toBe(false);
    agent.loop.state.deferredPostTurnQueue = [];
    await agent.onTurnClosed({
      channelId: "artist",
      turnId: "next",
      metadata: {},
      effectFailures: [],
    });
    expect(agent.calls.find((c: any) => c.method === "participantStopped").args[0].turnId).toBe(
      "one"
    );
  });
});
