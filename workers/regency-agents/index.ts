import { imageTool } from "@workspace/living-canvas/image-tool";
import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { RegencyAgentReceiver } from "@workspace/regency-engine/agentRpc";
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
  PEOPLE_PROMPT,
  VOICE_JSON_SCHEMA,
  PERSON_JSON_SCHEMA,
  POLICY_GUIDE,
  ACTION_GUIDE,
  RESULT_JSON_SCHEMA,
  WORLD_BUILDER_PROMPT,
  DevelopmentSchema,
  DEVELOPMENT_JSON_SCHEMA,
} from "@workspace/regency-engine";
import { regencyRealmRpcMethods } from "@workspace-workers/regency-realm/contract";

export class RegencyAgentWorker extends AiChatWorker implements RegencyAgentReceiver {
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
      : role === "builder"
        ? WORLD_BUILDER_PROMPT
        : AGENT_PROMPT;
  }
  protected override async getTools(
    channelId: string,
  ): Promise<ToolRegistration[]> {
    const gameKey = this.gameKey(channelId),
      role = this.role(channelId);
    const native = (await super.getTools(channelId)).find(
      (tool) => tool.name === "imagegen",
    );
    const build = (
      execution: AgentToolExecutionContext | undefined,
    ): ToolRegistration[] => {
      const client = execution
        ? createDurableObjectServiceClient(
            execution.rpc,
            "examples.regency.v1",
            regencyRealmRpcMethods,
            gameKey,
          )
        : null;
      const tool = (
        name: string,
        description: string,
        properties: Record<string, unknown>,
        required: string[],
        run: (p: any) => Promise<unknown>,
        terminate = false,
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
            ...(terminate ? { control: { terminate: true } } : {}),
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
      if (role === "builder")
        return [
          ...shared,
          {
            name: "develop_world",
            description:
              "Add persistent places, people, institutions and executable systems. Existing facts cannot be replaced. Completes development and resumes the requesting advisor.",
            parameters: Type.Unsafe<Record<string, any>>(
              DEVELOPMENT_JSON_SCHEMA,
            ),
            execute: async (params) => {
              const result = await client!.call(
                "developWorld",
                DevelopmentSchema.parse(params),
              );
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify(result) },
                ],
                details: copyJson(result, {
                  omitUndefinedProperties: true,
                }) as JsonValue,
                control: { terminate: true },
              };
            },
          },
        ];
      if (role.startsWith("person:"))
        return [
          ...shared,
          tool(
            "interact_world",
            "Execute an established scene mechanism for the player's actual intention, not a hypothetical. It cannot enact a policy or advance a month; its saved code determines the effects.",
            {
              turnId: { type: "string" },
              actionId: {
                type: "string",
                description:
                  "Stable ID for this intended action; reuse on retry.",
              },
              processId: { type: "string" },
              action: { type: "string" },
              payload: { type: "object" },
            },
            ["turnId", "actionId", "processId", "action", "payload"],
            (p) => client!.call("interactWorld", p),
          ),
          tool(
            "request_development",
            "Ask the independent world-builder for missing geography, people or mechanisms required by this intention. Then stop; you will be resumed after development.",
            { turnId: { type: "string" }, request: { type: "string" } },
            ["turnId", "request"],
            (p) => client!.call("requestDevelopment", p),
            true,
          ),
          tool(
            "visit_place",
            "Travel to an established place at the player's request. Does not enact policy or advance a month.",
            { turnId: { type: "string" }, placeId: { type: "string" } },
            ["turnId", "placeId"],
            (p) => client!.call("visitPlace", p),
          ),
          tool(
            "invite",
            "Bring a new independently agentic specialist or representative to the council before anyone speaks.",
            { turnId: { type: "string" }, person: PERSON_JSON_SCHEMA },
            ["turnId", "person"],
            (p) => client!.call("invite", p),
          ),
          tool(
            "consult",
            "Invite another advisor before you speak when their perspective will change the decision.",
            { turnId: { type: "string" }, advisorId: { type: "string" } },
            ["turnId", "advisorId"],
            (p) => client!.call("consult", p),
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
            (p) => client!.call("executePolicy", p),
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
            (p) => client!.call("proposePolicy", p),
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
            (p) => client!.call("speak", p),
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
              "regency",
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
    return new Response("The storyteller");
  },
};
