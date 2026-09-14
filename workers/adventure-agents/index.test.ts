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
    async interruptChannel(...args: any[]) {
      this.calls.push({ method: "interrupt", args });
    }
    async submitAgentInitiatedTurn(...args: any[]) {
      this.calls.push({ method: "submit", args });
    }
  },
}));
import { AdventureAgentWorker } from "./index.js";
const instance = () => new AdventureAgentWorker(undefined as never, undefined as never) as any;
describe("adventure native turn contract", () => {
  it.each([false, true])("prepares and durably retains a missing portrait (resuming failed job: %s)", async (resume) => {
    const agent = instance();
    const calls: Array<{ method: string; args: any[] }> = [];
    const asset = (id: string) => ({ id, digest: id, mimeType: "image/png", width: 1024, height: 1024, byteLength: 1,
      provenance: { provider: "test", imageModel: "test", createdAt: 1 } });
    let retried = false;
    const execution = { rpc: { call: async (_target: string, method: string, args: any[]) => {
      calls.push({ method, args });
      if (method === "workers.resolveService") return { kind: "durable-object", targetId: args[0] };
      if (method === "perspective") return {
        pending: { id: "one", phase: "artist" }, view: { location: { id: "square" }, entities: [{ id: "vesper" }] },
        artDirection: "Oil painting", artwork: {}, references: [
          { key: "place:square", name: "Square", kind: "place", asset: asset("empty-square") },
          { key: "person:vesper", name: "Vesper", kind: "portrait", prompt: "Vesper alone, silver bun", jobId: resume ? "portrait-job" : undefined },
        ],
      };
      if (method === "generate") return { id: args[0].requestId.endsWith("person:vesper") ? "portrait-job" : "scene-job", status: "running" };
      if (method === "retry") { retried = true; return { id: args[0], status: "running" }; }
      if (method === "getJob") return resume && args[0] === "portrait-job" && !retried
        ? { id: args[0], status: "failed", error: "Temporary provider failure" }
        : { id: args[0], status: "succeeded", asset: asset(args[0]) };
      return { ok: true };
    } } };
    const paint = (await agent.getLoopTools("artist", execution)).find((tool: any) => tool.name === "paint_scene");
    const result = await paint.execute("paint", { turnId: "one", prompt: "Vesper in the square" });
    expect(result.details.asset.id).toBe("scene-job");
    const generations = calls.filter((call) => call.method === "generate");
    expect(generations).toHaveLength(resume ? 1 : 2);
    if (!resume) {
      expect(generations[0]!.args[0].references).toEqual([]);
      expect(calls.some((call) => call.method === "setReferenceJob")).toBe(true);
    } else expect(calls.find((call) => call.method === "retry")?.args).toEqual(["portrait-job"]);
    expect(generations.at(-1)!.args[0].references.map((image: any) => image.id)).toEqual(["empty-square", "portrait-job"]);
    expect(calls.find((call) => call.method === "publishReference")?.args[0]).toEqual({ turnId: "one", key: "person:vesper", asset: asset("portrait-job") });
    expect(calls.filter((call) => call.method === "retain").map((call) => call.args[0].owner)).toContain("adventure:journey:reference:person:vesper");
    expect(calls.filter((call) => call.method === "forgetJob").map((call) => call.args[0])).toEqual(["portrait-job", "scene-job"]);
  });
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
                targetId: args[0] === "vibestudio.images.v1" ? "do:images" : "do:world",
              };
            if (method === "perspective")
              return {
                pending: { id: "one", phase: "artist" },
                view: { location: { id: "customs" } },
                artDirection: "Painted harbour",
                artwork: samePlace ? { customs: reference } : { landing: reference },
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
      expect(generation.args[0].references.map((asset: any) => asset.id)).toEqual([
        "empty-customs",
        "elin-portrait",
      ]);
      expect(generation.args[0].prompt).toContain("Image 1: place:customs");
      expect(generation.args[0].prompt).toContain("Image 2: person:elin");
      expect(generation.args[0].prompt).toContain("AUTHORITATIVE VISIBLE SCENE:");
      expect(calls.find((c) => c.method === "publishArtwork").args[0]).toEqual({
        turnId: "one",
        asset,
      });
      expect(calls.find((c) => c.method === "retain").args[0].assetId).toBe("customs-art");
      expect(calls.find((c) => c.method === "forgetJob").args).toEqual(["scene-job"]);
    }
  );
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
  it("cancels only its matching game turn through the native interrupt API", async () => {
    const agent = instance();
    await agent.receiveMoment({ channelId: "player", turnId: "old", steeringId: "old" });
    await agent.cancelMoment({ channelId: "player", turnId: "other" });
    expect(agent.calls.some((call: any) => call.method === "interrupt")).toBe(false);
    await agent.cancelMoment({ channelId: "player", turnId: "old" });
    expect(agent.calls.find((call: any) => call.method === "interrupt").args).toEqual([
      "player",
      true,
    ]);
    expect(agent.getStateValue("adventure-turn:player")).toBeUndefined();
  });
  it("publishes a no-action answer through the terminal finish tool without running simulation", async () => {
    const agent = instance();
    agent.role = "player";
    const tools = await agent.getLoopTools("player");
    const finish = tools.find((tool: any) => tool.name === "finish_turn");
    const result = await finish.execute("answer", {
      turnId: "question",
      text: "The customs house is green-black timber.",
    });
    expect(result.terminate).toBe(true);
    expect(agent.calls.find((call: any) => call.method === "finish").args[0]).toEqual({
      turnId: "question",
      text: "The customs house is green-black timber.",
    });
    expect(agent.calls.some((call: any) => call.method === "execute")).toBe(false);
  });
});
