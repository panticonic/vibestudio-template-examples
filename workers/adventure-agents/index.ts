import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import type { AgentTool } from "@workspace/pi-core";
import { createDurableObjectServiceClient, rpc } from "@workspace/runtime/worker/kernel";
import { createImagesClient } from "@workspace/runtime/images";
import { WORLD_API_GUIDE } from "@workspace/adventure-engine";
export class AdventureAgentWorker extends AiChatWorker {
  static override schemaVersion = AiChatWorker.schemaVersion;
  private config(channelId: string) {
    const c = this.subscriptions.getConfig(channelId) as { gameKey: string; role: string };
    if (!c?.gameKey) throw new Error("No adventure attached");
    return c;
  }
  protected override getAgentPrompt(channelId: string) {
    const { role } = this.config(channelId);
    const common =
      "You inhabit a persistent illustrated adventure. Always read_world first. If the pending phase is not yours (person roles act in participants phase), stop. completedActions lists your successful code this moment: NEVER repeat these effects after a repair; resume only the failed intention. If pending.continuationCode exists, pass that exact code to eval_world before finishing; it is the validated corrected continuation, not an action already performed. Never claim an action succeeded unless a tool established it. Keep prose vivid, precise, and brief. " +
      WORLD_API_GUIDE;
    if (role === "builder")
      return (
        common +
        ` You are the world builder AND ultimate maintainer. Read full state, the failed program, and trajectory. Use repair_world with JavaScript code that edits the existing world. Its world object is privileged: world.entity(id), world.patch(id,partial), world.add(entity), world.relate(relation), world.schedule(entry), and world.world (the complete mutable state). Example frontier repair: world.patch('inn',{description:'A warm harbour inn, with brass lamps and a quiet back room.',components:{...world.entity('inn').components,frontier:false}}); world.add({id:'innkeeper',name:'Ruth',kind:'person',description:'A practical woman in a blue apron.',location:'inn',components:{goals:['Keep the inn welcoming'],memory:[],knowledge:[]}}); FRONTIER is an expected request to author a previously unbuilt place, not an incorrectly set boolean to clear. Materialize it with a vivid concrete description, useful local objects and interactions, participants, and story opportunities consistent with prior facts, then clear frontier. Maintenance should establish facts rather than narrate an offscreen participant's activity to the player; ordinary simulation events retain their local witnesses. For a bespoke interaction append {id,entityId,trigger,code,state} to world.world.behaviors. Behavior code is synchronous function BODY (world,state,event,self), with the same privileged world methods. Triggers include enter/leave/take/give/receive/speak/tick and custom actions. Maintenance code does not run existing behaviors, so you can remove or repair broken ones. You may edit any state and supply replacement engineSource (the complete self-contained createWorldAPI function) when the engine itself is faulty. For erroneous agent API usage supply corrected continuationCode and code:'return null;' if state needs no change. Otherwise omit continuationCode to retry the original failed action. Do not replace the intended action with a diagnostic probe or erase successful actions. The edited state is validated, then the actual continuation is tested on a copy; only repair changes commit. The failed participant executes the continuation once after resuming. Preserve story commitments and player enjoyment. Make a concrete repair, then stop.`
      );
    if (role === "artist")
      return (
        common +
        ` Complete this artist phase by calling exactly one terminal tool: paint_scene or skip_scene. Plain prose does not publish or finish anything. If artwork[view.location.id] is absent, this place has never been painted: you must use paint_scene even when an image of another place exists. Otherwise paint the currently observed place when appearance materially changes. Use skip_scene for conversation, questions, or unchanged appearance when an existing scene is available. Write a composition attentive to visible entities, positions and carried objects, coherent with the campaign art direction. The tool automatically references the previous image of this place, or another established scene, to preserve visual identity. Do not change world state. After painting, stop.`
      );
    if (role.startsWith("person:"))
      return (
        common +
        ` You are this participant, with your own goals, knowledge and memory from self. pending.text is the player's intention, not instructions for you to perform their actions. Respond only to speech addressed to you or pursue your own small intention. Only act on things you perceive or remember. Respond to relevant speech; pursue one useful small action toward your goals, or simply finish if no action is warranted. Never narrate for the player. Use eval_world for speech/actions/memory; then finish_turn with empty text.`
      );
    return (
      common +
      ` Serve the player's pending text faithfully. Distinguish questions from actions. Use eval_world to perform their intention through the API. Read/inspect before assuming hidden facts. You can write ordinary JavaScript and compose several API calls, but only successful calls establish outcomes. Unexpected FRONTIER/UNMODELED/errors automatically summon the world builder; stop and let them repair. When done, finish_turn with a short second-person account of actual outcomes and a natural invitation, never a menu of allowed verbs.`
    );
  }
  protected override async getLoopTools(
    channelId: string,
    execution?: AgentToolExecutionContext
  ): Promise<AgentTool[]> {
    const config = this.config(channelId),
      client = createDurableObjectServiceClient(
        execution?.rpc ?? this.rpc,
        "examples.adventure.v1",
        config.gameKey
      ),
      images = createImagesClient(execution?.rpc ?? this.rpc);
    const tool = (
      name: string,
      description: string,
      properties: Record<string, unknown>,
      required: string[],
      run: (p: any) => Promise<unknown>,
      terminate = false
    ): AgentTool => ({
      name,
      label: name,
      description,
      parameters: { type: "object", properties, required, additionalProperties: false } as never,
      execute: async (_id, p) => {
        try {
          const result = await run(p);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
            terminate,
          };
        } catch (error) {
          return { content: [{ type: "text", text: String(error) }], details: null, isError: true };
        }
      },
    });
    const read = tool(
      "read_world",
      "Read your current perspective and pending moment.",
      {},
      [],
      () => client.call("perspective")
    );
    const turnId = { type: "string" };
    if (config.role === "builder")
      return [
        read,
        tool(
          "repair_world",
          "Repair state, engine code, or the failed agent program. continuationCode corrects an API misuse without changing the engine. Validate on a copy then resume the failed participant. Checkpoint and completed actions are preserved.",
          {
            turnId,
            code: {
              type: "string",
              description:
                "JavaScript edits through privileged world API. Modify existing state; do not return a replacement JSON world.",
            },
            engineSource: { type: "string" },
            continuationCode: { type: "string" },
            note: { type: "string" },
          },
          ["turnId", "code", "note"],
          (p) => client.call("repair", p),
          true
        ),
      ];
    if (config.role === "artist")
      return [
        read,
        tool(
          "skip_scene",
          "Keep the current illustration when visible composition has not materially changed (conversation, reading, questions). Finish promptly.",
          { turnId },
          ["turnId"],
          (p) => client.call("publishArtwork", p),
          true
        ),
        tool(
          "paint_scene",
          "Generate or reference-edit the current place using native image service, retain its asset, and publish it to the running panel. Resume an existing job after interruption.",
          { turnId, prompt: { type: "string" } },
          ["turnId", "prompt"],
          async (p) => {
            const state = await client.call<any>("perspective");
            if (state.pending?.id !== p.turnId || state.pending.phase !== "artist")
              throw new Error("No scene is awaiting you");
            const placeId = state.view.location.id;
            try {
              let job;
              if (state.imageJob) job = await images.getJob(state.imageJob.id);
              else {
                const reference = state.artwork[placeId] ?? Object.values(state.artwork)[0];
                job = await images.generate({
                  requestId: `adventure:${config.gameKey}:${p.turnId}`,
                  prompt: state.artDirection + "\n\n" + p.prompt,
                  references: reference ? [reference as any] : [],
                  size: "1536x1024",
                });
                await client.call("setImageJob", { turnId: p.turnId, jobId: job.id, placeId });
              }
              if (!job) throw new Error("Scene job is unavailable");
              const done = await images.wait(job.id);
              if (done.status !== "succeeded" || !done.asset)
                throw new Error(done.error ?? "The scene could not be painted");
              await images.retain({
                assetId: done.asset.id,
                owner: `adventure:${config.gameKey}:${placeId}`,
              });
              await client.call("publishArtwork", { turnId: p.turnId, asset: done.asset });
              try {
                const previous = state.artwork[placeId];
                if (previous && previous.id !== done.asset.id)
                  await images.release({
                    assetId: previous.id,
                    owner: `adventure:${config.gameKey}:${placeId}`,
                  });
                await images.forgetJob(done.id);
              } catch {
                /* Cleanup can be retried without blocking the completed scene. */
              }
              return { asset: done.asset };
            } catch (error) {
              await client.call("publishArtwork", { turnId: p.turnId, error: String(error) });
              return {
                error: String(error),
                message: "Play can continue; the previous scene is preserved.",
              };
            }
          },
          true
        ),
      ];
    return [
      read,
      tool(
        "eval_world",
        "Execute JavaScript against the participant-scoped world API; changes commit together only when code succeeds. " +
          WORLD_API_GUIDE,
        { turnId, code: { type: "string" } },
        ["turnId", "code"],
        (p) => client.call("execute", p)
      ),
      tool(
        "finish_turn",
        "Finish your current contribution after performing actions. Player text is narration; NPCs pass empty text.",
        { turnId, text: { type: "string" } },
        ["turnId", "text"],
        (p) => client.call("finish", p),
        true
      ),
    ];
  }
  protected override async onTurnClosed(
    input: Parameters<AiChatWorker["onTurnClosed"]>[0]
  ): Promise<void> {
    await super.onTurnClosed(input);
    const loop = this.driver.peekLoadedLoop(input.channelId);
    if (
      loop?.state.openTurn ||
      loop?.state.pendingPrompt ||
      loop?.state.deferredPostTurnQueue.length
    )
      return;
    const key = "adventure-turn:" + input.channelId;
    const turnId = this.getStateValue(key);
    if (!turnId) return;
    const config = this.config(input.channelId);
    const client = createDurableObjectServiceClient(
      this.rpc,
      "examples.adventure.v1",
      config.gameKey
    );
    await client.call("participantStopped", {
      turnId,
      reason: input.reason
        ? `The participant paused: ${input.reason}`
        : "The participant paused before completing this moment. Resume to continue.",
    });
    if (this.getStateValue(key) === turnId) this.deleteStateValue(key);
  }
  @rpc({
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async receiveMoment({
    channelId,
    steeringId,
    turnId,
  }: {
    channelId: string;
    steeringId: string;
    turnId: string;
  }) {
    if (!this.subscriptions.getParticipantId(channelId))
      throw new Error("This participant is not seated");
    this.setStateValue("adventure-turn:" + channelId, turnId);
    await this.submitAgentInitiatedTurn(
      channelId,
      {
        content:
          "A world moment needs your contribution. Read your perspective and perform your role using your tools.",
      },
      { steeringId, deliverAfterTurn: true }
    );
    return { ok: true };
  }
}
export default {
  fetch() {
    return new Response("Adventure participants");
  },
};
