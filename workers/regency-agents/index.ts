/**
 * RegencyAgentWorker — one worker class, many seats.
 *
 * A subclass of the default chat agent that adds the game tools and a
 * per-seat persona. The seat (role, realm, game key) arrives in the channel
 * subscription config when the Regency panel adds the agent to a channel.
 * The game itself lives in `workers/regency-realm`; every tool here is a thin
 * RPC to that Durable Object, which enforces portfolios, mandates and the
 * identity of the calling agent.
 */
import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import type { ParticipantDescriptor } from "@workspace/harness";
import type { AgentTool } from "@workspace/pi-core";
import { createDurableObjectServiceClient, rpc } from "@workspace/runtime/worker/kernel";
import { buildPrompt, defaultHandle, defaultName, type RegencyAgentConfig } from "./prompts.js";

export const REGENCY_PROTOCOL = "examples.regency.v1";
export const REGENCY_DECIDE_METHOD = "regency.decide";

function asConfig(config: unknown): RegencyAgentConfig | null {
  if (!config || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;
  if (typeof c["role"] !== "string" || typeof c["realm"] !== "string" || typeof c["gameKey"] !== "string") return null;
  return {
    role: c["role"],
    realm: c["realm"],
    gameKey: c["gameKey"],
    realmName: typeof c["realmName"] === "string" ? c["realmName"] : c["realm"],
    handle: typeof c["handle"] === "string" ? c["handle"] : undefined,
    name: typeof c["name"] === "string" ? c["name"] : undefined,
    character: typeof c["character"] === "string" ? c["character"] : undefined,
    regencyName: typeof c["regencyName"] === "string" ? c["regencyName"] : undefined,
    persona: typeof c["persona"] === "string" ? c["persona"] : undefined,
    directory: Array.isArray(c["directory"]) ? (c["directory"] as RegencyAgentConfig["directory"]) : undefined,
    person: c["person"] && typeof c["person"] === "object" ? (c["person"] as RegencyAgentConfig["person"]) : undefined,
  };
}

function text(value: unknown): { content: Array<{ type: "text"; text: string }>; details: unknown } {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: body }], details: value };
}

export type Caller = { call(method: string, ...args: unknown[]): Promise<unknown> };

export class RegencyAgentWorker extends AiChatWorker {
  static override schemaVersion = AiChatWorker.schemaVersion;

  constructor(ctx: ConstructorParameters<typeof AiChatWorker>[0], env: unknown) {
    super(ctx, env);
    void this.setOwnTitle("Regency Agent");
  }

  protected seat(channelId: string): RegencyAgentConfig | null {
    return asConfig(this.subscriptions.getConfig(channelId));
  }

  protected override getParticipantInfo(channelId: string, config?: unknown): ParticipantDescriptor {
    const base = super.getParticipantInfo(channelId, config);
    const cfg = asConfig(config) ?? this.seat(channelId);
    if (!cfg) return base;
    const kind = cfg.role.split(":")[0]!;
    const methods = [...(base.methods ?? [])];
    if (kind === "herald" || kind === "protector") {
      methods.push({
        name: REGENCY_DECIDE_METHOD,
        description: "Carry a decision from a chat card to the game: seal or veto an order, or decide a matter of state. Only the Regent's panel cards call this.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["seal", "crisis"] },
            orderId: { type: "string" },
            decision: { type: "string", enum: ["seal", "veto"] },
            crisisId: { type: "string" },
            optionId: { type: "string" },
            note: { type: "string" },
          },
          required: ["kind"],
        },
      });
    }
    return { ...base, handle: cfg.handle ?? defaultHandle(cfg.role), name: cfg.name ?? defaultName(cfg.role, cfg.realmName), methods };
  }

  /**
   * Chat cards (seal and matter cards published by the Regency panel) call
   * this participant method; it forwards the decision to the game as this
   * seat, so the game's identity checks still apply.
   */
  protected override async handleStandardAgentMethodCall(channelId: string, methodName: string, args: unknown, signal?: AbortSignal): Promise<{ result: unknown; isError?: boolean } | null> {
    if (methodName !== REGENCY_DECIDE_METHOD) return super.handleStandardAgentMethodCall(channelId, methodName, args, signal);
    const cfg = this.seat(channelId);
    if (!cfg) return { result: { error: "no seat in this channel" }, isError: true };
    const a = (args ?? {}) as Record<string, unknown>;
    const client = createDurableObjectServiceClient(this.rpc, REGENCY_PROTOCOL, cfg.gameKey);
    try {
      if (a["kind"] === "seal") {
        const result = await client.call("sealOrder", { orderId: String(a["orderId"] ?? ""), decision: a["decision"] === "veto" ? "veto" : "seal", note: typeof a["note"] === "string" ? a["note"] : undefined });
        return { result };
      }
      if (a["kind"] === "crisis") {
        const result = await client.call("decideCrisis", { crisisId: String(a["crisisId"] ?? ""), optionId: String(a["optionId"] ?? ""), note: typeof a["note"] === "string" ? a["note"] : undefined });
        return { result };
      }
      return { result: { error: "kind must be seal or crisis" }, isError: true };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, isError: true };
    }
  }

  protected override getAgentPrompt(channelId: string): string | undefined {
    const cfg = this.seat(channelId);
    return cfg ? buildPrompt(cfg) : super.getAgentPrompt(channelId);
  }

  protected override async getLoopTools(channelId: string, execution?: AgentToolExecutionContext): Promise<AgentTool[]> {
    const tools = await super.getLoopTools(channelId, execution);
    const cfg = this.seat(channelId);
    if (!cfg) return tools;
    const client = createDurableObjectServiceClient(execution?.rpc ?? this.rpc, REGENCY_PROTOCOL, cfg.gameKey);
    return [...tools, ...this.createGameTools(cfg, client)];
  }

  /**
   * The game DO wakes this seat with a season briefing. It is delivered as an
   * agent-initiated turn keyed by `steeringId`, so a redelivery is a no-op.
   */
  @rpc({ principals: ["host", "user", "code"], effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async receiveBriefing(input: { channelId: string; content: string; steeringId: string }): Promise<{ ok: true }> {
    if (!this.subscriptions.getParticipantId(input.channelId)) throw new Error(`Not seated in channel ${input.channelId}`);
    await this.submitAgentInitiatedTurn(input.channelId, { content: input.content }, { steeringId: input.steeringId, origin: "regency-briefing" });
    return { ok: true };
  }

  createGameTools(cfg: RegencyAgentConfig, client: Caller): AgentTool[] {
    const kind = cfg.role.split(":")[0]!;
    const tools: AgentTool[] = [];
    const read = (name: string, description: string, params: Record<string, unknown>, run: (p: Record<string, unknown>) => Promise<unknown>): AgentTool =>
      ({
        name,
        label: name,
        description,
        parameters: { type: "object", properties: params, additionalProperties: false } as never,
        execute: async (_id, params) => {
          try {
            return text(await run((params ?? {}) as Record<string, unknown>));
          } catch (err) {
            return { ...text(`Error: ${err instanceof Error ? err.message : String(err)}`), isError: true };
          }
        },
      }) as AgentTool;

    tools.push(read("realm_report", `Full report on ${cfg.realmName}: treasury and ledger, laws, provinces with ids, armies with ids and legal marches, diplomacy, pending proposals.`, {}, () => client.call("report", { kind: "realm", realm: cfg.realm })));
    tools.push(read("province_report", "Details of one province by id (e.g. p7): terrain, people, buildings, armies, neighbours.", { province: { type: "string" } }, (p) => client.call("report", { kind: "province", province: String(p["province"] ?? "") })));
    tools.push(read("map_overview", "Every realm, its size, strength and prestige; wars, treaties and free provinces.", {}, () => client.call("report", { kind: "map" })));
    tools.push(read("chronicle", "Recent events of the world as they concern your realm.", { limit: { type: "integer", minimum: 1, maximum: 200 } }, (p) => client.call("report", { kind: "chronicle", realm: cfg.realm, limit: Number(p["limit"] ?? 40) })));
    tools.push(read("game_rules", "The rules of Regency: order kinds and their fields, the edict grammar, treaties, economy, victory.", {}, () => client.call("report", { kind: "rules" })));
    tools.push(read("list_orders", "The order book for the current season: what has been submitted, what awaits the Regent's seal, what was rejected and why.", {}, () => client.call("listOrders", {})));
    tools.push(read("forecast_orders", `What-if: resolve a copy of this season with the pending orders plus the hypothetical orders you pass (for ${cfg.realmName}), and optionally orders still awaiting the seal by id. Returns treasury, legitimacy, estates, provinces, wars and the notable events. Rival courts are assumed to follow the steward policy.`, {
      orders: { type: "array", items: { type: "object", additionalProperties: true }, description: "Hypothetical orders, same shape as submit_order." },
      includeOrderIds: { type: "array", items: { type: "string" }, description: "Ids of orders awaiting the seal to include as if sealed." },
    }, (p) => client.call("forecast", { orders: Array.isArray(p["orders"]) ? p["orders"] : [], includeOrderIds: Array.isArray(p["includeOrderIds"]) ? p["includeOrderIds"] : [], realm: cfg.realm })));

    if (kind !== "herald" && kind !== "protector") {
      tools.push(read("submit_order", `Submit one order for ${cfg.realmName} as the ${kind}. The order object must have a "kind" and that kind's fields (see game_rules). Portfolios are enforced: the engine tells you if your seat may not issue it, if it is illegal, or if it awaits the Regent's seal.`, {
        order: { type: "object", description: "e.g. {\"kind\":\"build\",\"province\":\"p3\",\"building\":\"farm\"}", additionalProperties: true },
        rationale: { type: "string", description: "One sentence for the chronicle and the Regent." },
      }, (p) => client.call("submitOrder", { realm: cfg.realm, actor: cfg.role, order: p["order"], rationale: typeof p["rationale"] === "string" ? p["rationale"] : undefined })));
      tools.push(read("withdraw_order", "Withdraw one of your own pending orders by id.", { orderId: { type: "string" } }, (p) => client.call("withdrawOrder", { orderId: String(p["orderId"] ?? ""), actor: cfg.role })));
    }
    if (kind === "sovereign") {
      tools.push(read("end_turn", `Declare that ${cfg.realmName} has no further orders this season. Call it last.`, {}, () => client.call("endTurn", { realm: cfg.realm, actor: cfg.role })));
      tools.push(read("write_doctrine", "Write or revise your standing doctrine (three to six sentences): what worked, what did not, what you will do next. It is fed back to you every season.", { text: { type: "string" } }, (p) => client.call("writeDoctrine", { actor: cfg.role, text: String(p["text"] ?? "") })));
      tools.push(read("read_doctrine", "Read your current doctrine.", {}, () => client.call("readDoctrine", { actor: cfg.role })));
      tools.push(read("offer_bribe", "Set gold before one of the Regent's ministers (chancellor, treasurer, marshal or envoy) with a discreet note. If accepted, the Regent's order book reaches you every season for a year and the gold leaves your treasury; if reported, you lose regard and gain infamy.", {
        targetRole: { type: "string", enum: ["chancellor", "treasurer", "marshal", "envoy"] },
        gold: { type: "number", minimum: 10, maximum: 200 },
        note: { type: "string" },
      }, (p) => client.call("offerBribe", { actor: cfg.role, targetRole: String(p["targetRole"] ?? ""), gold: Number(p["gold"] ?? 0), note: String(p["note"] ?? "") })));
    }
    if (["chancellor", "treasurer", "marshal", "envoy"].includes(kind)) {
      tools.push(read("my_temptations", "Offers of gold made to you in private by foreign sovereigns, if any.", {}, () => client.call("myTemptations", { actor: cfg.role })));
      tools.push(read("respond_bribe", "Accept an offer (your standing rises, the briber reads the Regent's order book for a year, and nothing is written where the Regent can see it) or report it (the Regent learns of it; your standing and the Regent's reputation rise; the briber loses regard).", {
        bribeId: { type: "string" },
        decision: { type: "string", enum: ["accept", "report"] },
        note: { type: "string" },
      }, (p) => client.call("respondBribe", { actor: cfg.role, bribeId: String(p["bribeId"] ?? ""), decision: p["decision"] === "accept" ? "accept" : "report", note: typeof p["note"] === "string" ? p["note"] : undefined })));
    }
    if (kind === "ambassador") {
      tools.push(read("write_dossier", "Replace your dossier on the Regent: promises made and kept or broken, what they want, what they fear, how they treat your sovereign. Keep it under a page.", { text: { type: "string" } }, (p) => client.call("writeDossier", { actor: cfg.role, text: String(p["text"] ?? "") })));
      tools.push(read("read_dossier", "Read your dossier on the Regent.", {}, () => client.call("readDossier", { actor: cfg.role })));
    }
    if (kind === "herald" || kind === "protector") {
      tools.push(read("pending_matters", "Matters of state awaiting a decision, with their options and consequences.", {}, async () => {
        const world = (await client.call("getWorld")) as { crises?: Array<{ chosen: string | null }> } | null;
        const pending = (world?.crises ?? []).filter((c) => c.chosen === null);
        return pending.length ? pending : "No matters await a decision.";
      }));
      tools.push(read("decide_crisis", kind === "herald" ? "Carry out the Regent's explicit choice on a named matter of state. Only when the Regent has said which option, naming the matter." : "Decide a matter of state within your mandate.", {
        crisisId: { type: "string" },
        optionId: { type: "string" },
        note: { type: "string" },
      }, (p) => client.call("decideCrisis", { crisisId: String(p["crisisId"] ?? ""), optionId: String(p["optionId"] ?? ""), note: typeof p["note"] === "string" ? p["note"] : undefined })));
    }
    if (kind === "herald" || kind === "protector") {
      tools.push(read("seal_order", kind === "herald" ? "Carry out the Regent's explicit spoken decision on an order awaiting the seal. Only when the Regent has said so, naming the order." : "Seal or veto an order awaiting the seal, within your mandate.", {
        orderId: { type: "string" },
        decision: { type: "string", enum: ["seal", "veto"] },
        note: { type: "string" },
      }, (p) => client.call("sealOrder", { orderId: String(p["orderId"] ?? ""), decision: p["decision"] === "veto" ? "veto" : "seal", note: typeof p["note"] === "string" ? p["note"] : undefined })));
      tools.push(read("close_season", kind === "herald" ? "Close the court for this season on the Regent's explicit word. Resolves at once if every sovereign has ended its turn, otherwise reports who is still deliberating." : "Close the court for this season, if your mandate allows.", {}, () => client.call("closeSeason")));
    }
    if (kind === "protector") {
      tools.push(read("submit_order", `Issue an order in the Regent's stead, within the mandate.`, { order: { type: "object", additionalProperties: true }, rationale: { type: "string" } }, (p) => client.call("submitOrder", { realm: cfg.realm, actor: "protector", order: p["order"], rationale: typeof p["rationale"] === "string" ? p["rationale"] : undefined })));
    }
    return tools;
  }
}

export default {
  fetch(_req: Request) {
    return new Response("Regency agent worker: ministers, sovereigns and ambassadors for the Regency example.");
  },
};
