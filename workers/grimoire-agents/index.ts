import { imageTool } from "@workspace/living-canvas/image-tool";
import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { GrimoireAgentReceiver } from "@workspace/grimoire-engine/agentRpc";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import type { ToolRegistration } from "@panticonic/pi-durable";
import { Type } from "@panticonic/pi-ai";
import { copyJson, type JsonValue } from "@panticonic/pi-chord";
import { authorNativeTool } from "@workspace/harness";
import {
  createDurableObjectServiceClient,
  rpc,
} from "@workspace/runtime/worker/kernel";
import {
  AGENT_PROMPT,
  RESULT_JSON_SCHEMA,
  WILD_PROMPT,
  STIR_JSON_SCHEMA,
} from "@workspace/grimoire-engine";
import { grimoireWorldRpcMethods } from "@workspace-workers/grimoire-world/contract";

export class GrimoireAgentWorker extends AiChatWorker implements GrimoireAgentReceiver {
  static override schemaVersion = AiChatWorker.schemaVersion;
  private gameKey(channelId: string): string {
    const config = this.subscriptions.getConfig(channelId) as
      | { gameKey?: string }
      | undefined;
    if (!config?.gameKey)
      throw new Error("No story is attached to this agent.");
    return config.gameKey;
  }
  protected override getAgentPrompt(channelId: string) {
    return (this.subscriptions.getConfig(channelId) as { role?: string })
      ?.role === "wild"
      ? WILD_PROMPT
      : AGENT_PROMPT;
  }
  protected override async getTools(
    channelId: string,
  ): Promise<ToolRegistration[]> {
    const gameKey = this.gameKey(channelId),
      role = (this.subscriptions.getConfig(channelId) as { role?: string })
        ?.role;
    const native = (await super.getTools(channelId)).find(
      (tool) => tool.name === "imagegen",
    );
    const build = (
      execution: AgentToolExecutionContext | undefined,
    ): ToolRegistration[] => {
      const client = execution
        ? createDurableObjectServiceClient(
            execution.rpc,
            "examples.grimoire.v1",
            grimoireWorldRpcMethods,
            gameKey,
          )
        : null;
      const tool = (
        name: string,
        description: string,
        properties: Record<string, unknown>,
        required: string[],
        run: (p: any) => Promise<unknown>,
      ): ToolRegistration => ({
        name,
        description,
        parameters: Type.Unsafe<Record<string, any>>({
          type: "object",
          properties,
          required,
          additionalProperties: false,
        }),
        execute: async (params) => {
          const result = await run(params);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            details: copyJson(result, {
              omitUndefinedProperties: true,
            }) as JsonValue,
          };
        },
      });
      // Game tools expose authored world actions and the native image painter.
      const shared = [
        tool(
          "read_game",
          "Read the illustrated scene, history and pending player decision. If nothing is pending, stop.",
          {},
          [],
          () => client!.call("perspective"),
        ),
      ];
      if (role === "wild")
        return [
          ...shared,
          tool(
            "stir",
            "Let the independent living world respond.",
            { id: { type: "string" }, result: STIR_JSON_SCHEMA },
            ["id", "result"],
            (p) => client!.call("stir", p),
          ),
        ];

      const artwork = native
        ? [
            imageTool(
              native,
              {
                artCatalog: () => client!.call("artCatalog"),
                storeArt: (input) => client!.call("storeArt", input),
              },
              "grimoire",
              () => {
                if (!execution)
                  throw new Error(
                    "Artwork is not bound to its native invocation",
                  );
                return execution.commandId;
              },
            ),
          ]
        : [];
      return [
        ...shared,
        ...artwork,
        tool(
          "reply",
          "Speak to the player immediately, before drawing or weaving.",
          { turnId: { type: "string" }, text: { type: "string" } },
          ["turnId", "text"],
          (p) => client!.call("reply", p),
        ),
        tool(
          "weave",
          "Author and execute a real enchantment against the public garden. Read the result before describing it.",
          { turnId: { type: "string" }, code: { type: "string" } },
          ["turnId", "code"],
          (p) => client!.call("weave", p),
        ),
        tool(
          "finish_turn",
          "Commit the pending moment. Result must follow the scene and story schema in your prompt; invalid data returns an error to correct.",
          { id: { type: "string" }, result: RESULT_JSON_SCHEMA },
          ["id", "result"],
          (p) => client!.call("finish", p),
        ),
      ];
    };
    return build(undefined).map((_tool, index) =>
      authorNativeTool(
        (execution: AgentToolExecutionContext | undefined) =>
          build(execution)[index]!,
        (api, context) => this.bindNativeToolExecution(api, context),
      ),
    );
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async receiveMoment(input: { channelId: string; steeringId: string }) {
    if (!this.subscriptions.getParticipantId(input.channelId))
      throw new Error("The storyteller is not seated.");
    await this.submitAgentInitiatedTurn(
      input.channelId,
      {
        content:
          "A player moment is waiting. Read the game and finish that moment using your tools.",
      },
      { steeringId: input.steeringId },
    );
    return { ok: true };
  }
}
export default {
  fetch() {
    return new Response("Moth");
  },
};
