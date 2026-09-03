import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { AgentTool } from "@workspace/pi-core";
import { RegencyAgentWorker } from "./index.js";
import { buildPrompt } from "./prompts.js";

class TestWorker extends RegencyAgentWorker {
  seatChannel(role: string, realm: string, extra: Record<string, unknown> = {}): void {
    const config = JSON.stringify({ role, realm, gameKey: "main", realmName: "Aster", ...extra });
    this.sql.exec(
      `INSERT INTO subscriptions (channel_id, context_id, revision, subscribed_at, config, relationship_json, participant_id)
       VALUES ('ch-1', 'ctx-1', 1, 1, ?, '{}', 'agent:test')`,
      config,
    );
  }
  participant() {
    return this.getParticipantInfo("ch-1");
  }
  prompt() {
    return this.getAgentPrompt("ch-1");
  }
  async tools(): Promise<AgentTool[]> {
    return this.getLoopTools("ch-1");
  }
  gameTools(role: string): AgentTool[] {
    return this.createGameTools({ role, realm: "regency", gameKey: "main", realmName: "Aster" }, { call: async () => "ok" as unknown });
  }
}

describe("RegencyAgentWorker", () => {
  it("takes its seat, name and persona from the subscription config", async () => {
    const { instance } = await createTestDO(TestWorker);
    const w = instance as TestWorker;
    w.seatChannel("marshal", "regency");
    expect(w.participant().handle).toBe("marshal");
    expect(w.participant().name).toBe("The Marshal");
    expect(w.prompt()).toContain("Marshal of Aster");
    expect(w.prompt()).toContain("declaration of war");
  });

  it("gives each seat the tools its role may use", async () => {
    const { instance } = await createTestDO(TestWorker);
    const w = instance as TestWorker;
    const names = (tools: AgentTool[]) => tools.map((t) => t.name);
    const herald = names(w.gameTools("herald"));
    expect(herald).toContain("seal_order");
    expect(herald).toContain("close_season");
    expect(herald).not.toContain("submit_order");
    const sovereign = names(w.gameTools("sovereign:r1"));
    expect(sovereign).toContain("submit_order");
    expect(sovereign).toContain("end_turn");
    expect(sovereign).not.toContain("seal_order");
    const treasurer = names(w.gameTools("treasurer"));
    expect(treasurer).toContain("submit_order");
    expect(treasurer).toContain("forecast_orders");
    expect(treasurer).toContain("respond_bribe");
    expect(treasurer).not.toContain("end_turn");
    expect(sovereign).toContain("offer_bribe");
    expect(sovereign).toContain("write_doctrine");
    expect(names(w.gameTools("ambassador:r1"))).toContain("write_dossier");
    const protector = names(w.gameTools("protector"));
    expect(protector).toEqual(expect.arrayContaining(["seal_order", "decide_crisis", "close_season", "submit_order", "pending_matters"]));
    expect(herald).toContain("decide_crisis");
    for (const t of w.gameTools("chancellor")) expect(t.label).toBe(t.name);
  });

  it("routes tool calls to the game service with the seat's identity", async () => {
    const { instance } = await createTestDO(TestWorker);
    const w = instance as TestWorker;
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const tools = w.createGameTools({ role: "envoy", realm: "regency", gameKey: "g1", realmName: "Aster" }, { call: async (method, ...args) => { calls.push({ method, args }); return { ok: true }; } });
    const submit = tools.find((t) => t.name === "submit_order")!;
    const result = await submit.execute("call-1", { order: { kind: "propose", proposal: { to: "r1", kind: "trade", terms: {}, message: "hi" } }, rationale: "trade is good" } as never);
    expect(calls[0]?.method).toBe("submitOrder");
    expect((calls[0]?.args[0] as { actor: string }).actor).toBe("envoy");
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  it("advertises the card decision method only for the Herald and the Protector", async () => {
    const { instance } = await createTestDO(TestWorker);
    const w = instance as TestWorker;
    w.seatChannel("herald", "regency");
    expect(w.participant().methods?.some((m) => m.name === "regency.decide")).toBe(true);
  });

  it("writes a directory into every persona so seats can reach each other", () => {
    const prompt = buildPrompt({ role: "envoy", realm: "regency", gameKey: "main", realmName: "Aster", directory: [{ role: "ambassador:r1", name: "Ambassador of Dulia", ref: "agent:ambassador-r1@regency-main-embassy-r1" }] });
    expect(prompt).toContain("agent:ambassador-r1@regency-main-embassy-r1");
  });
});
