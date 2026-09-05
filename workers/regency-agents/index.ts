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
  PEOPLE_PROMPT,
  VOICE_JSON_SCHEMA,
  PERSON_JSON_SCHEMA,
  POLICY_GUIDE,
  ACTION_GUIDE,
  RESULT_JSON_SCHEMA,
} from "@workspace/regency-engine";

export class RegencyAgentWorker extends AiChatWorker {
  static override schemaVersion = AiChatWorker.schemaVersion;
  private gameKey(channelId: string): string {
    const config = this.subscriptions.getConfig(channelId) as
      | { gameKey?: string }
      | undefined;
    if (!config?.gameKey)
      throw new Error("No story is attached to this agent.");
    return config.gameKey;
  }
  private role(channelId: string): string {
    return (this.subscriptions.getConfig(channelId) as { role: string }).role;
  }
  protected override getAgentPrompt(channelId: string) {
    const role = this.role(channelId);
    return role.startsWith("person:")
      ? PEOPLE_PROMPT + POLICY_GUIDE + ACTION_GUIDE
      : AGENT_PROMPT;
  }
  protected override async getLoopTools(
    channelId: string,
    execution?: AgentToolExecutionContext,
  ): Promise<AgentTool[]> {
    const client = createDurableObjectServiceClient(
      execution?.rpc ?? this.rpc,
      "examples.regency.v1",
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
    if (this.role(channelId).startsWith("person:"))
      return [
        ...shared,
        tool(
          "invite",
          "Bring a new independently agentic specialist or representative to the council before anyone speaks.",
          { turnId: { type: "string" }, person: PERSON_JSON_SCHEMA },
          ["turnId", "person"],
          (p) => client.call("invite", p),
        ),
        tool(
          "consult",
          "Invite another advisor before you speak when their perspective will change the decision.",
          { turnId: { type: "string" }, advisorId: { type: "string" } },
          ["turnId", "advisorId"],
          (p) => client.call("consult", p),
        ),
        tool(
          "execute_policy",
          "Execute a discussed decree explicitly authorized by the regent, or advance time only on their request. Execute before inviting colleagues or speaking.",
          {
            turnId: { type: "string" },
            proposalId: { type: "string" },
            months: { type: "integer", minimum: 0, maximum: 12 },
          },
          ["turnId", "months"],
          (p) => client.call("executePolicy", p),
        ),
        tool(
          "propose_policy",
          "Author and run a policy forecast on a copy of the realm. Never enacts it.",
          {
            turnId: {
              type: "string",
              description:
                "The current pending conversation id returned by read_game; never a person or policy id.",
            },
            title: { type: "string" },
            summary: { type: "string" },
            replaces: {
              type: "string",
              description:
                "The active program id to replace or repeal. The old code stops on enactment; your enact body transitions its public conditions.",
            },
            code: { type: "string" },
          },
          ["turnId", "title", "summary", "code"],
          (p) => client.call("proposePolicy", p),
        ),
        tool(
          "speak",
          "Speak as yourself and update your own private memory.",
          {
            turnId: {
              type: "string",
              description:
                "The current pending conversation id returned by read_game; never a person or policy id.",
            },
            voice: VOICE_JSON_SCHEMA,
          },
          ["turnId", "voice"],
          (p) => client.call("speak", p),
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
            "regency",
          ),
        ]
      : [];
    return [
      ...shared,
      ...artwork,
      tool(
        "finish_turn",
        "Commit the pending moment. Result must follow the scene and story schema in your prompt; invalid data returns an error to correct.",
        {
          turnId: {
            type: "string",
            description: "The pending conversation id from read_game.",
          },
          result: RESULT_JSON_SCHEMA,
        },
        ["turnId", "result"],
        (p) => client.call("finish", p),
      ),
    ];
  }
  @rpc({
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
    return new Response("The storyteller");
  },
};
