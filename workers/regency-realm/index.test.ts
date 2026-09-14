import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { initialGame } from "@workspace/regency-engine";
import { RegencyGameDO } from "./index.js";
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
  const t = await createTestDO(RegencyGameDO);
  const deliveries: string[] = [];
  const outbound = (
    t.instance as unknown as {
      rpc: {
        call: (
          target: string,
          method: string,
          args?: unknown[],
        ) => Promise<unknown>;
      };
    }
  ).rpc;
  const scopes = new Map<string, Record<string, unknown>>();
  outbound.call = async (target, method, args) => {
    if (method === "eval.dispose") {
      scopes.delete((args![0] as any).scopeKey);
      return { ok: true };
    }
    if (method === "eval.start") {
      const input = args![0] as any;
      const scope = scopes.get(input.scope.key) ?? {};
      scopes.set(input.scope.key, scope);
      const returnValue = await runInNewContext(
        `(async function(){${input.source.code}})()`,
        { scope },
        { timeout: 100 },
      );
      return {
        snapshot: { status: "done", result: { success: true, returnValue } },
      };
    }

    if (method === "receiveMoment") {
      deliveries.push(target);
      if (fail) throw new Error("delivery unavailable");
    }
    return undefined;
  };
  const player = <T = any>(method: string, input?: unknown) =>
    t.callAs<T>(PLAYER, method, input);
  await player("registerParticipant", {
    targetId: "do:story",
    channelId: "story",
    role: "storyteller",
  });
  await player("registerParticipant", {
    targetId: "do:mara",
    channelId: "people",
    role: "person:mara",
  });
  return { ...t, player, deliveries, outbound };
}
describe("regency durable turns", () => {
  it("builds a persistent mechanism, executes its scene action once and preserves consequences on cancellation", async () => {
    const t = await boot(), mara = {...AGENT, callerId:"do:mara"}, builder = {...AGENT,callerId:"do:builder"};
    await t.player("play", {id:"mill",wish:"Visit the mill and open its sluice."});
    await t.callAs(mara,"requestDevelopment",{turnId:"mill",request:"Establish the upstream mill and its sluice mechanism."});
    expect((await t.player("getGame")).neededSeats).toContainEqual({role:"builder",name:"The realm beyond the map"});
    await t.player("registerParticipant",{role:"builder",targetId:"do:builder",channelId:"builder"});
    await expect(t.callAs(mara,"developWorld",{turnId:"mill"})).rejects.toThrow(/registered/);
    await t.callAs(builder,"developWorld",{
      turnId:"mill",places:[{id:"mill",name:"The upstream mill",description:"Water queues behind the closed sluice.",facts:["The waterwheel is idle."]}],
      systems:{mill:{water:12,flour:0,open:false}},
      processes:[{id:"mill-work",title:"Water-powered milling",state:{turns:0},code:"const m=realm.systems.mill;if(phase==='interact'){if(event.action!=='open')throw new Error('Unknown action');if(realm.location!=='mill')throw new Error('You must reach the sluice');m.open=true;state.turns++;events.push('The sluice opened.');}if(phase==='tick'&&m.open){const work=Math.min(m.water,3);m.water-=work;m.flour+=work;}"}],
    });
    let view = await t.player("getGame");
    expect(view.pending.world.systems.mill).toEqual({water:12,flour:0,open:false});
    expect(view.pending.development).toBeUndefined();
    const action={turnId:"mill",actionId:"open-sluice",processId:"mill-work",action:"open",payload:{}};
    await expect(t.callAs(mara,"interactWorld",action)).rejects.toThrow(/reach/);
    await t.callAs(mara,"visitPlace",{turnId:"mill",placeId:"mill"});
    await t.callAs(mara,"interactWorld",action);
    expect(await t.callAs(mara,"interactWorld",action)).toMatchObject({alreadyApplied:true});
    await expect(t.callAs(mara,"interactWorld",{...action,action:"close"})).rejects.toThrow(/different intention/);
    await t.player("cancel");
    view=await t.player("getGame");
    expect(view.game.world.systems.mill.open).toBe(true);
    expect(view.game.world.processes[0].state.turns).toBe(1);
    await t.player("advance",{id:"mill-month",months:1});
    view=await t.player("getGame");
    expect(view.game.world.systems.mill).toEqual({water:9,flour:3,open:true});
  });
  it("revises a mechanism prospectively without resetting its state or changing settled facts", async () => {
    const t=await boot(), mara={...AGENT,callerId:"do:mara"}, builder={...AGENT,callerId:"do:builder"};
    await t.player("registerParticipant",{role:"builder",targetId:"do:builder",channelId:"builder"});
    await t.player("play",{id:"develop",wish:"Explore a river institution."});
    await t.callAs(mara,"requestDevelopment",{turnId:"develop",request:"Model the water board."});
    await t.callAs(builder,"developWorld",{turnId:"develop",processes:[{id:"water-board",title:"Water board",code:"if(phase==='tick')state.meetings++;",state:{meetings:7}}]});
    await t.callAs(mara,"requestDevelopment",{turnId:"develop",request:"Refine the institution's meeting schedule."});
    await t.callAs(builder,"developWorld",{turnId:"develop",revisions:[{id:"water-board",code:"if(phase==='tick'&&realm.month%2===0)state.meetings++;",reason:"Meetings occur every second month."}]});
    const view=await t.player("getGame");
    expect(view.pending.world.month).toBe(0);
    expect(view.pending.world.processes[0].state.meetings).toBe(7);
    expect(view.pending.world.ledger).toEqual(initialGame().world.ledger);
  });
  it("persists delivery failure and retries without adding another player turn", async () => {
    const t = await boot(true);
    const pending = await t.player("play", {
      id: "one",
      wish: "Make a crossing",
    });
    expect(pending.pending.error).toContain("delivery unavailable");
    const again = await t.player("play", {
      id: "one",
      wish: "Make a crossing",
    });
    expect(again.pending.attempt).toBe(0);
    await t.player("retry");
    expect((await t.player("getGame")).pending.attempt).toBe(1);
    await expect(
      t.player("play", { id: "two", wish: "Another" }),
    ).rejects.toThrow(/already/);
  });
  it("accepts only its agent, commits once, and rejects late completion after cancellation", async () => {
    const t = await boot();
    await t.player("play", { id: "one", wish: "Help the garden and village" });
    const g = initialGame();
    // The advisor is the foreground author; no coordinator or narrator is required.
    expect((await t.player("getGame")).game.turn).toBe(0);
    await t.callAs({ ...AGENT, callerId: "do:mara" }, "speak", {
      turnId: "one",
      voice: {
        desire: g.people[0]!.desire,
        memory: g.people[0]!.memory,
        text: "The villages need a crossing.",
        action: "",
        visual: "Draw the new crossing",
      },
    });
    const input = {
      turnId: "one",
      result: {
        scene: null,
        title: "A new crossing",
        response: "Nell launches her boat.",
        suggestions: ["Tell me more."],
      },
    };
    await expect(t.player("finish", input)).rejects.toThrow(/agent/);
    await expect(
      t.callAs({ ...AGENT, callerId: "do:stranger" }, "finish", input),
    ).rejects.toThrow(/agent/);
    expect((await t.player("getGame")).pending).toBeNull();
    expect((await t.player("getGame")).painting).toBe(true);
    await t.callAs(AGENT, "finish", input);
    expect(await t.callAs(AGENT, "finish", input)).toEqual({
      superseded: true,
    });
    expect((await t.player("getGame")).game.turn).toBe(1);
    await t.player("play", { id: "two", wish: "Another wish" });
    await t.player("cancel");
    expect(
      await t.callAs(AGENT, "finish", { ...input, turnId: "two" }),
    ).toEqual({ superseded: true });
  });
  it("gives each advisor only their own private perspective and a seat in the current conversation", async () => {
    const t = await boot();
    const mara = { ...AGENT, callerId: "do:mara" };
    const perspective = await t.callAs<any>(mara, "perspective");
    expect(perspective.you.desire).toEqual(initialGame().people[0]!.desire);
    expect(
      perspective.others.every(
        (person: any) => !("desire" in person) && !("memory" in person),
      ),
    ).toBe(true);
    await t.player("play", { id: "one", wish: "Ivo, explain our budget." });
    await expect(
      t.callAs(mara, "proposePolicy", {
        turnId: "one",
        title: "Uninvited",
        summary: "A policy",
        code: "",
      }),
    ).rejects.toThrow(/in this conversation/);
  });
  it("commits the player's time action once, before advisor commentary, and preserves it on cancellation", async () => {
    const t = await boot();
    const before = (await t.player("getGame")).game.world;
    await t.player("advance", { id: "month", months: 1 });
    const view = await t.player("getGame");
    expect(view.game.world.month).toBe(before.month + 1);
    expect(view.pending.simulation).toBeTruthy();
    await t.player("advance", { id: "month", months: 1 });
    expect((await t.player("getGame")).game.world.month).toBe(before.month + 1);
    await t.player("cancel");
    expect((await t.player("getGame")).game.world.month).toBe(before.month + 1);
  });
  it("retries a failed time action as the same action, without substituting commentary", async () => {
    const t = await boot(),
      native = t.outbound.call;
    t.outbound.call = async (target, method, args) => {
      if (method === "eval.start") throw new Error("temporarily unavailable");
      return native(target, method, args);
    };
    await expect(
      t.player("advance", { id: "month", months: 1 }),
    ).rejects.toThrow("temporarily unavailable");
    expect((await t.player("getGame")).game.world.month).toBe(0);
    expect(t.deliveries).toEqual([]);
    t.outbound.call = native;
    await t.player("retry");
    expect((await t.player("getGame")).game.world.month).toBe(1);
  });
  it("can invite a new independent advisor without exposing anyone else's memories", async () => {
    const t = await boot();
    await t.player("play", {
      id: "new",
      wish: "Mara, we need a river engineer.",
    });
    await t.callAs({ ...AGENT, callerId: "do:mara" }, "invite", {
      turnId: "new",
      person: {
        id: "nell",
        name: "Nell",
        role: "River engineer",
        place: initialGame().world.places[0]!.id,
        desire: "Make the river safe.",
        memory: [],
      },
    });
    expect((await t.player("getGame")).neededSeats).toContainEqual({
      role: "person:nell",
      name: "Nell",
    });
  });
  it("keeps large artwork in the blob store and only references in SQLite", async () => {
    const t = await boot();
    await t.player("play", { id: "art", wish: "Paint a discovery" });
    const bytes = "iVBOR" + "A".repeat(3_000_000);
    t.outbound.call = async (_target, method, args) => {
      if (method === "blobstore.putText") {
        expect(args![0]).toBe(bytes);
        return { digest: "painted-image", size: bytes.length };
      }
      if (method === "blobstore.getText") {
        expect(args![0]).toBe("painted-image");
        return bytes;
      }
      throw new Error("Unexpected call: " + method);
    };
    await t.callAs(AGENT, "storeArt", {
      id: "painted",
      path: "panels/regency/assets/generated/painted.png",
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
