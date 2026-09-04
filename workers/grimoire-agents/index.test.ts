import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import type { AgentTool } from "@workspace/pi-core";
import { GrimoireAgentWorker, cellsTable, wakeContent, type Executor } from "./index.js";
import { buildPrompt } from "./prompts.js";
import { generateEstate } from "@workspace/grimoire-engine";

class TestWorker extends GrimoireAgentWorker {
  seatChannel(config: Record<string, unknown>): void {
    this.sql.exec(
      `INSERT INTO subscriptions (channel_id, context_id, revision, subscribed_at, config, relationship_json, participant_id)
       VALUES ('ch-1', 'ctx-1', 1, 1, ?, '{}', 'agent:test')`,
      JSON.stringify(config),
    );
  }
  participant() { return this.getParticipantInfo("ch-1"); }
  prompt() { return this.getAgentPrompt("ch-1"); }
  tools(cfg: Record<string, unknown>, calls: Array<{ method: string; args: unknown[] }>, executor?: Executor): AgentTool[] {
    return this.createGameTools(cfg as never, { call: async (method, ...args) => { calls.push({ method, args }); return method === "snapshot" ? snapshotFor() : { ok: true, rehearsal: { summary: "nothing", log: [], ether: 0, touched: 0 } }; } }, executor ?? (async () => ({ ok: true, effects: [], log: [], touched: 0, ether: 0, memory: {} })));
  }
}

function snapshotFor() {
  const state = generateEstate("agent-test");
  return { spellId: "s1", record: { id: "s1", caster: "ada", tier: "cantrip", earned: ["heat"], scope: ["manor"], etherBudget: 5, coCasters: [] }, regions: [state.regions.manor], entities: [], sky: state.sky, caster: { id: "ada", name: "Ada", reserve: 10, reserveMax: 20, reagents: {}, words: [], names: [], foci: [], region: "manor", x: 7, y: 8, active: [] }, workings: {}, utterances: [], memory: {}, envelope: { cells: 48, ether: 5, regions: ["manor"], capabilities: ["adorn", "transmute"] }, fork: true };
}

describe("GrimoireAgentWorker", () => {
  it("takes its seat and voice from the subscription config", async () => {
    const { instance } = await createTestDO(TestWorker);
    const w = instance as TestWorker;
    w.seatChannel({ role: "familiar", estateKey: "main", apprentice: "ada", apprenticeName: "Ada", room: "circle" });
    expect(w.participant().handle).toBe("familiar-circle");
    expect(w.participant().name).toBe("The familiar");
    expect(w.participant().methods?.map((method) => method.name)).toContain(
      "grimoire_command",
    );
    expect(
      w.participant().methods?.every((method) =>
        /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(method.name),
      ),
    ).toBe(true);
    expect(w.prompt()).toContain("I carry. I do not compose.");
    expect(w.prompt()).toContain("This conversation is the circle");
    expect(buildPrompt({ role: "spirit:river", estateKey: "main" })).toContain("Velharan");
    expect(buildPrompt({ role: "moor", estateKey: "main" })).toContain("outside");
    expect(buildPrompt({ role: "golem:Toll", estateKey: "main" })).toContain("Toll");
  });

  it("gives each seat the tools its role may use", async () => {
    const { instance } = await createTestDO(TestWorker);
    const w = instance as TestWorker;
    const names = (cfg: Record<string, unknown>) => w.tools(cfg, []).map((t) => t.name);
    const familiar = names({ role: "familiar", estateKey: "main", apprentice: "ada" });
    expect(familiar).toEqual(expect.arrayContaining(["hear", "look", "read_cells", "rehearse", "cast", "cast_here", "misfire", "reject", "glance", "inscribe", "remember", "read_notebook", "read_idiom", "scry"]));
    expect(familiar).not.toContain("act");
    const river = names({ role: "spirit:river", estateKey: "main" });
    expect(river).toEqual(expect.arrayContaining(["spirit_briefing", "say", "act", "set_wants", "regard", "answer_bargain", "judge_festival", "write_news"]));
    const moor = names({ role: "moor", estateKey: "main" });
    expect(moor).toContain("act");
    expect(moor).not.toContain("set_wants");
    expect(names({ role: "golem:Wren", estateKey: "main" })).toEqual(expect.arrayContaining(["senses", "act", "say", "write_news"]));
  });

  it("casts by running the writing in its own sandbox and committing the result", async () => {
    const { instance } = await createTestDO(TestWorker);
    const w = instance as TestWorker;
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const programs: string[] = [];
    const executor: Executor = async (program) => { programs.push(program); return { ok: true, effects: [{ kind: "transmute", cell: { region: "manor", x: 12, y: 8 }, delta: { heat: 1 } }], log: [], touched: 1, ether: 1, memory: {} }; };
    const tools = w.tools({ role: "familiar", estateKey: "main", apprentice: "ada" }, calls, executor);
    const cast = tools.find((t) => t.name === "cast")!;
    await cast.execute("call-1", { spellId: "s1", source: "effect.transmute(read.cell('manor', 12, 8), { heat: 1 });", name: "a warm cell" } as never);
    expect(calls.map((c) => c.method)).toEqual(["snapshot", "commit"]);
    expect((calls[0]!.args[0] as { fork: boolean }).fork).toBe(false);
    expect(programs[0]).toContain("__makeWorld");
    expect(programs[0]).toContain("effect.transmute(read.cell('manor', 12, 8)");
    const commit = calls[1]!.args[0] as { spellId: string; name: string; result: { effects: unknown[] } };
    expect(commit.spellId).toBe("s1");
    expect(commit.result.effects.length).toBe(1);
  });

  it("renders wakes and cell tables legibly", () => {
    const text = wakeContent({ kind: "verse", spellId: "s1", apprentice: "ada", apprenticeName: "Ada", verse: "Small fire, wake", room: "circle", briefing: "sky: dawn", firstHourStep: 1, scripted: "hearth" });
    expect(text).toContain("<verse-wake");
    expect(text).toContain('scripted="hearth"');
    const state = generateEstate("agent-test");
    const table = cellsTable({ region: state.regions.manor, entities: [], wards: [], sky: state.sky }, { x: 10, y: 6, w: 4, h: 4 }, ["heat", "species"]);
    expect(table).toContain("heat:");
    expect(table).toContain("species:");
  });
});
