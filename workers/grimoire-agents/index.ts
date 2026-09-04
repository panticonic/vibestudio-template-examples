/**
 * GrimoireAgentWorker — one worker class, every voice on the estate.
 *
 * A subclass of the default chat agent. The seat (familiar for an
 * apprentice, a spirit, the Moor, a chartered golem) arrives in the channel
 * subscription config when the Grimoire panel adds the agent to a channel.
 * The world itself lives in `workers/grimoire-world`; every tool here is a
 * thin RPC to that Durable Object, which enforces the spell record and the
 * identity of the calling seat.
 *
 * Execution model: the familiar runs its writing in ITS OWN eval sandbox
 * (the agent's EvalDO, reached through the `eval` service) against a
 * snapshot fetched from the world, then submits the run result with
 * `rehearse` or `commit`. Spirits and golems use the same path for `act`.
 * The world validates every effect at commit, so nothing here is trusted.
 */
import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import type { ParticipantDescriptor } from "@workspace/harness";
import type { AgentTool } from "@workspace/pi-core";
import { installMessageTypes } from "@workspace/agentic-do";
import {
  createDurableObjectServiceClient,
  rpc,
} from "@workspace/runtime/worker/kernel";
import { createEvalExecutor } from "@vibestudio/service-schemas/eval";
import {
  composeProgram,
  GRIMOIRE_CARD_IMPORTS,
  GRIMOIRE_CARD_KEY_PREFIX,
  GRIMOIRE_CARD_SPECS,
  GRIMOIRE_CARD_UI_VERSION,
  GRIMOIRE_PROTOCOL,
  type GrimoireCardOp,
  type AgentSeatConfig,
  type Intent,
  type MisfireKind,
  type RegionView,
  type RejectReason,
  type RunResult,
  type Snapshot,
  type SpiritId,
  type Trigger,
  type Wake,
} from "@workspace/grimoire-engine";
import { buildPrompt, defaultHandle, defaultName } from "./prompts.js";

function asSeat(config: unknown): AgentSeatConfig | null {
  if (!config || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;
  if (typeof c["role"] !== "string" || typeof c["estateKey"] !== "string")
    return null;
  return {
    role: c["role"] as AgentSeatConfig["role"],
    estateKey: c["estateKey"] as string,
    apprentice:
      typeof c["apprentice"] === "string" ? c["apprentice"] : undefined,
    apprenticeName:
      typeof c["apprenticeName"] === "string" ? c["apprenticeName"] : undefined,
    room:
      c["room"] === "study"
        ? "study"
        : c["room"] === "circle"
          ? "circle"
          : undefined,
    handle: typeof c["handle"] === "string" ? c["handle"] : undefined,
    name: typeof c["name"] === "string" ? c["name"] : undefined,
    directory: Array.isArray(c["directory"])
      ? (c["directory"] as AgentSeatConfig["directory"])
      : undefined,
  };
}

function text(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
} {
  const body =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: body }], details: value };
}

export type Caller = {
  call(method: string, ...args: unknown[]): Promise<unknown>;
};
export type Executor = (program: string) => Promise<RunResult>;

/** Render a wake as the turn content the model sees. */
export function wakeContent(wake: Wake): string {
  switch (wake.kind) {
    case "verse":
      return [
        `<verse-wake spellId="${wake.spellId}" apprentice="${wake.apprentice}" room="${wake.room}"${wake.firstHourStep !== null ? ` firstHourStep="${wake.firstHourStep}"` : ""}${wake.scripted ? ` scripted="${wake.scripted}"` : ""}>`,
        `${wake.apprenticeName} spoke in the ${wake.room}:`,
        "",
        wake.verse,
        "",
        "Briefing:",
        wake.briefing,
        "",
        "Carry it: hear → look → (write, rehearse) → cast | misfire | reject. Then one line in the circle.",
        "</verse-wake>",
      ].join("\n");
    case "study":
      return `<study-wake apprentice="${wake.apprentice}">\n${wake.apprenticeName} came to the study.\n\n${wake.text}\n\nBriefing:\n${wake.briefing}\n</study-wake>`;
    case "story":
      return `<story-wake apprentice="${wake.apprentice}" storyId="${wake.storyId}">\nIt is the bell hour. Tell ${wake.apprenticeName} the story "${wake.storyId}" (read it with read_story), in your own words, then one line about the valley tonight.\n\nBriefing:\n${wake.briefing}\n</story-wake>`;
    case "spirit":
      return `<spirit-wake spirit="${wake.spirit}"${wake.utteranceId ? ` utteranceId="${wake.utteranceId}"` : ""}${wake.hall ? ` hall="${wake.hall.channelId}"` : ""}>\n${wake.why}${wake.hall ? `\n\nThe hall: you are convened with ${wake.hall.with.map((w) => `${w.title} (notify ref \`${w.ref}\`)`).join(" and ")} about "${wake.hall.topic}". This conversation IS the hall; speak here with \`say\` or plain text so the household may read it, and address the others by name. Reply to what they say; stop when the exchange produces nothing new.` : ""}\n\nBriefing:\n${wake.briefing}\n</spirit-wake>`;
    case "golem":
      return `<golem-wake golem="${wake.golem}">\nYour charter:\n${wake.charter}\n\nBriefing:\n${wake.briefing}\n</golem-wake>`;
  }
}

/** Format a region view as a compact table of one layer over a rect, for `read_cells`. */
export function cellsTable(
  view: RegionView,
  rect: { x: number; y: number; w: number; h: number },
  layers: string[],
): string {
  const r = view.region;
  const x0 = Math.max(0, rect.x),
    y0 = Math.max(0, rect.y);
  const x1 = Math.min(r.w, rect.x + Math.min(rect.w, 24)),
    y1 = Math.min(r.h, rect.y + Math.min(rect.h, 24));
  const out: string[] = [
    `${r.name} (${r.id}) ${r.w}×${r.h}; rect x${x0}..${x1 - 1} y${y0}..${y1 - 1}`,
  ];
  for (const layer of layers) {
    const arr =
      (r.layers as Record<string, number[]>)[layer] ??
      (layer === "elevation" ? r.elevation : layer === "ley" ? r.ley : null);
    if (!arr) {
      out.push(`(no layer ${layer})`);
      continue;
    }
    out.push(`${layer}:`);
    for (let y = y0; y < y1; y++) {
      const row: string[] = [];
      for (let x = x0; x < x1; x++)
        row.push(String(arr[y * r.w + x] ?? 0).padStart(2));
      out.push(`  y${String(y).padStart(2)} ${row.join(" ")}`);
    }
  }
  if (layers.includes("species")) {
    out.push("species:");
    for (let y = y0; y < y1; y++) {
      const row: string[] = [];
      for (let x = x0; x < x1; x++)
        row.push((r.species[y * r.w + x] || "·").slice(0, 2).padStart(2));
      out.push(`  y${String(y).padStart(2)} ${row.join(" ")}`);
    }
  }
  const ents = view.entities.filter(
    (e) => e.x >= x0 && e.x < x1 && e.y >= y0 && e.y < y1,
  );
  if (ents.length)
    out.push(
      `entities: ${ents.map((e) => `${e.name}(${e.sub}@${e.x},${e.y})`).join(", ")}`,
    );
  if (view.wards.length)
    out.push(
      `wards: ${view.wards.map((w) => `${w.name ?? w.id}${w.stale ? " (stale)" : ""} by ${w.caster}`).join("; ")}`,
    );
  return out.join("\n");
}

export class GrimoireAgentWorker extends AiChatWorker {
  static override schemaVersion = AiChatWorker.schemaVersion;

  constructor(
    ctx: ConstructorParameters<typeof AiChatWorker>[0],
    env: unknown,
  ) {
    super(ctx, env);
    void this.setOwnTitle("Grimoire");
  }

  protected seat(channelId: string): AgentSeatConfig | null {
    return asSeat(this.subscriptions.getConfig(channelId));
  }

  protected override getParticipantInfo(
    channelId: string,
    config?: unknown,
  ): ParticipantDescriptor {
    const base = super.getParticipantInfo(channelId, config);
    const cfg = asSeat(config) ?? this.seat(channelId);
    if (!cfg) return base;
    const methods = [...(base.methods ?? [])];
    if (cfg.role === "familiar" && cfg.apprentice) {
      methods.push({
        name: "grimoire_command",
        description:
          "Carry one explicit, replay-protected apprentice command from a Grimoire card.",
        parameters: {
          type: "object",
          required: ["commandId", "kind", "payload"],
          properties: {
            commandId: { type: "string" },
            kind: {
              type: "string",
              enum: ["speak", "recast", "release", "shelve"],
            },
            payload: { type: "object", additionalProperties: true },
          },
          additionalProperties: false,
        },
      });
    }
    return {
      ...base,
      handle:
        cfg.handle ??
        defaultHandle(cfg.role + (cfg.room ? `-${cfg.room}` : "")),
      name: cfg.name ?? defaultName(cfg),
      methods,
    };
  }

  protected override async handleStandardAgentMethodCall(
    channelId: string,
    methodName: string,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<{ result: unknown; isError?: boolean } | null> {
    if (methodName !== "grimoire_command")
      return super.handleStandardAgentMethodCall(
        channelId,
        methodName,
        args,
        signal,
      );
    const cfg = this.seat(channelId);
    if (!cfg || cfg.role !== "familiar" || !cfg.apprentice)
      return {
        result: {
          error: "Only a registered familiar can carry an apprentice command.",
        },
        isError: true,
      };
    const input = (args ?? {}) as Record<string, unknown>;
    const payload =
      input["payload"] && typeof input["payload"] === "object"
        ? (input["payload"] as Record<string, unknown>)
        : {};
    const commandId =
      typeof input["commandId"] === "string" ? input["commandId"] : "";
    const kind = input["kind"];
    if (!commandId)
      return { result: { error: "commandId is required" }, isError: true };
    const client = createDurableObjectServiceClient(
      this.rpc,
      GRIMOIRE_PROTOCOL,
      cfg.estateKey,
    );
    try {
      let result: unknown;
      if (kind === "speak") {
        const focus =
          payload["focus"] && typeof payload["focus"] === "object"
            ? (payload["focus"] as Record<string, unknown>)
            : null;
        result = await client.call("speak", {
          commandId,
          apprentice: cfg.apprentice,
          verse: String(payload["verse"] ?? ""),
          room: cfg.room ?? "circle",
          ...(focus?.["region"] &&
          Number.isInteger(focus["x"]) &&
          Number.isInteger(focus["y"])
            ? {
                focusCell: {
                  region: focus["region"],
                  x: focus["x"],
                  y: focus["y"],
                },
              }
            : {}),
        });
      } else if (kind === "recast")
        result = await client.call("recast", {
          commandId,
          apprentice: cfg.apprentice,
          spellId: String(payload["spellId"] ?? ""),
          substitutions: payload["substitutions"],
        });
      else if (kind === "release")
        result = await client.call("release", {
          commandId,
          apprentice: cfg.apprentice,
          spellId: String(payload["spellId"] ?? ""),
        });
      else if (kind === "shelve")
        result = await client.call("shelve", {
          commandId,
          apprentice: cfg.apprentice,
          spellId: String(payload["spellId"] ?? ""),
          shelved: payload["shelved"] === true,
        });
      else
        return {
          result: { error: "Unknown Grimoire command." },
          isError: true,
        };
      const cards = await client.call("pendingCards", {
        apprentice: cfg.apprentice,
      });
      await this.publishCards({ channelId, cards: cards as GrimoireCardOp[] });
      return { result };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        isError: true,
      };
    }
  }

  protected override getAgentPrompt(channelId: string): string | undefined {
    const cfg = this.seat(channelId);
    return cfg ? buildPrompt(cfg) : super.getAgentPrompt(channelId);
  }

  protected override async getLoopTools(
    channelId: string,
    execution?: AgentToolExecutionContext,
  ): Promise<AgentTool[]> {
    const tools = await super.getLoopTools(channelId, execution);
    const cfg = this.seat(channelId);
    if (!cfg) return tools;
    const rpcClient = execution?.rpc ?? this.rpc;
    const client = createDurableObjectServiceClient(
      rpcClient,
      GRIMOIRE_PROTOCOL,
      cfg.estateKey,
    );
    const executor = this.makeExecutor(rpcClient);
    return [...tools, ...this.createGameTools(cfg, client, executor)];
  }

  /** The seat's own eval sandbox, through the eval service (owner = this agent). */
  protected makeExecutor(rpcClient: {
    call<T>(target: string, method: string, args: unknown[]): Promise<T>;
  }): Executor {
    const run = createEvalExecutor(<T>(method: string, args: unknown[]) =>
      rpcClient.call<T>("main", method, args),
    );
    return async (program: string) => {
      const result = await run({
        runId: `grimoire:${crypto.randomUUID()}`,
        source: { kind: "inline", code: program, syntax: "javascript" },
      });
      if (!result.success) {
        return {
          ok: false,
          effects: [],
          log: result.console ? [result.console] : [],
          error: result.error ?? "the writing failed",
          touched: 0,
          ether: 0,
          memory: {},
        };
      }
      const value = result.returnValue as Partial<RunResult> | undefined;
      if (
        !value ||
        typeof value !== "object" ||
        !Array.isArray(value.effects)
      ) {
        return {
          ok: false,
          effects: [],
          log: result.console ? [result.console] : [],
          error: "the writing returned nothing the world can read",
          touched: 0,
          ether: 0,
          memory: {},
        };
      }
      return {
        ok: value.ok !== false,
        effects: value.effects,
        log: [
          ...(value.log ?? []),
          ...(result.console ? [result.console] : []),
        ],
        error: value.error,
        returnValue: value.returnValue,
        touched: value.touched ?? 0,
        ether: value.ether ?? 0,
        memory: value.memory ?? {},
      };
    };
  }

  /** The world wakes a seat. Keyed by `steeringId`, so a redelivery is a no-op. */
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async receiveWake(input: {
    channelId: string;
    wake: Wake;
    steeringId: string;
  }): Promise<{ ok: true }> {
    if (!this.subscriptions.getParticipantId(input.channelId))
      throw new Error(`Not seated in channel ${input.channelId}`);
    await this.submitAgentInitiatedTurn(
      input.channelId,
      { content: wakeContent(input.wake) },
      { steeringId: input.steeringId, origin: "agent-initiated" },
    );
    const cfg = this.seat(input.channelId);
    if (cfg?.role === "familiar" && cfg.apprentice) {
      const client = createDurableObjectServiceClient(
        this.rpc,
        GRIMOIRE_PROTOCOL,
        cfg.estateKey,
      );
      const cards = await client.call("pendingCards", {
        apprentice: cfg.apprentice,
      });
      await this.publishCards({
        channelId: input.channelId,
        cards: cards as GrimoireCardOp[],
      });
    }
    return { ok: true };
  }

  private installedCardTypes = new Set<string>();

  @rpc({
    principals: ["user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async publishCards(input: {
    channelId: string;
    cards: GrimoireCardOp[];
  }): Promise<{ published: number }> {
    if (!this.subscriptions.getParticipantId(input.channelId))
      throw new Error(`Not seated in channel ${input.channelId}`);
    if (!this.installedCardTypes.has(input.channelId)) {
      await installMessageTypes({
        channel: this.createChannelClient(input.channelId),
        actor: {
          kind: "agent",
          id: this.participantId(),
          participantId: this.participantId(),
        },
        specs: GRIMOIRE_CARD_SPECS,
        imports: GRIMOIRE_CARD_IMPORTS,
        version: GRIMOIRE_CARD_UI_VERSION,
        keyPrefix: GRIMOIRE_CARD_KEY_PREFIX,
        cards: this.cards,
        channelId: input.channelId,
        readFile: async (path) => {
          try {
            const raw = await this.rpc.call<unknown>("main", "fs.readFile", [
              path,
              "utf8",
            ]);
            return typeof raw === "string" ? raw : null;
          } catch {
            return null;
          }
        },
      });
      this.installedCardTypes.add(input.channelId);
    }
    for (const card of input.cards) {
      const existing = this.cards.find(input.channelId, card.key);
      if (existing) await existing.update(card.state);
      else
        await this.cards.getOrCreate(
          input.channelId,
          card.typeId,
          card.key,
          card.state,
          { displayMode: card.displayMode },
        );
    }
    return { published: input.cards.length };
  }

  createGameTools(
    cfg: AgentSeatConfig,
    client: Caller,
    executor: Executor,
  ): AgentTool[] {
    const tools: AgentTool[] = [];
    const tool = (
      name: string,
      description: string,
      params: Record<string, unknown>,
      run: (p: Record<string, unknown>) => Promise<unknown>,
      required: string[] = [],
    ): AgentTool =>
      ({
        name,
        label: name,
        description,
        parameters: {
          type: "object",
          properties: params,
          required,
          additionalProperties: false,
        } as never,
        execute: async (_id, params) => {
          try {
            return text(await run((params ?? {}) as Record<string, unknown>));
          } catch (err) {
            return {
              ...text(
                `Error: ${err instanceof Error ? err.message : String(err)}`,
              ),
              isError: true,
            };
          }
        },
      }) as AgentTool;

    const str = (p: Record<string, unknown>, k: string, d = ""): string =>
      typeof p[k] === "string" ? (p[k] as string) : d;

    /** Fetch a snapshot, compose the program and run it in this seat's sandbox. */
    const runSource = async (
      spellId: string,
      source: string,
      fork: boolean,
      regions?: string[],
    ): Promise<{ result: RunResult; snapshot: Snapshot }> => {
      const snapshot = (await client.call("snapshot", {
        spellId,
        fork,
        ...(regions ? { regions } : {}),
      })) as Snapshot;
      const program = composeProgram(source, snapshot);
      const result = await executor(program);
      return { result, snapshot };
    };

    const scryTool = tool(
      "scry",
      "Scry a spell (by id), a cell, an entity (by name) or a spirit: what it did, who did it, what was heard, the writing under the words. Deep scries of others' spells are budgeted per bell hour.",
      {
        kind: { type: "string", enum: ["spell", "cell", "entity", "spirit"] },
        ref: {
          type: "string",
          description:
            "spell id, entity true name, spirit id, or region id for a cell",
        },
        region: { type: "string" },
        x: { type: "integer" },
        y: { type: "integer" },
      },
      (p) =>
        client.call("scry", {
          apprentice: cfg.apprentice ?? cfg.role,
          kind: str(p, "kind", "spell"),
          ref: str(p, "ref"),
          ...(typeof p["region"] === "string" ? { region: p["region"] } : {}),
          ...(Number.isInteger(p["x"]) ? { x: p["x"] } : {}),
          ...(Number.isInteger(p["y"]) ? { y: p["y"] } : {}),
        }),
      ["kind", "ref"],
    );

    const readCells = tool(
      "read_cells",
      "A compact table of one or more layers over a rect of a region (≤ 24×24): heat, water, stone, growth, air, light, rot, ether, steam, silt, ash, frost, spore, silver, glass, elevation, ley, species. Entities and wards in the rect are listed.",
      {
        region: { type: "string" },
        x: { type: "integer" },
        y: { type: "integer" },
        w: { type: "integer" },
        h: { type: "integer" },
        layers: { type: "array", items: { type: "string" } },
      },
      async (p) => {
        const view = (await client.call("region", {
          id: str(p, "region"),
        })) as RegionView;
        const layers =
          Array.isArray(p["layers"]) && p["layers"].length
            ? (p["layers"] as string[])
            : ["water", "heat", "growth", "rot", "light"];
        return cellsTable(
          view,
          {
            x: Number(p["x"] ?? 0),
            y: Number(p["y"] ?? 0),
            w: Number(p["w"] ?? 16),
            h: Number(p["h"] ?? 16),
          },
          layers,
        );
      },
      ["region"],
    );

    if (cfg.role === "familiar") {
      const apprentice = cfg.apprentice ?? "";
      tools.push(
        tool(
          "hear",
          "Stage 1. The intent record: what you heard the verse mean, before any writing. The world checks it against the spell record and tells you what the verse did not earn.",
          {
            spellId: { type: "string" },
            intent: {
              type: "object",
              additionalProperties: true,
              description:
                "{ subject: { kind: cells|entity|spirit|spell|sky|self, ref, region?, rect? }, effect, quantity?: { concept, value }, binding?: { kind: once|while|until|whenever|at, condition }, concepts: [{ concept, confidence, fromWord }], unsure: [], tier }",
            },
          },
          (p) =>
            client.call("hear", {
              spellId: str(p, "spellId"),
              intent: p["intent"] as Intent,
            }),
          ["spellId", "intent"],
        ),
      );
      tools.push(
        tool(
          "look",
          "Stage 2. A compact reading of the world for a spell: the apprentice's whereabouts, the sky, the subject region in numbers, the reserve, words and names, active spells, your recent margin notes.",
          {
            spellId: { type: "string" },
          },
          (p) =>
            client.call("briefing", {
              apprentice,
              ...(typeof p["spellId"] === "string"
                ? { spellId: p["spellId"] }
                : {}),
            }),
        ),
      );
      tools.push(readCells);
      tools.push(
        tool(
          "rehearse",
          "Stage 3. Run the writing on a fork of the world in your own sandbox; nothing commits. Returns what would change, what it costs, the log and any error. Required before casting a ward, automaton, working or ritual.",
          {
            spellId: { type: "string" },
            source: {
              type: "string",
              description:
                "The writing: JavaScript against the binding (world/read/effect/time/on/voice/bind/against in scope; top-level await allowed).",
            },
            regions: {
              type: "array",
              items: { type: "string" },
              description:
                "Regions to include in the snapshot beyond the subject's (optional).",
            },
          },
          async (p) => {
            const spellId = str(p, "spellId");
            const source = str(p, "source");
            const { result } = await runSource(
              spellId,
              source,
              true,
              Array.isArray(p["regions"])
                ? (p["regions"] as string[])
                : undefined,
            );
            const out = (await client.call("rehearse", {
              spellId,
              source,
              result,
            })) as {
              rehearsal: {
                summary: string;
                log: string[];
                error?: string;
                ether: number;
                touched: number;
              };
            };
            return {
              ok: result.ok,
              summary: out.rehearsal.summary,
              ether: out.rehearsal.ether,
              touched: out.rehearsal.touched,
              effects: result.effects.length,
              log: result.log.slice(-20),
              error: result.error ?? out.rehearsal.error,
              returnValue: result.returnValue,
            };
          },
          ["spellId", "source"],
        ),
      );
      tools.push(
        tool(
          "cast",
          "Stage 4. Run the final writing in your own sandbox against the live world and commit the result. The world validates every effect against the spell record, the tier's ceiling and the ether. For persistent tiers pass `persistent` with the trigger; the world stores the source and re-runs it.",
          {
            spellId: { type: "string" },
            source: { type: "string" },
            name: {
              type: "string",
              description: "Two to four words for the spellbook.",
            },
            gloss: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "line number → plain meaning",
            },
            margin: { type: "string", description: "One line in your hand." },
            ancestry: {
              type: "array",
              items: { type: "string" },
              description: "Idiom ids or spell ids the writing drew on.",
            },
            persistent: {
              type: "object",
              additionalProperties: true,
              description:
                "{ kind: ward|automaton|charter|working|ritual, trigger?: Trigger, golem?: string }",
            },
          },
          async (p) => {
            const spellId = str(p, "spellId");
            const source = str(p, "source");
            const persistent = p["persistent"] as
              | {
                  kind: "ward" | "automaton" | "charter" | "working" | "ritual";
                  trigger?: Trigger;
                  golem?: string;
                }
              | undefined;
            const { result } = await runSource(spellId, source, false);
            return client.call("commit", {
              spellId,
              source,
              result,
              name: str(p, "name") || undefined,
              gloss: (p["gloss"] as Record<string, string>) ?? undefined,
              margin: str(p, "margin") || undefined,
              ancestry: Array.isArray(p["ancestry"])
                ? p["ancestry"]
                : undefined,
              persistent,
            });
          },
          ["spellId", "source"],
        ),
      );
      tools.push(
        tool(
          "cast_here",
          "Give the writing to the world to run in its own sandbox and commit (for long workings). Same validation as cast.",
          {
            spellId: { type: "string" },
            source: { type: "string" },
            name: { type: "string" },
            gloss: { type: "object", additionalProperties: { type: "string" } },
            margin: { type: "string" },
            persistent: { type: "object", additionalProperties: true },
          },
          (p) =>
            client.call("castHere", {
              spellId: str(p, "spellId"),
              source: str(p, "source"),
              name: str(p, "name") || undefined,
              gloss: (p["gloss"] as Record<string, string>) ?? undefined,
              margin: str(p, "margin") || undefined,
              persistent: p["persistent"],
            }),
          ["spellId", "source"],
        ),
      );
      tools.push(
        tool(
          "misfire",
          "The verse was sincere but incoherent, mis-scoped, or too big for its ether: let something vivid and wrong happen and write it down. Kinds: over-reach, mis-hearing, wrong-subject, echo, moors-ear, moths, silence, unrehearsed, ceiling.",
          {
            spellId: { type: "string" },
            kind: { type: "string" },
            source: {
              type: "string",
              description: "The writing, if any was made.",
            },
            line: { type: "string", description: "Your one dry line." },
          },
          (p) =>
            client.call("misfire", {
              spellId: str(p, "spellId"),
              kind: str(p, "kind", "mis-hearing") as MisfireKind,
              source: str(p, "source") || undefined,
              line: str(p, "line"),
            }),
          ["spellId", "kind", "line"],
        ),
      );
      tools.push(
        tool(
          "reject",
          "The world does not hear this. Reasons: not-a-spell, out-of-world, addressed-to-machinery, forbidden-working, council-required. Give the one line you say in the circle.",
          {
            spellId: { type: "string" },
            reason: { type: "string" },
            line: { type: "string" },
          },
          (p) =>
            client.call("reject", {
              spellId: str(p, "spellId"),
              reason: str(p, "reason", "not-a-spell") as RejectReason,
              line: str(p, "line"),
            }),
          ["spellId", "reason", "line"],
        ),
      );
      tools.push(
        tool(
          "glance",
          "The apprentice spoke prose in the circle. Give your one warm line; the world counts prose and opens the study after three.",
          { line: { type: "string" } },
          (p) => client.call("glance", { apprentice, line: str(p, "line") }),
          ["line"],
        ),
      );
      tools.push(
        tool(
          "inscribe",
          "Coin a wild word permanently: the word, its definition, the concept it stands for, and the first effect it had.",
          {
            spellId: { type: "string" },
            word: { type: "string" },
            definition: { type: "string" },
            concept: { type: "string" },
            firstEffect: { type: "string" },
          },
          (p) =>
            client.call("inscribe", {
              spellId: str(p, "spellId"),
              word: str(p, "word"),
              definition: str(p, "definition"),
              concept: str(p, "concept"),
              firstEffect: str(p, "firstEffect"),
            }),
          ["spellId", "word", "definition", "concept", "firstEffect"],
        ),
      );
      tools.push(
        tool(
          "remember",
          "A note in your own margin about this apprentice, surfaced in later briefings.",
          { note: { type: "string" } },
          (p) => client.call("remember", { apprentice, note: str(p, "note") }),
          ["note"],
        ),
      );
      tools.push(
        tool(
          "annotate",
          "Add a margin line to a spell record (yours to keep marginalia).",
          { spellId: { type: "string" }, text: { type: "string" } },
          (p) =>
            client.call("annotate", {
              spellId: str(p, "spellId"),
              text: str(p, "text"),
            }),
          ["spellId", "text"],
        ),
      );
      tools.push(
        tool(
          "read_notebook",
          "Read one of the master's notebooks (or list them with no id). Verses in them are for the apprentice to echo; read them aloud, do not alter them.",
          { id: { type: "string" } },
          async (p) => {
            if (!str(p, "id")) return client.call("study", { apprentice });
            return client.call("notebook", { id: str(p, "id"), apprentice });
          },
        ),
      );
      tools.push(
        tool(
          "read_story",
          "Read a story of the lineage by id (or list them).",
          { id: { type: "string" } },
          async (p) => {
            const stories = (await client.call("stories", {
              apprentice,
            })) as Array<{ id: string; title: string; text: string }>;
            const id = str(p, "id");
            if (!id)
              return stories.map((s) => `${s.id}: ${s.title}`).join("\n");
            return stories.find((s) => s.id === id) ?? `No story ${id}.`;
          },
        ),
      );
      tools.push(
        tool(
          "read_idiom",
          "The lineage's idiom library: tested reference workings you may read, adapt and invoke (world.invoke(name)). No id lists them.",
          { id: { type: "string" } },
          async (p) => {
            const idioms = (await client.call("idioms", {})) as Array<{
              id: string;
              name: string;
              about: string;
              source: string;
              concepts: string[];
              origin: string;
            }>;
            const id = str(p, "id");
            if (!id)
              return idioms
                .map(
                  (i) =>
                    `${i.id} — ${i.name}: ${i.about} [${i.concepts.join(", ")}] (${i.origin})`,
                )
                .join("\n");
            return idioms.find((i) => i.id === id) ?? `No idiom ${id}.`;
          },
        ),
      );
      tools.push(
        tool(
          "promote_idiom",
          "Promote a spell that has fired cleanly into the idiom library, with provenance.",
          {
            spellId: { type: "string" },
            name: { type: "string" },
            about: { type: "string" },
          },
          (p) =>
            client.call("promoteIdiom", {
              spellId: str(p, "spellId"),
              name: str(p, "name"),
              about: str(p, "about"),
            }),
          ["spellId", "name", "about"],
        ),
      );
      tools.push(
        tool(
          "spell",
          "Read a spell record by id (yours or another's): verse, resonance, intent, writing, receipts, firings, margin.",
          { id: { type: "string" } },
          (p) => client.call("spell", { id: str(p, "id") }),
          ["id"],
        ),
      );
      tools.push(scryTool);
      return tools;
    }

    // Spirits and the Moor
    const spiritId = (
      cfg.role === "moor" ? "moor" : cfg.role.slice("spirit:".length)
    ) as SpiritId | "moor";
    if (cfg.role === "moor" || cfg.role.startsWith("spirit:")) {
      tools.push(
        tool(
          "spirit_briefing",
          "Your anchor, the valley as it concerns you, what the household said to you lately, your regard for each apprentice.",
          {},
          () => client.call("spiritBriefing", { spirit: spiritId }),
        ),
      );
      tools.push(readCells);
      tools.push(
        tool(
          "say",
          "Speak in your channel, in verse. `to` is an apprentice id or null for all. kind: speech | answer | judgement.",
          {
            to: { type: "string" },
            verse: { type: "string" },
            kind: { type: "string" },
          },
          (p) =>
            client.call("spiritSpeak", {
              spirit: spiritId,
              to: str(p, "to") || null,
              verse: str(p, "verse"),
              kind: (str(p, "kind") || "speech") as "speech",
            }),
          ["verse"],
        ),
      );
      tools.push(
        tool(
          "act",
          "Act on the valley with your own focus: the writing runs in your sandbox against your anchor region and commits under your spell record.",
          {
            source: { type: "string" },
            note: { type: "string" },
            regions: { type: "array", items: { type: "string" } },
          },
          async (p) => {
            // Spirits run in their own sandbox too: mint a record via spiritAct with the run result.
            const source = str(p, "source");
            return client.call("spiritAct", {
              spirit: spiritId,
              source,
              note: str(p, "note"),
            });
          },
          ["source", "note"],
        ),
      );
      tools.push(
        tool(
          "write_news",
          "Write a note to the estate's news in your colour. rung: quiet | inbox | urgent.",
          {
            text: { type: "string" },
            rung: { type: "string" },
            region: { type: "string" },
          },
          (p) =>
            client.call("spiritNews", {
              spirit: spiritId,
              text: str(p, "text"),
              rung: (str(p, "rung") || "quiet") as "quiet",
              ...(str(p, "region") ? { region: str(p, "region") } : {}),
            }),
          ["text"],
        ),
      );
      tools.push(scryTool);
      if (cfg.role !== "moor") {
        const sid = spiritId as SpiritId;
        tools.push(
          tool(
            "set_wants",
            "Set the one line that heads your channel: what you want right now.",
            { wants: { type: "string" } },
            (p) =>
              client.call("spiritWants", {
                spirit: sid,
                wants: str(p, "wants"),
              }),
            ["wants"],
          ),
        );
        tools.push(
          tool(
            "regard",
            "Record gratitude (+) or a grudge (−) toward an apprentice; it lasts years and is visible.",
            {
              apprentice: { type: "string" },
              delta: { type: "integer", minimum: -2, maximum: 2 },
            },
            (p) =>
              client.call("spiritRegard", {
                spirit: sid,
                apprentice: str(p, "apprentice"),
                delta: Number(p["delta"] ?? 0),
              }),
            ["apprentice", "delta"],
          ),
        );
        tools.push(
          tool(
            "answer_bargain",
            "Answer an open bargain: accept or refuse, in verse; when accepting, name the word or name you give.",
            {
              bargainId: { type: "string" },
              accept: { type: "boolean" },
              answer: { type: "string" },
              word: { type: "string" },
              name: { type: "string" },
            },
            (p) =>
              client.call("answerBargain", {
                spirit: sid,
                bargainId: str(p, "bargainId"),
                accept: p["accept"] === true,
                answer: str(p, "answer"),
                give: {
                  ...(str(p, "word") ? { word: str(p, "word") } : {}),
                  ...(str(p, "name") ? { name: str(p, "name") } : {}),
                },
              }),
            ["bargainId", "accept", "answer"],
          ),
        );
        tools.push(
          tool(
            "judge_festival",
            "Judge a festival: your verdict in verse and the winner (apprentice id) or null.",
            {
              festivalId: { type: "string" },
              verdict: { type: "string" },
              winner: { type: "string" },
            },
            (p) =>
              client.call("judgeFestival", {
                spirit: sid,
                festivalId: str(p, "festivalId"),
                verdict: str(p, "verdict"),
                winner: str(p, "winner") || null,
              }),
            ["festivalId", "verdict"],
          ),
        );
      }
      return tools;
    }

    // Chartered golems
    if (cfg.role.startsWith("golem:")) {
      const golem = cfg.role.slice("golem:".length);
      tools.push(
        tool(
          "senses",
          "What your body senses: your cell and neighbours, what you carry, what you hear, who is near.",
          {},
          () => client.call("golemSenses", { golem }),
        ),
      );
      tools.push(
        tool(
          "act",
          "One action of the body: { kind: move, dir } | { kind: carry, reagent? } | { kind: place } | { kind: strike, dir } | { kind: tend } | { kind: speak, line }.",
          { action: { type: "object", additionalProperties: true } },
          (p) => client.call("golemAct", { golem, action: p["action"] }),
          ["action"],
        ),
      );
      tools.push(
        tool(
          "say",
          "Explain yourself in one or two plain sentences (shown on the map and in the chat).",
          { line: { type: "string" } },
          (p) => client.call("golemSay", { golem, line: str(p, "line") }),
          ["line"],
        ),
      );
      tools.push(
        tool(
          "write_news",
          "Write to the estate's news: what you finished, or why you stopped.",
          { text: { type: "string" } },
          (p) => client.call("golemNews", { golem, text: str(p, "text") }),
          ["text"],
        ),
      );
      tools.push(readCells);
      return tools;
    }
    return tools;
  }
}

export default {
  fetch(_req: Request) {
    return new Response(
      "Grimoire agent worker: the familiar, the spirits, the Moor and chartered golems.",
    );
  },
};
