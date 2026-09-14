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
  it("persists reference jobs and reuses portraits by identity across scenes", async () => {
    const t = await boot();
    await t.user("play", { id: "first", text: "Look around" });
    await t.agent("player", "finish", {
      turnId: "first",
      text: "The room is quiet.",
    });
    const perspective = await t.agent("artist", "perspective");
    expect(perspective.references.map((ref: any) => ref.key)).toEqual([
      "place:room",
      "person:clerk",
    ]);
    const sceneId = perspective.pending.id;
    await t.agent("artist", "setReferenceJob", {
      turnId: sceneId,
      key: "person:clerk",
      jobId: "portrait-job",
    });
    expect((await t.agent("artist", "perspective")).references[1].jobId).toBe("portrait-job");
    await expect(
      t.agent("player", "publishReference", {
        turnId: sceneId,
        key: "person:clerk",
        asset: { id: "wrong", digest: "wrong" },
      })
    ).rejects.toThrow("active artist");
    await expect(
      t.agent("artist", "publishReference", {
        turnId: sceneId,
        key: "person:absent",
        asset: { id: "wrong", digest: "wrong" },
      })
    ).rejects.toThrow("reference subject");
    for (const ref of perspective.references)
      await t.agent("artist", "publishReference", {
        turnId: sceneId,
        key: ref.key,
        asset: { id: ref.key, digest: "canonical" },
      });
    expect((await t.user("getGame")).background.scene.preparing).toEqual([]);
    const deliveries = t.deliveries.length;
    await t.user("getGame");
    await t.user("retry");
    expect(t.deliveries.length).toBe(deliveries);
    await t.agent("artist", "publishArtwork", {
      turnId: sceneId,
      asset: { id: "scene-one", digest: "one" },
    });
    await t.user("play", { id: "second", text: "Change the clock" });
    await t.agent("player", "execute", {
      turnId: "second",
      code: 'world.setComponent("clock", "appearance", "A polished face")',
    });
    await t.agent("player", "finish", {
      turnId: "second",
      text: "The clock gleams.",
    });
    await t.agent("person:clerk", "finish", { turnId: "second", text: "" });
    const next = await t.agent("artist", "perspective");
    expect(next.pending.id).not.toBe(sceneId);
    expect(next.references.map((ref: any) => ref.asset.id)).toEqual(["place:room", "person:clerk"]);
    expect(next.references.every((ref: any) => ref.jobId === undefined)).toBe(true);
  });
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
    await expect(t.agent("artist", "publishArtwork", { turnId: "one:scene" })).rejects.toThrow(
      "no illustration"
    );
    await t.agent("artist", "setImageJob", {
      turnId: "one:scene",
      jobId: "painted",
      placeId: "room",
    });
    await t.agent("artist", "publishArtwork", {
      turnId: "one:scene",
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
    expect(state.pending.purpose).toBe("extension");
    expect(state.pending.error).toBeUndefined();
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
  it.each([
    'world.say("clerk","Uncommitted"); const absent=world.observe().entities.find(entity=>entity.id==="not-here");return absent.id;',
    'inspect("clock")',
    "const =",
  ])(
    "returns the participant's coding mistake for correction without builder or replay: %s",
    async (code) => {
      const t = await boot();
      await t.user("play", { id: "one", text: "Greet the clerk and inspect the clock" });
      await t.agent("player", "execute", { turnId: "one", code: 'world.say("clerk","Hello")' });
      const engine = (await t.agent("builder", "perspective")).engineSource;
      const rejected = await t.agent("player", "execute", { turnId: "one", code });
      expect(rejected.programError).toBeTruthy();
      const resumed = await t.agent("player", "perspective");
      expect(resumed.pending.phase).toBe("player");
      expect(resumed.pending.purpose).toBeUndefined();
      expect(resumed.completedActions).toHaveLength(1);
      expect(t.deliveries).not.toContain("do:builder");
      await t.agent("player", "execute", { turnId: "one", code: 'return world.inspect("clock")' });
      await t.agent("player", "finish", {
        turnId: "one",
        text: "You greet the clerk and inspect the clock.",
      });
      const game = await t.user("getGame");
      expect(game.world.tick).toBe(1);
      expect(game.world.journal.some((entry: any) => entry.text.includes("Uncommitted"))).toBe(
        false
      );
      expect((await t.agent("builder", "perspective")).engineSource).toBe(engine);
    }
  );
  it("keeps JavaScript faults inside authored world behavior under builder ownership", async () => {
    const c = structuredClone(campaign);
    c.behaviors = [
      {
        id: "fault",
        entityId: "clock",
        trigger: "wind",
        state: {},
        code: "const broken=undefined; return broken.id;",
      },
    ];
    const t = await boot(c);
    await t.user("play", { id: "one", text: "Wind the clock" });
    await expect(
      t.agent("player", "execute", { turnId: "one", code: 'world.act("clock","wind")' })
    ).rejects.toThrow();
    const state = await t.agent("builder", "perspective");
    expect(state.pending.phase).toBe("builder");
    expect(state.pending.purpose).toBe("repair");
    expect(state.world.tick).toBe(0);
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
    expect((await t.user("getGame")).pending.purpose).toBe("frontier");
    await t.agent("builder", "repair", {
      turnId: "one",
      note: "Materialize the established inn",
      code: 'world.patch("inn",{description:"A warm inn with amber lamps",components:{...world.entity("inn").components,frontier:false}});world.add({id:"host",name:"Host",kind:"person",description:"An attentive host",location:"inn",components:{goals:["Offer supper"],memory:[]}});world.add({id:"bell",name:"Bell",kind:"object",description:"A brass bell",location:"inn",components:{}});world.world.behaviors.push({id:"ring",entityId:"bell",trigger:"ring",state:{},code:"world.emit(String(42));"});',
    });
    const resumed = await t.agent("player", "perspective");
    expect(resumed.pending.participants).toEqual([]);
    await t.agent("player", "execute", { turnId: "one", code: resumed.pending.continuationCode });
    expect((await t.user("getGame")).view.location.id).toBe("inn");
    await t.agent("player", "finish", { turnId: "one", text: "You enter the inn." });
    expect((await t.user("getGame")).pending.participants).toEqual(["clerk", "host"]);
    // The clerk witnessed departure; the new host witnessed arrival. Both retain their own turn.
    await t.agent("person:clerk", "finish", { turnId: "one", text: "" });
    const needed = (await t.user("getGame")).neededSeats;
    expect(needed.map((seat: any) => seat.role)).toEqual(["person:host"]);
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
      "The traveller said: Hello",
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
    expect((await t.user("getGame")).pending).toBeNull();
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
  it("does not wake models for an unchanged scene or an unwitnessed question", async () => {
    const t = await boot();
    await t.user("setOpeningArtwork", { asset: { id: "cover", digest: "cover" } });
    await t.user("play", { id: "question", text: "What is this room?" });
    await t.agent("player", "execute", { turnId: "question", code: "return world.observe()" });
    await t.agent("player", "finish", { turnId: "question", text: "You are in the room." });
    const game = await t.user("getGame");
    expect(game.pending).toBeNull();
    expect(game.background.scene).toBeNull();
    expect(game.visual.fresh).toBe(true);
    expect(t.deliveries).toEqual(["do:player"]);
  });
  it("unlocks foreground while painting and tags late art with its captured composition", async () => {
    const c = structuredClone(campaign);
    c.entities[0]!.components.exits = { north: "garden" };
    c.entities.push({
      id: "garden",
      kind: "place",
      name: "Garden",
      description: "Roses",
      components: { exits: { south: "room" } },
    });
    const t = await boot(c);
    await t.user("setOpeningArtwork", { asset: { id: "cover", digest: "cover" } });
    await t.user("play", { id: "north", text: "Go north" });
    await t.agent("player", "execute", { turnId: "north", code: 'world.move("garden")' });
    await t.agent("player", "finish", { turnId: "north", text: "You reach the garden." });
    const reaction = await t.user("getGame");
    expect(reaction.pending.participants).toEqual(["clerk"]);
    expect(reaction.background.scene).toBeNull();
    await t.agent("person:clerk", "finish", { turnId: "north", text: "" });
    const painting = await t.user("getGame");
    expect(painting.pending).toBeNull();
    expect(painting.background.scene.placeId).toBe("garden");
    const sceneId = painting.background.scene.id;
    await t.agent("artist", "setImageJob", {
      turnId: sceneId,
      jobId: "garden-job",
      placeId: "garden",
    });
    await t.user("play", { id: "south", text: "Go south" });
    await t.agent("player", "execute", { turnId: "south", code: 'world.move("room")' });
    await t.agent("artist", "publishArtwork", {
      turnId: sceneId,
      asset: { id: "garden-art", digest: "garden" },
    });
    const returned = await t.user("getGame");
    expect(returned.pending.id).toBe("south");
    expect(returned.view.location.id).toBe("room");
    expect(returned.world.artwork.garden.id).toBe("garden-art");
    expect(returned.world.artwork.room.id).toBe("cover");
    expect(returned.visual.artworkSignature).not.toBe(painting.visual.signature);
  });
  it("cancels in-flight work without reverting prior commits or accepting late effects", async () => {
    const t = await boot();
    await t.user("play", { id: "cancel", text: "Greet the clerk" });
    await t.agent("player", "execute", {
      turnId: "cancel",
      code: 'world.say("clerk","Already said")',
    });
    const original = (t.instance as any).rpc.call;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    (t.instance as any).rpc.call = async (target: string, method: string, args: any[]) => {
      if (method === "eval.start") {
        entered();
        await gate;
      }
      return original(target, method, args);
    };
    const late = t.agent("player", "execute", {
      turnId: "cancel",
      code: 'world.say("clerk","Too late")',
    });
    await started;
    await t.user("cancel");
    release();
    expect(await late).toEqual({ cancelled: true });
    const game = await t.user("getGame");
    expect(game.pending).toBeNull();
    expect(game.world.tick).toBe(1);
    expect(game.world.journal.some((e: any) => e.text.includes("Already said"))).toBe(true);
    expect(game.world.journal.some((e: any) => e.text.includes("Too late"))).toBe(false);
    expect(t.deliveries).not.toContain("do:builder");
  });
  it("treats optimistic contention as reobservation rather than a world defect", async () => {
    const t = await boot();
    await t.user("play", { id: "race", text: "Inspect the room" });
    const original = (t.instance as any).rpc.call;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    (t.instance as any).rpc.call = async (target: string, method: string, args: any[]) => {
      if (method === "eval.start") {
        entered();
        await gate;
      }
      return original(target, method, args);
    };
    const late = t.agent("player", "execute", {
      turnId: "race",
      code: 'world.say("clerk","Stale")',
    });
    await started;
    const stored = JSON.parse(
      String(t.sql.exec("SELECT body FROM adventure WHERE id=1").toArray()[0]!["body"])
    );
    stored.world.revision++;
    t.sql.exec("UPDATE adventure SET body=? WHERE id=1", JSON.stringify(stored));
    release();
    expect((await late).retry).toBe(true);
    const game = await t.user("getGame");
    expect(game.pending.phase).toBe("player");
    expect(game.world.tick).toBe(0);
    expect(t.deliveries).not.toContain("do:builder");
  });
  it("wakes an offscreen participant from a scheduled witnessed event, leaving unrelated residents idle", async () => {
    const c = structuredClone(campaign);
    c.entities.push(
      { id: "tower", kind: "place", name: "Tower", description: "", components: {} },
      {
        id: "watcher",
        kind: "person",
        name: "Watcher",
        description: "",
        location: "tower",
        components: {},
      }
    );
    c.behaviors = [
      {
        id: "alarm",
        entityId: "tower",
        trigger: "bell",
        state: {},
        code: 'world.emit("The watch bell rings.","action",["watcher"]);',
      },
    ];
    const t = await boot(c);
    const stored = JSON.parse(
      String(t.sql.exec("SELECT body FROM adventure WHERE id=1").toArray()[0]!["body"])
    );
    stored.world.schedule.push({ id: "wake", entityId: "tower", at: 1, trigger: "bell" });
    t.sql.exec("UPDATE adventure SET body=? WHERE id=1", JSON.stringify(stored));
    await t.user("play", { id: "wait", text: "Wait briefly" });
    await t.agent("player", "execute", { turnId: "wait", code: "world.wait(1)" });
    await t.agent("player", "finish", { turnId: "wait", text: "Time passes." });
    const game = await t.user("getGame");
    expect(game.pending.participants).toEqual(["watcher"]);
    expect(game.neededSeats.map((seat: any) => seat.role)).toEqual(["person:watcher"]);
    expect(game.view.events.some((e: any) => e.text.includes("watch bell"))).toBe(false);
    expect(t.deliveries).not.toContain("do:person:clerk");
  });
  it("migrates old foreground painting to a resumable background task with the exact native job", async () => {
    const t = await boot();
    const stored = JSON.parse(
      String(t.sql.exec("SELECT body FROM adventure WHERE id=1").toArray()[0]!["body"])
    );
    delete stored.orchestrationVersion;
    delete stored.scenes;
    delete stored.artworkSignatures;
    stored.pending = {
      id: "legacy-turn",
      phase: "artist",
      text: "Look around",
      participants: [],
      replies: [],
      attempt: 2,
    };
    stored.imageJob = {
      id: "already-generating",
      placeId: "room",
      revision: stored.world.revision,
    };
    t.sql.exec("UPDATE adventure SET body=? WHERE id=1", JSON.stringify(stored));
    const game = await t.user("getGame");
    expect(game.pending).toBeNull();
    expect(game.background.scene.id).toBe("legacy-turn");
    expect(t.deliveries.at(-1)).toBe("do:artist");
    const artist = await t.agent("artist", "perspective");
    expect(artist.imageJob.id).toBe("already-generating");
    expect(artist.pending.id).toBe("legacy-turn");
    await t.agent("artist", "publishArtwork", {
      turnId: "legacy-turn",
      asset: { id: "legacy-art", digest: "finished" },
    });
    expect((await t.user("getGame")).world.artwork.room.id).toBe("legacy-art");
    const migrated = JSON.parse(
      String(t.sql.exec("SELECT body FROM adventure WHERE id=1").toArray()[0]!["body"])
    );
    expect(migrated.engineSource).toBe(stored.engineSource);
    expect(migrated.world.behaviors).toEqual(stored.world.behaviors);
    expect(migrated.scenes).toEqual([]);
    expect(migrated.orchestrationVersion).toBe(2);
  });
  it("preserves a completed legacy journey when adding independent scene bookkeeping", async () => {
    const t = await boot();
    const stored = JSON.parse(
      String(t.sql.exec("SELECT body FROM adventure WHERE id=1").toArray()[0]!["body"])
    );
    delete stored.orchestrationVersion;
    delete stored.scenes;
    delete stored.artworkSignatures;
    stored.receipts.push("finished");
    stored.world.artwork.room = { id: "saved-art", digest: "kept" };
    t.sql.exec("UPDATE adventure SET body=? WHERE id=1", JSON.stringify(stored));
    const game = await t.user("getGame");
    expect(game.pending).toBeNull();
    expect(game.background.scene).toBeNull();
    expect(game.world.artwork.room.id).toBe("saved-art");
    const migrated = JSON.parse(
      String(t.sql.exec("SELECT body FROM adventure WHERE id=1").toArray()[0]!["body"])
    );
    expect(migrated.world).toEqual(stored.world);
    expect(migrated.engineSource).toBe(stored.engineSource);
    expect(migrated.receipts).toEqual(["finished"]);
  });
  it("commits an agent-written component/transfer/relation program without inventing a named action or invoking the builder", async () => {
    const c = structuredClone(campaign);
    c.entities.push(
      {
        id: "coat",
        kind: "object",
        name: "Waxed coat",
        description: "A dark coat",
        location: "player",
        components: { portable: true, opaque: true },
      },
      {
        id: "lamp",
        kind: "object",
        name: "Counter lamp",
        description: "A shining lamp",
        location: "room",
        components: { light: true },
      }
    );
    c.behaviors = [
      {
        id: "folding",
        entityId: "coat",
        trigger: "change",
        state: { folds: 0 },
        code: 'if(event.key === "fold"){state.folds++;world.patch(self.id,{description:"A carefully folded coat"});}',
      },
    ];
    const t = await boot(c);
    await t.user("play", {
      id: "improvise",
      text: "Fold the coat and use it to shade the counter lamp.",
    });
    const result = await t.agent("player", "execute", {
      turnId: "improvise",
      code: `
      const lamp = world.inspect("lamp");
      world.setComponent("coat", "fold", {layers:2, orientation:"lengthwise"});
      world.transfer("coat", lamp.location);
      const cover = world.link("coat", lamp.id, "covers", {purpose:"shade"});
      return {fold:world.getComponent("coat","fold"),light:world.getComponent(lamp.id,"effectiveLight"),cover};
    `,
    });
    expect(result.fold).toEqual({ layers: 2, orientation: "lengthwise" });
    expect(result.light).toBe(false);
    expect(result.cover.kind).toBe("covers");
    await t.agent("player", "finish", {
      turnId: "improvise",
      text: "You fold the coat and cover the lamp.",
    });
    const game = await t.user("getGame");
    expect(game.world.tick).toBe(3);
    expect(game.pending.phase).toBe("participants");
    expect(game.view.entities.find((entity: any) => entity.id === "coat").description).toBe(
      "A carefully folded coat"
    );
    const keeper = await t.agent("builder", "perspective");
    expect(
      keeper.world.behaviors.find((behavior: any) => behavior.id === "folding").state.folds
    ).toBe(1);
    expect(keeper.trajectory.filter((entry: any) => entry.code)).toHaveLength(1);
    expect(t.deliveries).not.toContain("do:builder");
    expect(
      game.world.journal
        .filter((entry: any) => entry.kind === "action")
        .every((entry: any) => entry.audience.includes("clerk"))
    ).toBe(true);
  });
  it("returns ordinary physical and protected-field refusals to the participant without committing partial effects", async () => {
    const c = structuredClone(campaign);
    c.entities.push(
      {
        id: "coat",
        kind: "object",
        name: "Coat",
        description: "",
        location: "player",
        components: { portable: true, opaque: true },
      },
      {
        id: "lamp",
        kind: "object",
        name: "Lamp",
        description: "",
        location: "room",
        components: { light: true },
      }
    );
    const t = await boot(c);
    await t.user("play", { id: "shade", text: "Use the coat to shade the lamp" });
    const refused = await t.agent("player", "execute", {
      turnId: "shade",
      code: 'world.setComponent("coat","folded",true);world.link("coat","lamp","covers");',
    });
    expect(refused.actionError).toBeTruthy();
    expect((await t.user("getGame")).pending.phase).toBe("player");
    let state = await t.agent("builder", "perspective");
    expect(state.world.tick).toBe(0);
    expect(
      state.world.entities.find((entity: any) => entity.id === "coat").components.folded
    ).toBeUndefined();
    expect(state.world.relations).toEqual([]);
    const corrected = await t.agent("player", "execute", {
      turnId: "shade",
      code: 'world.transfer("coat","room");world.link("coat","lamp","covers");return world.getComponent("lamp","effectiveLight");',
    });
    expect(corrected).toBe(false);
    const derived = await t.agent("player", "execute", {
      turnId: "shade",
      code: 'world.setComponent("lamp","effectiveLight",false);',
    });
    expect(derived.actionError).toBeTruthy();
    state = await t.agent("builder", "perspective");
    expect(state.world.tick).toBe(2);
    expect(state.world.entities.find((entity: any) => entity.id === "lamp").components.light).toBe(
      true
    );
    expect(
      state.world.relations.filter((relation: any) => relation.kind === "covers")
    ).toHaveLength(1);
    expect(t.deliveries).not.toContain("do:builder");
    await t.agent("player", "finish", {
      turnId: "shade",
      text: "You place the coat over the lamp; its light is screened.",
    });
    expect((await t.user("getGame")).pending.phase).toBe("participants");
  });
});
