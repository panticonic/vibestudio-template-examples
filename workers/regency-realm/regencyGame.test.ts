import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { CardOp } from "@workspace/regency-engine";
import { RegencyGameDO, type Debate, type Forecast, type GameView, type SubmitOrderResult } from "./index.js";

/** The Regent's panel is the default caller: a person at a client, which is how the game is played. */
const REGENT = { callerId: "panel:regency", callerKind: "panel" as const, userId: "regent" };

/**
 * Boot the game object with a stand-in for the workspace RPC client: the host
 * acknowledges alarm and title writes, and every other target (agent objects,
 * the workspace fs) is unreachable, so delivery paths are exercised as failures.
 */
async function boot() {
  const t = await createTestDO(RegencyGameDO);
  const rpcCalls: Array<{ target: string; method: string }> = [];
  // The real connectionless client stays (inbound dispatch needs it); only outbound calls are stubbed.
  const client = (t.instance as unknown as { rpc: { call: (target: string, method: string, ...rest: unknown[]) => Promise<unknown> } }).rpc;
  client.call = async (target: string, method: string) => {
    rpcCalls.push({ target, method });
    if (target === "main" && (method === "workspace-state.alarmSet" || method === "workspace-state.alarmClear" || method === "runtime.setTitle")) return undefined;
    throw new Error(`unreachable in the test harness: ${target}.${method}`);
  };
  const call = <R,>(method: string, args?: unknown): Promise<R> => t.callAs<R>(REGENT, method, args);
  return { ...t, call, rpcCalls };
}

async function founded() {
  const t = await boot();
  await t.call("newGame", { seed: "do-test", rivals: 2, realmName: "Aster" });
  return t;
}

describe("RegencyGameDO", () => {
  it("founds a game and serves a view", async () => {
    const { call } = await founded();
    const view = await call<GameView>("getGame");
    expect(view.state?.title).toBe("The Regency of Aster");
    expect(view.state?.season).toBe(0);
    expect(view.waitingFor).toHaveLength(2);
    expect(view.mandates).toEqual({ chancellor: "act", treasurer: "act", marshal: "act", envoy: "act" });
    expect(await call<string>("report", { kind: "realm" })).toContain("# Aster");
    expect(await call<string>("report", { kind: "rules" })).toContain("submit_order");
  });

  it("enforces portfolios, seals sensitive acts, and resolves when the courts are done", async () => {
    const { call } = await founded();
    const view = await call<GameView>("getGame");
    const state = view.state!;
    const cap = state.realms["regency"]!.capital;
    // Treasurer may build; marshal may not.
    const build = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "treasurer", order: { kind: "build", province: cap, building: "farm" } });
    if (!build.ok) throw new Error(build.reason);
    expect(build.status).toBe("pending");
    const wrong = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "marshal", order: { kind: "build", province: cap, building: "farm" } });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toMatch(/may not issue/);
    // War needs the seal.
    const rival = Object.keys(state.realms).find((r) => r !== "regency")!;
    const war = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "marshal", order: { kind: "declare_war", target: rival }, rationale: "Their claim on our marches is an insult." });
    if (!war.ok) throw new Error(war.reason);
    expect(war.status).toBe("awaiting_seal");
    await expect(call("closeSeason")).rejects.toThrow(/await the Regent's seal/);
    await call("sealOrder", { orderId: war.orderId, decision: "veto", note: "Not this year." });
    // Rival courts end their turns; the Regent closes the season.
    for (const r of view.waitingFor) {
      const res = await call<{ ok: boolean; resolved: boolean }>("endTurn", { realm: r, actor: `sovereign:${r}` });
      expect(res.ok).toBe(true);
    }
    const closed = await call<{ resolved: boolean; waitingFor: string[] }>("closeSeason");
    expect(closed.resolved).toBe(true);
    const after = await call<GameView>("getGame");
    expect(after.state?.season).toBe(1);
    expect(after.state?.provinces[cap]!.buildings.farm).toBe(state.provinces[cap]!.buildings.farm + 1);
    expect(after.state?.wars).toHaveLength(0);
    const orders = await call<Array<{ id: string; status: string }>>("listOrders", { season: 0 });
    expect(orders.find((o) => o.id === war.orderId)?.status).toBe("vetoed");
    expect(orders.find((o) => o.id === build.orderId)?.status).toBe("resolved");
  });

  it("waits for absent sovereigns until the Regent proceeds, then stewards them", async () => {
    const { call } = await founded();
    const closed = await call<{ resolved: boolean; waitingFor: string[] }>("closeSeason");
    expect(closed.resolved).toBe(false);
    expect(closed.waitingFor).toHaveLength(2);
    const view = await call<GameView>("getGame");
    expect(view.state?.phase).toBe("closing");
    const proceeded = await call<{ resolved: boolean; stewarded: string[] }>("proceedWithoutPending");
    expect(proceeded.resolved).toBe(true);
    expect(proceeded.stewarded).toHaveLength(2);
    const after = await call<GameView>("getGame");
    expect(after.state?.season).toBe(1);
    expect(after.state?.phase).toBe("orders");
    const stewardOrders = await call<Array<{ actor: string }>>("listOrders", { season: 0 });
    expect(stewardOrders.some((o) => o.actor === "steward")).toBe(true);
  });

  it("binds registered roles to their agent objects and queues briefings", async () => {
    const t = await founded();
    const { call, callAs } = t;
    await call("registerParticipant", { role: "marshal", realm: "regency", channelId: "court", participantId: "p1", targetId: "do:workers/regency-agents:RegencyAgentWorker:marshal-court", handle: "marshal", name: "The Marshal" });
    await call("registerParticipant", { role: "herald", realm: "regency", channelId: "court", participantId: "p0", targetId: "do:workers/regency-agents:RegencyAgentWorker:herald-court", handle: "herald", name: "The Herald" });
    const view = await call<GameView>("getGame");
    const cap = view.state!.realms["regency"]!.capital;
    const impostor = await callAs<SubmitOrderResult>({ callerId: "do:someone:else:x", callerKind: "do" }, "submitOrder", { realm: "regency", actor: "marshal", order: { kind: "muster", province: cap, unit: "levy", companies: 1 } });
    expect(impostor.ok).toBe(false);
    if (!impostor.ok) expect(impostor.reason).toMatch(/not the registered marshal/);
    const genuine = await callAs<SubmitOrderResult>({ callerId: "do:workers/regency-agents:RegencyAgentWorker:marshal-court", callerKind: "do" }, "submitOrder", { realm: "regency", actor: "marshal", order: { kind: "muster", province: cap, unit: "levy", companies: 1 } });
    expect(genuine.ok).toBe(true);
    // Agents can never sit in the Regent's chair.
    const usurper = await callAs<SubmitOrderResult>({ callerId: "do:workers/regency-agents:RegencyAgentWorker:marshal-court", callerKind: "do" }, "submitOrder", { realm: "regency", actor: "regent", order: { kind: "set_tax", taxRate: 0.5 } });
    expect(usurper.ok).toBe(false);
    // Resolution queues a briefing for the herald and asks for a durable wake; nothing is delivered
    // from the request itself. The alarm drains the queue; delivery fails in the test harness and
    // is retried a bounded number of times before it waits for the Regent's "re-send".
    // The opening matter of state is a card before the season turns (it resolves to its default at the turn).
    expect((await call<CardOp[]>("pendingCards")).some((c) => c.typeId === "regency.matter")).toBe(true);
    await call("proceedWithoutPending");
    const projection = (t.instance as unknown as { nextAlarmAfterRequest(): { wakeAt: number } | null }).nextAlarmAfterRequest();
    expect(projection?.wakeAt).toBeLessThanOrEqual(Date.now());
    let view2 = await call<GameView>("getGame");
    expect(view2.briefings.find((b) => b.role === "herald")?.status).toBe("pending");
    expect(await t.instance.alarm()).toEqual({ wakeAt: expect.any(Number) });
    view2 = await call<GameView>("getGame");
    const herald = view2.briefings.find((b) => b.role === "herald")!;
    expect(herald.status).toBe("failed");
    expect(herald.attempts).toBe(1);
    expect(herald.content).toContain("You are the Herald");
    await t.instance.alarm();
    await t.instance.alarm();
    expect(await t.instance.alarm()).toBeNull(); // three attempts made; no further clock
    expect((await call<GameView>("getGame")).briefings.find((b) => b.role === "herald")?.attempts).toBe(3);
    expect(t.rpcCalls.some((c) => c.target === "do:workers/regency-agents:RegencyAgentWorker:herald-court" && c.method === "receiveBriefing")).toBe(true);
    expect(t.rpcCalls.some((c) => c.target === "do:workers/regency-agents:RegencyAgentWorker:herald-court" && c.method === "publishCards")).toBe(true);
    // Cards are decided here and handed to the Herald's object; until that succeeds they stay pending.
    const pending = await call<CardOp[]>("pendingCards");
    expect(pending.some((c) => c.typeId === "regency.season")).toBe(true);
  });

  it("publishes a seal card with a forecast for every act awaiting the seal, and keeps it after the decision", async () => {
    const { call } = await founded();
    await call("registerParticipant", { role: "herald", realm: "regency", channelId: "court", participantId: "p0", targetId: "do:workers/regency-agents:RegencyAgentWorker:herald-court", handle: "herald", name: "The Herald" });
    const state = (await call<GameView>("getGame")).state!;
    const rival = Object.keys(state.realms).find((r) => r !== "regency")!;
    const war = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "marshal", order: { kind: "declare_war", target: rival } });
    if (!war.ok) throw new Error(war.reason);
    const seal = (await call<CardOp[]>("pendingCards")).find((c) => c.typeId === "regency.seal" && c.key === `seal:${war.orderId}`);
    expect(seal).toBeDefined();
    expect((seal!.state as { forecast: string | null }).forecast).toMatch(/If sealed/);
    await call("sealOrder", { orderId: war.orderId, decision: "veto" });
    // Never published, so a vetoed act needs no card; had it been published, its card would be updated.
    expect((await call<CardOp[]>("pendingCards")).some((c) => c.key === `seal:${war.orderId}`)).toBe(false);
  });

  it("forecasts a season, decides matters of state, and keeps snapshots", async () => {
    const { call } = await founded();
    const view = await call<GameView>("getGame");
    const state = view.state!;
    const cap = state.realms["regency"]!.capital;
    const fc = await call<Forecast>("forecast", { orders: [{ kind: "build", province: cap, building: "farm" }] });
    expect(fc.treasury.before).toBe(state.realms["regency"]!.treasury);
    expect(fc.events.length).toBeGreaterThan(0);
    expect(fc.assumption).toMatch(/steward/);
    // Decide a matter (force one to exist through the engine's forced list by resolving once).
    await call("proceedWithoutPending");
    let after = await call<GameView>("getGame");
    expect(after.snapshots).toEqual([0, 1]);
    let pending = after.state!.crises.filter((c) => c.chosen === null);
    for (let i = 0; i < 6 && pending.length === 0; i++) {
      await call("proceedWithoutPending");
      after = await call<GameView>("getGame");
      pending = after.state!.crises.filter((c) => c.chosen === null);
    }
    if (pending.length > 0) {
      const c = pending[0]!;
      const res = await call<{ ok: boolean; reason?: string }>("decideCrisis", { crisisId: c.id, optionId: c.options[0]!.id });
      expect(res.ok).toBe(true);
      const again = await call<{ ok: boolean; reason?: string }>("decideCrisis", { crisisId: c.id, optionId: c.options[0]!.id });
      expect(again.ok).toBe(false);
    }
    const snap = await call<GameView["state"]>("getSnapshot", { season: 0 });
    expect(snap?.season).toBe(0);
  });

  it("runs intrigue: bribes are private until reported, and leak the order book when accepted", async () => {
    const t = await founded();
    const { call, callAs } = t;
    const view = await call<GameView>("getGame");
    const rival = Object.keys(view.state!.realms).find((r) => r !== "regency")!;
    const sovereign = { callerId: `do:agents:RegencyAgentWorker:sovereign-${rival}`, callerKind: "do" as const };
    const envoy = { callerId: "do:agents:RegencyAgentWorker:envoy-court", callerKind: "do" as const };
    await call("registerParticipant", { role: `sovereign:${rival}`, realm: rival, channelId: `court-${rival}`, participantId: "ps", targetId: sovereign.callerId, handle: `sovereign-${rival}`, name: "S" });
    await call("registerParticipant", { role: "envoy", realm: "regency", channelId: "court", participantId: "pe", targetId: envoy.callerId, handle: "envoy", name: "E" });
    const offer = await callAs<{ ok: boolean; bribeId?: string; reason?: string }>(sovereign, "offerBribe", { actor: `sovereign:${rival}`, targetRole: "envoy", gold: 30, note: "A small token." });
    expect(offer.ok).toBe(true);
    // The Regent sees nothing yet.
    expect((await call<GameView>("getGame")).bribes).toHaveLength(0);
    const temptations = await callAs<Array<{ id: string }>>(envoy, "myTemptations", { actor: "envoy" });
    expect(temptations).toHaveLength(1);
    const accepted = await callAs<{ ok: boolean }>(envoy, "respondBribe", { actor: "envoy", bribeId: offer.bribeId, decision: "accept" });
    expect(accepted.ok).toBe(true);
    expect((await call<GameView>("getGame")).state!.realms[rival]!.treasury).toBe(60 - 30);
    expect((await call<GameView>("getGame")).bribes).toHaveLength(0);
    // A second, reported offer becomes public.
    const offer2 = await callAs<{ ok: boolean; bribeId?: string }>(sovereign, "offerBribe", { actor: `sovereign:${rival}`, targetRole: "envoy", gold: 20, note: "Another." });
    await callAs(envoy, "respondBribe", { actor: "envoy", bribeId: offer2.bribeId, decision: "report" });
    const reported = await call<GameView>("getGame");
    expect(reported.bribes.map((b) => b.status)).toEqual(["reported"]);
    expect(reported.events.some((e) => e.kind === "court" && e.text.includes("named the messenger"))).toBe(true);
    // After a season the accepted bribe leaks the order book into the sovereign's briefing.
    await call("submitOrder", { realm: "regency", actor: "regent", order: { kind: "set_tax", taxRate: 0.35 } });
    await call("proceedWithoutPending");
    const briefing = (await call<GameView>("getGame")).briefings.find((b) => b.role === `sovereign:${rival}`);
    expect(briefing?.content).toContain("From a friend at the Regent's court");
  });

  it("lets the Regent delegate to a Lord Protector within a mandate", async () => {
    const t = await founded();
    const { call, callAs } = t;
    const protector = { callerId: "do:agents:RegencyAgentWorker:protector-court", callerKind: "do" as const };
    await call("registerParticipant", { role: "protector", realm: "regency", channelId: "court", participantId: "pp", targetId: protector.callerId, handle: "protector", name: "P" });
    const view = await call<GameView>("getGame");
    const rival = Object.keys(view.state!.realms).find((r) => r !== "regency")!;
    const war = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "marshal", order: { kind: "declare_war", target: rival } });
    if (!war.ok) throw new Error(war.reason);
    // Without an appointment the protector is just another agent.
    const denied = await callAs<{ ok: boolean; reason?: string }>(protector, "sealOrder", { orderId: war.orderId, decision: "seal" });
    expect(denied.ok).toBe(false);
    await call("appointProtector", { mandate: "Keep the peace and the granaries full.", seasons: 2, limits: { maySealWar: false } });
    const outside = await callAs<{ ok: boolean; reason?: string }>(protector, "sealOrder", { orderId: war.orderId, decision: "seal" });
    expect(outside.ok).toBe(false);
    expect(outside.reason).toMatch(/mandate/);
    const tax = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "chancellor", order: { kind: "set_tax", taxRate: 0.25 } });
    if (!tax.ok) throw new Error(tax.reason);
    const inside = await callAs<{ ok: boolean }>(protector, "sealOrder", { orderId: tax.orderId, decision: "seal" });
    expect(inside.ok).toBe(true);
    await call("sealOrder", { orderId: war.orderId, decision: "veto" });
    await call("proceedWithoutPending");
    await call("proceedWithoutPending");
    const after = await call<GameView>("getGame");
    expect(after.protectorate?.active).toBe(false);
    expect(after.events.some((e) => e.text.includes("mandate has run its course"))).toBe(true);
  });


  it("stages intents on the map, binds them to their orders, and clears them at resolution", async () => {
    const t = await founded();
    const { call } = t;
    const view = await call<GameView>("getGame");
    const state = view.state!;
    const army = Object.values(state.armies).find((a) => a.realm === "regency")!;
    const to = state.provinces[army.province]!.neighbors[0]!;
    const bad = await call<{ ok: boolean; reason?: string }>("stageIntent", { actor: "marshal", kind: "march", label: "north", payload: { army: "nope" } });
    expect(bad.ok).toBe(false);
    const staged = await call<{ ok: boolean; intent?: { id: string; payload: { from?: string } } }>("stageIntent", { actor: "marshal", kind: "march", label: "Screen the northern border", payload: { army: army.id, to } });
    expect(staged.ok).toBe(true);
    expect(staged.intent?.payload.from).toBe(army.province);
    expect(await call<unknown[]>("listIntents")).toHaveLength(1);
    // Submitting the order it anticipated binds them together.
    const order = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "marshal", order: { kind: "move", army: army.id, to } });
    if (!order.ok) throw new Error(order.reason);
    expect((await call<Array<{ orderId: string | null }>>("listIntents"))[0]?.orderId).toBe(order.orderId);
    // Withdrawing the order takes the ghost off the map with it.
    await call("withdrawOrder", { orderId: order.orderId, actor: "marshal" });
    expect(await call<unknown[]>("listIntents")).toHaveLength(0);
    // And everything staged is wiped when the season turns.
    await call("stageIntent", { actor: "treasurer", kind: "build", label: "A granary in the marches", payload: { province: state.realms["regency"]!.capital } });
    await call("proceedWithoutPending");
    expect(await call<unknown[]>("listIntents")).toHaveLength(0);
  });

  it("names an army, and refuses a name from the wrong seat", async () => {
    const { call } = await founded();
    const view = await call<GameView>("getGame");
    const army = Object.values(view.state!.armies).find((a) => a.realm === "regency")!;
    const foreign = Object.values(view.state!.armies).find((a) => a.realm !== "regency")!;
    expect((await call<{ ok: boolean }>("renameArmy", { actor: "treasurer", army: army.id, name: "The Iron Company" })).ok).toBe(false);
    expect((await call<{ ok: boolean; reason?: string }>("renameArmy", { actor: "marshal", army: foreign.id, name: "Mine now" })).reason).toMatch(/does not answer/);
    expect((await call<{ ok: boolean }>("renameArmy", { actor: "marshal", army: army.id, name: "x" })).ok).toBe(false);
    const ok = await call<{ ok: boolean; name?: string }>("renameArmy", { actor: "marshal", army: army.id, name: "The Grey Company of the Marches, raised in the first spring of the Regency" });
    expect(ok.ok).toBe(true);
    expect(ok.name!.length).toBe(40);
    expect((await call<GameView>("getGame")).state!.armies[army.id]!.name).toBe(ok.name);
  });

  it("keeps the Regent's word as a ledger and charges infamy when it is broken", async () => {
    const { call } = await founded();
    const view = await call<GameView>("getGame");
    const rival = Object.keys(view.state!.realms).find((r) => r !== "regency")!;
    expect((await call<{ ok: boolean }>("recordPromise", { actor: "marshal", to: rival, text: "No war for two seasons.", check: { kind: "no_war", with: rival, seasons: 2 } })).ok).toBe(false);
    const made = await call<{ ok: boolean; reason?: string; promise?: { id: string } }>("recordPromise", { actor: "envoy", to: rival, text: "No war upon you for two seasons.", check: { kind: "no_war", with: rival, seasons: 2 } });
    if (!made.ok) throw new Error(made.reason);
    expect((await call<GameView>("getGame")).promises).toHaveLength(1);
    // Declaring war on them breaks it at the next resolution.
    const war = await call<SubmitOrderResult>("submitOrder", { realm: "regency", actor: "regent", order: { kind: "declare_war", target: rival } });
    if (!war.ok) throw new Error(war.reason);
    const infamyBefore = view.state!.realms["regency"]!.infamy;
    await call("proceedWithoutPending");
    const after = await call<GameView>("getGame");
    expect(after.promises[0]?.status).toBe("broken");
    expect(after.state!.realms["regency"]!.infamy).toBeGreaterThan(infamyBefore);
    expect(after.events.some((e) => e.text.includes("broke a word"))).toBe(true);
  });

  it("convenes the council, records one line per minister, and closes when all four have spoken", async () => {
    const { call, callAs } = await founded();
    const seats: Record<string, { callerId: string; callerKind: "do" }> = {};
    for (const role of ["chancellor", "treasurer", "marshal", "envoy", "herald"]) {
      const callerId = `do:agents:RegencyAgentWorker:${role}-court`;
      seats[role] = { callerId, callerKind: "do" };
      await call("registerParticipant", { role, realm: "regency", channelId: "court", participantId: `p-${role}`, targetId: callerId, handle: role, name: role });
    }
    const opened = await callAs<{ ok: boolean; debateId?: string; asked?: string[] }>(seats["herald"]!, "convene", { actor: "herald", question: "Do we hold the northern marches or trade them for peace?" });
    expect(opened.ok).toBe(true);
    expect(opened.asked).toHaveLength(4);
    const debateId = opened.debateId!;
    for (const role of ["chancellor", "treasurer", "marshal"]) {
      const res = await callAs<{ ok: boolean; closed?: boolean }>(seats[role]!, "giveCounsel", { actor: role, debateId, text: `${role} says hold.` });
      expect(res.ok).toBe(true);
      expect(res.closed).toBe(false);
    }
    // An impostor cannot speak for a minister.
    expect((await callAs<{ ok: boolean }>({ callerId: "do:someone:else", callerKind: "do" }, "giveCounsel", { actor: "envoy", debateId, text: "trade" })).ok).toBe(false);
    const last = await callAs<{ closed?: boolean }>(seats["envoy"]!, "giveCounsel", { actor: "envoy", debateId, text: "Trade them; the marches are not worth a decade." });
    expect(last.closed).toBe(true);
    const debates = await call<Debate[]>("listDebates");
    expect(debates[0]?.status).toBe("closed");
    expect(debates[0]?.lines).toHaveLength(4);
    // The Herald is handed the whole debate and asked to put the choice before the Regent.
    const verdict = (await call<GameView>("getGame")).briefings.find((b) => b.id === `v${debateId}`);
    expect(verdict?.role).toBe("herald");
    expect(verdict?.content).toContain("Trade them; the marches are not worth a decade.");
    expect(verdict?.content).toContain("ask the Regent to choose");
    // The Regent may convene by their own hand, and the ministers are told who asked.
    const own = await call<{ ok: boolean; debateId?: string }>("convene", { actor: "regent", question: "Is the treasury sound enough for a second army?" });
    expect(own.ok).toBe(true);
    expect((await call<GameView>("getGame")).briefings.some((b) => b.id === `${own.debateId}-marshal` && b.content.includes("The Regent puts a question"))).toBe(true);
  });

  it("wakes the ministers who have cause to interrupt and the chronicler at the year's end", async () => {
    const { call } = await founded();
    for (const role of ["herald", "chancellor", "treasurer", "marshal", "envoy", "chronicler"]) {
      await call("registerParticipant", { role, realm: "regency", channelId: "court", participantId: `p-${role}`, targetId: `do:agents:RegencyAgentWorker:${role}`, handle: role, name: role });
    }
    // Bankrupt the treasury so the Treasurer has something to shout about.
    const view = await call<GameView>("getGame");
    const cap = view.state!.realms["regency"]!.capital;
    for (let i = 0; i < 4; i++) await call("submitOrder", { realm: "regency", actor: "regent", order: { kind: "muster", province: cap, unit: "cavalry", companies: 2 } });
    for (let season = 0; season < 4; season++) await call("proceedWithoutPending");
    const after = await call<GameView>("getGame");
    expect(after.state?.season).toBe(4);
    expect(after.briefings.some((b) => b.role === "chronicler" && b.content.includes("write_chronicle"))).toBe(true);
    const chronicled = await call<{ ok: boolean; reason?: string; year?: number }>("writeChronicle", { actor: "chronicler", text: "The first year of the Regency passed in mustering and in argument, and the treasury felt it." });
    expect(chronicled.ok).toBe(true);
    expect((await call<GameView>("getGame")).chronicles[0]?.year).toBe(chronicled.year);
    expect((await call<{ ok: boolean }>("writeChronicle", { actor: "marshal", text: "The Marshal writes history now." })).ok).toBe(false);
  });

  it("asks the Lord Protector for a hand-over when the mandate runs out", async () => {
    const { call, callAs } = await founded();
    const protector = { callerId: "do:agents:RegencyAgentWorker:protector", callerKind: "do" as const };
    await call("registerParticipant", { role: "protector", realm: "regency", channelId: "court", participantId: "pp", targetId: protector.callerId, handle: "protector", name: "P" });
    await call("appointProtector", { mandate: "Hold the realm while I ride north.", seasons: 1, limits: {} });
    await call("proceedWithoutPending");
    const after = await call<GameView>("getGame");
    expect(after.briefings.some((b) => b.role === "protector" && b.content.includes("write_handover"))).toBe(true);
    const wrote = await callAs<{ ok: boolean; reason?: string }>(protector, "writeHandover", { actor: "protector", text: "I sealed two acts, refused the war, and left the granaries fuller than I found them." });
    expect(wrote.ok).toBe(true);
    const view = await call<GameView>("getGame");
    expect(view.handovers[0]?.text).toContain("granaries");
    expect(view.handovers[0]?.mandate).toContain("ride north");
  });

  it("opens the secret history only once the game is over", async () => {
    const { call, callAs } = await boot();
    await call("newGame", { seed: "secrets", rivals: 2, realmName: "Aster", regencySeasons: 1 });
    const view = await call<GameView>("getGame");
    const rival = Object.keys(view.state!.realms).find((r) => r !== "regency")!;
    const sov = { callerId: "do:agents:RegencyAgentWorker:sov", callerKind: "do" as const };
    await call("registerParticipant", { role: `sovereign:${rival}`, realm: rival, channelId: "court-r", participantId: "ps", targetId: sov.callerId, handle: "sov", name: "S" });
    await callAs(sov, "writeRelationsDiary", { actor: `sovereign:${rival}`, text: "The Regent listens well and pays late." });
    expect(await callAs<string>(sov, "readRelationsDiary", { actor: `sovereign:${rival}` })).toContain("pays late");
    expect((await call<GameView>("getGame")).secrets).toBeNull();
    // Run out the Regency: the heir comes of age and the reckoning opens.
    await call("proceedWithoutPending");
    const finished = await call<GameView>("getGame");
    expect(finished.state?.phase).toBe("finished");
    expect(finished.secrets?.diaries[0]?.text).toContain("pays late");
    expect(finished.secrets?.chambers).toBeDefined();
  });

  it("keeps dossiers and doctrines per seat and folds them into briefings", async () => {
    const { call, callAs } = await founded();
    const view = await call<GameView>("getGame");
    const rival = Object.keys(view.state!.realms).find((r) => r !== "regency")!;
    const amb = { callerId: "do:agents:RegencyAgentWorker:amb", callerKind: "do" as const };
    const sov = { callerId: "do:agents:RegencyAgentWorker:sov", callerKind: "do" as const };
    await call("registerParticipant", { role: `ambassador:${rival}`, realm: rival, channelId: "embassy", participantId: "pa", targetId: amb.callerId, handle: "amb", name: "A" });
    await call("registerParticipant", { role: `sovereign:${rival}`, realm: rival, channelId: "court-r", participantId: "ps", targetId: sov.callerId, handle: "sov", name: "S" });
    await callAs(amb, "writeDossier", { actor: `ambassador:${rival}`, text: "The Regent promised open roads." });
    expect(await callAs<string>(amb, "readDossier", { actor: `ambassador:${rival}` })).toContain("open roads");
    await callAs(sov, "writeDoctrine", { actor: `sovereign:${rival}`, text: "Farms first, then the northern claim." });
    await call("openCourt");
    await call("proceedWithoutPending");
    const after = await call<GameView>("getGame");
    expect(after.briefings.find((b) => b.role === `sovereign:${rival}` && b.id.startsWith("b"))?.content).toContain("Farms first");
    expect(after.doctrines[0]?.text).toContain("Farms first");
  });
});
