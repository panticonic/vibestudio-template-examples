import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { Campaign } from "@workspace/adventure-engine";
import { AdventureWorldDO } from "./index.js";
import { defaultEngineSource } from "./evaluate.js";
const campaign: Campaign = {
  id: "test",
  title: "Test",
  subtitle: "",
  intro: "Begin",
  artDirection: "ink",
  playerId: "player",
  story: { premise: "", arc: [], commitments: [] },
  entities: [
    { id: "room", name: "Room", kind: "place", description: "", components: {} },
    {
      id: "player",
      name: "You",
      kind: "person",
      description: "",
      location: "room",
      components: {},
    },
    {
      id: "clerk",
      name: "Clerk",
      kind: "person",
      description: "",
      location: "room",
      components: { knowledge: ["secret"], memory: [], goals: ["work"] },
    },
    {
      id: "clock",
      name: "Clock",
      kind: "object",
      description: "",
      location: "room",
      components: {},
    },
  ],
};
async function boot(initialCampaign: Campaign = campaign) {
  const t = await createTestDO(AdventureWorldDO),
    deliveries: string[] = [];
  const scopes = new Map<string, any>();
  (t.instance as any).rpc.call = async (target: string, method: string, args: any[]) => {
    if (method === "receiveMoment") {
      deliveries.push(target);
      return { ok: true };
    }
    if (method === "eval.dispose") {
      scopes.delete(args[0].scopeKey);
      return { ok: true };
    }
    if (method === "eval.start") {
      const p = args[0],
        scope = scopes.get(p.scope.key) ?? {};
      scopes.set(p.scope.key, scope);
      try {
        const returnValue = await runInNewContext(
          `(async()=>{${p.source.code}})()`,
          { scope, structuredClone },
          { timeout: 100 }
        );
        return { snapshot: { status: "done", result: { success: true, returnValue } } };
      } catch (error) {
        return { snapshot: { status: "done", result: { success: false, error: String(error) } } };
      }
    }
    return undefined;
  };
  const user = (method: string, p?: any) =>
    t.callAs<any>({ callerId: "panel:test", callerKind: "panel", userId: "player" }, method, p);
  const agent = (role: string, method: string, p?: any) =>
    t.callAs<any>({ callerId: "do:" + role, callerKind: "do", userId: "player" }, method, p);
  await user("init", { campaign: initialCampaign });
  for (const role of ["player", "builder", "artist", "person:clerk"])
    await user("registerParticipant", { role, targetId: "do:" + role, channelId: role });
  return { ...t, user, agent, deliveries };
}
describe("durable adventure orchestration", () => {
  it("keeps the player's private intention out of NPC perspectives", async () => {
    const t = await boot();
    await t.user("play", { id: "private", text: "Secretly conceal the letter before speaking." });
    expect((await t.agent("player", "perspective")).pending.text).toContain("Secretly");
    expect((await t.agent("builder", "perspective")).pending.text).toContain("Secretly");
    const npc = await t.agent("person:clerk", "perspective");
    expect(npc.pending.text).toBe("");
    expect(npc.view.events.some((event: { text: string }) => event.text.includes("Secretly"))).toBe(
      false
    );
  });
  it("sequences independent participants and artist, and deduplicates submitted turns", async () => {
    const t = await boot();
    await t.user("play", { id: "one", text: "Talk to the clerk" });
    await t.agent("player", "execute", { turnId: "one", code: 'world.say("clerk","Hello")' });
    await t.agent("player", "finish", { turnId: "one", text: "You greet the clerk." });
    expect(t.deliveries.at(-1)).toBe("do:person:clerk");
    await t.agent("person:clerk", "execute", {
      turnId: "one",
      code: 'world.say("player","Good morning")',
    });
    await t.agent("person:clerk", "finish", { turnId: "one", text: "" });
    expect(t.deliveries.at(-1)).toBe("do:artist");
    await expect(t.agent("artist", "publishArtwork", { turnId: "one" })).rejects.toThrow(
      "no illustration"
    );
    await t.agent("artist", "setImageJob", { turnId: "one", jobId: "painted", placeId: "room" });
    await t.agent("artist", "publishArtwork", {
      turnId: "one",
      asset: { id: "scene", digest: "painted" },
    });
    await t.user("play", { id: "one", text: "Talk to the clerk" });
    expect((await t.user("getGame")).pending).toBeNull();
    expect((await t.user("getGame")).world.tick).toBe(2);
  });
  it("repairs an NPC behavior and resumes that NPC without repeating player actions", async () => {
    const t = await boot();
    await t.user("play", { id: "one", text: "Say hello" });
    await t.agent("player", "execute", { turnId: "one", code: 'world.say("clerk","Hello")' });
    await t.agent("player", "finish", { turnId: "one", text: "Hello." });
    await expect(
      t.agent("person:clerk", "execute", { turnId: "one", code: 'world.act("clock","wind")' })
    ).rejects.toThrow();
    const state = await t.agent("builder", "perspective");
    expect(state.pending.failedRole).toBe("person:clerk");
    state.world.behaviors.push({
      id: "clockwork",
      entityId: "clock",
      trigger: "wind",
      state: {},
      code: 'world.patch(self.id,{description:"Running"});',
    });
    await t.agent("builder", "repair", {
      turnId: "one",
      code: `world.world.behaviors.push(${JSON.stringify(state.world.behaviors[0])});`,
      note: "Model the clock winding",
    });
    expect((await t.user("getGame")).pending.phase).toBe("participants");
    expect((await t.user("getGame")).world.tick).toBe(1);
    await t.agent("person:clerk", "execute", { turnId: "one", code: 'world.act("clock","wind")' });
    expect((await t.user("getGame")).world.tick).toBe(2);
  });
  it("corrects a faulty agent program without changing the engine or replaying successful work", async () => {
    const t = await boot();
    await t.user("play", { id: "one", text: "Greet the clerk and inspect the clock" });
    await t.agent("player", "execute", { turnId: "one", code: 'world.say("clerk","Hello")' });
    await expect(
      t.agent("player", "execute", { turnId: "one", code: 'inspect("clock")' })
    ).rejects.toThrow();
    const broken = await t.agent("builder", "perspective");
    expect(broken.pending.phase).toBe("builder");
    expect(broken.pending.error).toBeUndefined();
    expect(broken.pending.diagnostic).toContain("inspect");
    const continuationCode = 'return world.inspect("clock")';
    await t.agent("builder", "repair", {
      turnId: "one",
      continuationCode,
      code: "return null;",
      note: "Qualify the method on the supplied world object",
    });
    const repaired = await t.agent("builder", "perspective");
    expect(repaired.engineSource).toBe(broken.engineSource);
    expect(repaired.world.tick).toBe(1);
    const resumed = await t.agent("player", "perspective");
    expect(resumed.completedActions).toHaveLength(1);
    expect(resumed.pending.continuationCode).toBe(continuationCode);
    await expect(t.agent("player", "finish", { turnId: "one", text: "Done" })).rejects.toThrow(
      "continuation"
    );
    await t.agent("player", "execute", { turnId: "one", code: continuationCode });
    expect((await t.user("getGame")).pending.continuationCode).toBeUndefined();
    await t.agent("player", "finish", {
      turnId: "one",
      text: "You greet the clerk and study the clock.",
    });
    expect((await t.user("getGame")).world.tick).toBe(1);
  });
  it("materializes a frontier with code while keeping the current resident roster stable", async () => {
    const c = structuredClone(campaign);
    c.entities[0]!.components.exits = { north: "inn" };
    c.entities.push({
      id: "inn",
      name: "Inn",
      kind: "place",
      description: "A distant inn",
      components: { frontier: true, exits: { south: "room" } },
    });
    const t = await boot(c);
    await t.user("play", { id: "one", text: "Enter the inn" });
    await expect(
      t.agent("player", "execute", { turnId: "one", code: 'world.move("inn")' })
    ).rejects.toThrow("FRONTIER");
    await t.agent("builder", "repair", {
      turnId: "one",
      note: "Materialize the established inn",
      code: 'world.patch("inn",{description:"A warm inn with amber lamps",components:{...world.entity("inn").components,frontier:false}});world.add({id:"host",name:"Host",kind:"person",description:"An attentive host",location:"inn",components:{goals:["Offer supper"],memory:[]}});world.add({id:"bell",name:"Bell",kind:"object",description:"A brass bell",location:"inn",components:{}});world.world.behaviors.push({id:"ring",entityId:"bell",trigger:"ring",state:{},code:"world.emit(String(42));"});',
    });
    const resumed = await t.agent("player", "perspective");
    expect(resumed.pending.participants).toEqual(["clerk"]);
    await t.agent("player", "execute", { turnId: "one", code: resumed.pending.continuationCode });
    expect((await t.user("getGame")).view.location.id).toBe("inn");
    await t.agent("player", "finish", { turnId: "one", text: "You enter the inn." });
    await t.agent("person:clerk", "finish", { turnId: "one", text: "" });
    expect(t.deliveries.at(-1)).toBe("do:artist");
  });
  it("can repair malformed existing behavior without invoking it during maintenance", async () => {
    const c = structuredClone(campaign);
    c.behaviors = [
      { id: "broken", entityId: "clock", trigger: "wind", code: "return )", state: {} },
    ];
    const t = await boot(c);
    await t.user("play", { id: "one", text: "Look around" });
    await expect(
      t.agent("player", "execute", { turnId: "one", code: "return world.observe()" })
    ).rejects.toThrow();
    await t.agent("builder", "repair", {
      turnId: "one",
      code: 'world.world.behaviors[0].code="world.emit(String(42));";',
      note: "Repair malformed behavior source",
    });
    expect((await t.user("getGame")).pending.phase).toBe("player");
  });
  it("repairs a broken stored engine through independent maintenance and resumes the real action once", async () => {
    const t = await boot();
    const row = t.sql.exec("SELECT body FROM adventure WHERE id=1").toArray()[0]!;
    const stored = JSON.parse(String(row["body"]));
    stored.engineSource = 'function(){throw new Error("Shared engine defect")}';
    t.sql.exec("UPDATE adventure SET body=? WHERE id=1", JSON.stringify(stored));
    await t.user("play", { id: "one", text: "Greet the clerk" });
    await expect(
      t.agent("player", "execute", { turnId: "one", code: 'world.say("clerk","Hello")' })
    ).rejects.toThrow("Shared engine defect");
    await t.agent("builder", "repair", {
      turnId: "one",
      code: 'world.patch("clock",{description:"The maintenance visit is recorded"})',
      engineSource: defaultEngineSource,
      note: "Restore the shared engine function",
    });
    const repaired = await t.agent("builder", "perspective");
    expect(repaired.engineSource).toBe(defaultEngineSource);
    expect(repaired.world.tick).toBe(0);
    expect(repaired.world.entities.find((e: any) => e.id === "clock").description).toBe(
      "The maintenance visit is recorded"
    );
    await t.agent("player", "execute", { turnId: "one", code: repaired.pending.continuationCode });
    const resumed = await t.agent("builder", "perspective");
    expect(resumed.world.tick).toBe(1);
    expect(resumed.world.entities.find((e: any) => e.id === "clerk").components.memory).toEqual([
      "You said: Hello",
    ]);
  });
  it("surfaces an unfinished native turn as resumable and ignores completed or stale stops", async () => {
    const t = await boot();
    await t.user("play", { id: "one", text: "Look around" });
    await t.agent("player", "participantStopped", { turnId: "other" });
    expect((await t.user("getGame")).pending.error).toBeUndefined();
    await t.agent("player", "participantStopped", { turnId: "one" });
    expect((await t.user("getGame")).pending.error).toContain("Resume");
    await t.user("retry");
    expect((await t.user("getGame")).pending.error).toBeUndefined();
    await t.agent("player", "finish", { turnId: "one", text: "You look around." });
    await t.agent("player", "participantStopped", { turnId: "one" });
    expect((await t.user("getGame")).pending.error).toBeUndefined();
  });
  it("rejects a different campaign for an existing journey", async () => {
    const t = await boot();
    await expect(t.user("init", { campaign: { ...campaign, id: "another" } })).rejects.toThrow(
      "different campaign"
    );
  });
  it("rejects unseated actors and keeps secrets out of the player projection", async () => {
    const t = await boot();
    await expect(t.agent("stranger", "perspective")).rejects.toThrow("registered");
    const state = await t.user("getGame");
    expect(
      state.view.entities.find((e: any) => e.id === "clerk").components.knowledge
    ).toBeUndefined();
  });
});
