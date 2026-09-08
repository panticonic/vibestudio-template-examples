import { imageTool } from "@workspace/living-canvas/image-tool";
import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import type { AgentTool } from "@workspace/pi-core";
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

export class GrimoireAgentWorker extends AiChatWorker {
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
  protected override async getLoopTools(
    channelId: string,
    execution?: AgentToolExecutionContext,
  ): Promise<AgentTool[]> {
    const client = createDurableObjectServiceClient(
      execution?.rpc ?? this.rpc,
      "examples.grimoire.v1",
      this.gameKey(channelId),
    );
    const tool = (
      name: string,
      description: string,
      properties: Record<string, unknown>,
      required: string[],
      run: (p: any) => Promise<unknown>,
    ): AgentTool => ({
      name,
      label: name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      } as never,
      execute: async (_id, params) => {
        try {
          const result = await run(params);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            details: result,
          };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: String(error) }],
            details: null,
            isError: true,
          };
        }
      },
    });
    // Game tools expose authored world actions and the native image painter.
    const shared = [
      tool(
        "read_game",
        "Read the illustrated scene, history and pending player decision. If nothing is pending, stop.",
        {},
        [],
        () => client.call("perspective"),
      ),
    ];
    if (
      (this.subscriptions.getConfig(channelId) as { role?: string })?.role ===
      "wild"
    )
      return [
        ...shared,
        tool(
          "stir",
          "Let the independent living world respond.",
          { id: { type: "string" }, result: STIR_JSON_SCHEMA },
          ["id", "result"],
          (p) => client.call("stir", p),
        ),
      ];
    const native = (await super.getLoopTools(channelId, execution)).find(
      (tool) => tool.name === "imagegen",
    );
    const artwork = native
      ? [
          imageTool(
            native,
            (method, input) => client.call(method, input),
            "grimoire",
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
        (p) => client.call("reply", p),
      ),
      tool(
        "weave",
        "Author and execute a real enchantment against the public garden. Read the result before describing it.",
        { turnId: { type: "string" }, code: { type: "string" } },
        ["turnId", "code"],
        (p) => client.call("weave", p),
      ),
      tool(
        "finish_turn",
        "Commit the pending moment. Result must follow the scene and story schema in your prompt; invalid data returns an error to correct.",
        { id: { type: "string" }, result: RESULT_JSON_SCHEMA },
        ["id", "result"],
        (p) => client.call("finish", p),
      ),
    ];
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
