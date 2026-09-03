import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { RegencyGameDO, type Forecast, type GameView, type SubmitOrderResult } from "./index.js";

async function founded() {
  const t = await createTestDO(RegencyGameDO);
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
    // Resolution queues a briefing for the herald; delivery fails in the test harness and stays retryable.
    await call("proceedWithoutPending");
    const after = await call<GameView>("getGame");
    expect(after.briefings.some((b) => b.role === "herald" && b.status === "failed")).toBe(true);
    expect(after.briefings.find((b) => b.role === "herald")?.content).toContain("You are the Herald");
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
