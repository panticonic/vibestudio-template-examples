import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import type { RpcWireCaller } from "@vibestudio/rpc/internal";
import { initialGame } from "@workspace/grimoire-engine";
import { GrimoireWorldDO } from "./index.js";
function requirePresent<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected the operation to produce its declared value");
  }
  return value;
}
const PLAYER = {
  callerId: "panel:game",
  callerKind: "panel" as const,
  userId: "player",
};
const AGENT = {
  callerId: "do:story",
  callerKind: "do" as const,
  userId: "player",
};
async function boot(fail = false) {
  const t = await createTestDO(GrimoireWorldDO);
  const deliveries: string[] = [];
  const scopes = new Map<string, Record<string, unknown>>();
  const wireCall = vi.fn<RpcWireCaller["call"]>(async (target, method, args) => {
    if (method === "eval.dispose") {
      scopes.delete((args[0] as any).scopeKey);
      return { ok: true };
    }
    if (method === "eval.start") {
      const input = args[0] as any;
      const scope = scopes.get(input.scope.key) ?? {};
      scopes.set(input.scope.key, scope);
      const returnValue = await runInNewContext(
        `(async function(){${input.source.code}})()`,
        { scope },
        { timeout: 100 },
      );
      return {
        runId: input.runId,
        runDigest: "0".repeat(64),
        authorityManifestDigest: "0".repeat(64),
        status: "terminal",
        snapshot: { status: "done", result: { success: true, console: "", returnValue } },
      };
    }

    if (method === "receiveMoment") {
      deliveries.push(target);
      if (fail) throw new Error("delivery unavailable");
    }
    return undefined;
  });
  const outbound = schemaRpcMock({ call: wireCall });
  Object.defineProperty(t.instance, "rpc", { value: outbound, configurable: true });
  const player = <Method extends keyof GrimoireWorldDO & string>(
    method: Method,
    input?: unknown,
  ) =>
    t.callAs(PLAYER, method, input);
  await player("registerParticipant", {
    targetId: "do:story",
    channelId: "story",
    role: "moth",
  });
  await player("registerParticipant", {
    targetId: "do:wild",
    channelId: "wild",
    role: "wild",
  });
  return { ...t, player, deliveries, outbound, wireCall };
}
describe("grimoire durable turns", () => {
  it("persists delivery failure and retries without adding another player turn", async () => {
    const t = await boot(true);
    const pending = await t.player("play", {
      id: "one",
      wish: "Make a crossing",
    });
    expect(requirePresent(pending.pending).error).toContain("delivery unavailable");
    const again = await t.player("play", {
      id: "one",
      wish: "Make a crossing",
    });
    expect(requirePresent(again.pending).attempt).toBe(0);
    await t.player("retry");
    expect(requirePresent((await t.player("getGame")).pending).attempt).toBe(1);
    await expect(
      t.player("play", { id: "two", wish: "Another" }),
    ).rejects.toThrow(/already/);
  });
  it("accepts only its agent, commits once, and rejects late completion after cancellation", async () => {
    const t = await boot();
    await t.player("play", { id: "one", wish: "Help the garden and village" });
    expect(t.deliveries).toEqual(["do:story"]);
    await t.callAs(AGENT, "reply", {
      turnId: "one",
      text: "Let us find Sol a comfortable place.",
    });
    expect(requirePresent((await t.player("getGame")).pending).reply).toContain("Sol");
    const input = {
      id: "one",
      result: {
        scene: initialGame().scene,
        title: "A small wonder",
        response: "The garden glows.",
        suggestions: ["Bring rain", "Wake the stream"],
      },
    };
    await expect(t.player("finish", input)).rejects.toThrow(/agent/);
    await expect(
      t.callAs({ ...AGENT, callerId: "do:stranger" }, "finish", input),
    ).rejects.toThrow(/agent/);
    await t.callAs(AGENT, "finish", input);
    await t.callAs(AGENT, "finish", input);
    expect((await t.player("getGame")).game.turn).toBe(1);
    await t.player("play", { id: "two", wish: "Another wish" });
    await t.player("cancel");
    await expect(
      t.callAs(AGENT, "finish", { ...input, id: "two" }),
    ).rejects.toThrow(/no longer pending/);
  });
  it("runs invented enchantments and resident life without waiting for the background wild", async () => {
    const t = await boot();
    await t.player("play", {
      id: "care",
      wish: "Make a sheltered mossy bank for Sol.",
    });
    await t.callAs(AGENT, "weave", {
      turnId: "care",
      code: "const bank=garden.habitats.find(h=>h.id==='bank');bank.shade=.8;bank.shelter=.9;bank.water=.7;events.push('A leaf roof opens beside the stream.');",
    });
    expect(
      requirePresent((await t.player("getGame")).game.life.garden.habitats.find(
        (h) => h.id === "bank",
      )).shelter,
    ).toBe(0.15);
    await t.callAs(AGENT, "finish", {
      id: "care",
      result: {
        scene: null,
        title: "A shelter for Sol",
        response: "A leaf roof opens.",
        suggestions: [],
      },
    });
    const wild = await t.callAs(
      { ...AGENT, callerId: "do:wild" },
      "perspective",
    );
    for (let i = 0; i < 4; i++) await t.player("linger", { id: "moment-" + i });
    const view = await t.player("getGame");
    expect(
      requirePresent(view.game.life.garden.residents.find((r) => r.id === "sol")).home,
    ).toBe("bank");
    expect(view.game.life.garden.discoveries.length).toBeGreaterThan(0);
    const phase = view.game.life.garden.phase;
    await t.player("linger", { id: "moment-3" });
    expect((await t.player("getGame")).game.life.garden.phase).toBe(phase);
    const wildPending = requirePresent(wild.pending);
    if (!("id" in wildPending)) throw new Error("Wild perspective has no pending identity");
    expect(
      await t.callAs({ ...AGENT, callerId: "do:wild" }, "stir", {
        id: wildPending.id,
        result: { beings: [], mysteries: [], manifestation: "" },
      }),
    ).toEqual({ superseded: true });
  });
  it("keeps large artwork in the blob store and only references in SQLite", async () => {
    const t = await boot();
    await t.player("play", { id: "art", wish: "Paint a discovery" });
    const bytes = "iVBOR" + "A".repeat(3_000_000);
    const digest = createHash("sha256").update(bytes).digest("hex");
    t.wireCall.mockImplementation(async (_target, method, args) => {
      if (method === "blobstore.putText") {
        expect(args![0]).toBe(bytes);
        return { digest, size: new TextEncoder().encode(bytes).byteLength };
      }
      if (method === "blobstore.getText") {
        expect(args![0]).toBe(digest);
        return bytes;
      }
      throw new Error("Unexpected call: " + method);
    });
    await t.callAs(AGENT, "storeArt", {
      id: "painted",
      path: "panels/grimoire/assets/generated/painted.png",
      data: bytes,
      mimeType: "image/png",
    });
    const row = t.sql
      .exec("SELECT body FROM story_art WHERE id=?", "painted")
      .toArray()[0] as { body: string };
    expect(row.body.length).toBeLessThan(500);
    expect((await t.player("getArt", { ids: ["painted"] })).painted.data).toBe(
      bytes,
    );
    await expect(t.player("storeArt", { id: "forged" })).rejects.toThrow(
      /artist/,
    );
  });
  it("rejects agents initiating decisions on the player's behalf", async () => {
    const t = await boot();
    await expect(
      t.callAs(AGENT, "play", { id: "fake", wish: "I decide" }),
    ).rejects.toThrow(/player/);
  });
});
