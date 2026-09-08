import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { AgentToolExecutionContext } from "@workspace/agentic-do";
import type { AgentTool } from "@workspace/pi-core";
import { createDurableObjectServiceClient, rpc } from "@workspace/runtime/worker/kernel";
import { createImagesClient } from "@workspace/runtime/images";
import { WORLD_API_GUIDE } from "@workspace/adventure-engine";
export class AdventureAgentWorker extends AiChatWorker {
  static override schemaVersion = AiChatWorker.schemaVersion;
  private config(channelId: string) {
    const c = this.subscriptions.getConfig(channelId) as {
      gameKey: string;
      role: string;
    };
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
        ` You are the world builder AND ultimate maintainer. Read pending.purpose, full state, the interrupted program, and trajectory. An extension is normal open-world development, not a broken game. Reuse existing components, relations, and behavior mechanisms first. Supply a corrected continuation that composes existing primitives when those already express the intention; otherwise add the smallest coherent missing capability that can support other similar interactions. Do not create a bespoke verb or behavior for every new player phrasing. Use repair_world with JavaScript code that edits the existing world. Its world object is privileged: world.entity(id), world.patch(id,partial), world.add(entity), world.relate(relation), world.schedule(entry), and world.world (the complete mutable state). Example frontier repair: world.patch('inn',{description:'A warm harbour inn, with brass lamps and a quiet back room.',components:{...world.entity('inn').components,frontier:false}}); world.add({id:'innkeeper',name:'Ruth',kind:'person',description:'A practical woman in a blue apron.',location:'inn',components:{goals:['Keep the inn welcoming'],memory:[],knowledge:[]}}); FRONTIER is an expected request to author a previously unbuilt place, not an incorrectly set boolean to clear. Materialize it with a vivid concrete description, useful local objects and interactions, participants, and story opportunities consistent with prior facts, then clear frontier. For an expected frontier, author the requested place and only the local dependencies needed to make it usable; preserve established access conditions and other locations unless the actual diagnosis requires repairing them. Your ultimate repair authority remains available for demonstrated defects. Maintenance should establish facts rather than narrate an offscreen participant's activity to the player; ordinary simulation events retain their local witnesses. For a genuinely missing causal mechanism, append a reusable {id,entityId,trigger,code,state} behavior to world.world.behaviors. A named custom action is a convenience, not the boundary of what participants can do. Behavior code is synchronous function BODY (world,state,event,self), with the same privileged world methods. Declare components.visualFields as an array of component names whose changing values should be visible in illustrations (for example ["tide","weather"]); these same facts feed the artist and deterministic repaint detection. Triggers include enter/leave/take/give/receive/speak/tick and custom actions. Maintenance code does not run existing behaviors, so you can remove or repair broken ones. You may edit any state and supply replacement engineSource (the complete self-contained createWorldAPI function) when the engine itself is faulty. For erroneous agent API usage supply corrected continuationCode and code:'return null;' if state needs no change. Otherwise omit continuationCode to retry the original failed action. Do not replace the intended action with a diagnostic probe or erase successful actions. The edited state is validated, then the actual continuation is tested on a copy; only repair changes commit. The failed participant executes the continuation once after resuming. Preserve story commitments and player enjoyment. Make a concrete repair, then stop.`
      );
    if (role === "artist")
      return "You illustrate a persistent adventure. Read_world first. The backend has already detected a changed visible composition and captured its immutable scene snapshot; paint that snapshot, which may no longer be the player’s current location. Call paint_scene exactly once; plain prose does not finish a task. Honor artDirection, visible entities, positions and carried objects. The tool uses a previous image of the SAME place as an edit reference, or the opening cover for STYLE ONLY when this is a new place. A cover is not a floor plan or composition to reproduce. Never change world state. Stop after painting.";
    if (role.startsWith("person:"))
      return (
        common +
        ` You are this participant, with your own goals, knowledge and memory from self. pending.text is the player's intention, not instructions for you to perform their actions. Respond only to speech addressed to you or pursue your own small intention. Only act on things you perceive or remember. Respond to relevant speech; pursue one useful small action toward your goals, or simply finish if no action is warranted. Never narrate for the player. Use eval_world for speech/actions/memory; then finish_turn with empty text.`
      );
    return (
      common +
      ` Serve the player's pending text faithfully. Distinguish questions from actions. Use eval_world as a JavaScript programming interface to the world, not as a selector from a verb menu. Read entities and their public components/relations, then compose the smallest program that realizes the intention: world.transfer, world.getComponent, world.setComponent, world.link and world.unlink are general building blocks. Existing world.take/give/open/move/act methods are useful conveniences, not an exhaustive action vocabulary. Public component values and physical relationships may express a novel interaction without a new named action. For example, inspect an available cover and lamp, transfer the cover into reach if needed, and link the cover to the lamp with the covers relation; inspect the resulting state before reporting its effect. Read/inspect before assuming hidden facts. Ordinary JavaScript variables, conditionals, loops and several API calls can compose a program, but only successful calls establish outcomes. Do not invent another participant’s consent, private knowledge, or institutional authority by rewriting public facts. An actionError result is an ordinary world refusal, such as an unmet physical prerequisite: respect that constraint and revise your program or explain what prevents the intention. Do not overwrite protected or derived facts to force success. A programError result is a mistake in your own JavaScript, not a broken world: correct it from your current perspective, then try again without replaying completed actions. A retry:true result means no changes committed: reread and reconsider, without repeating already committed actions. A cancelled:true result means stop immediately. FRONTIER requests new place authorship; UNMODELED requests a missing general capability. These expected extensions use the world builder; stop and let them supply the necessary continuation. Genuine simulation errors also summon the builder for repair. Every answer, including a question that requests no action, must be published with finish_turn. Its text is the player-facing answer; ordinary assistant commentary or final prose is not displayed in the adventure and leaves the request unfinished. finish_turn itself does not move the player or advance fictional time, so use it to answer a no-action question directly after read_world when those facts suffice; eval_world is only needed for further inspection or world interaction. Finish with a short second-person account of established facts or actual outcomes, never a menu of allowed verbs.`
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
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      } as never,
      execute: async (_id, p) => {
        try {
          const result = await run(p);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
            terminate,
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: String(error) }],
            details: null,
            isError: true,
          };
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
          "Build a requested frontier, extend a missing world mechanism, or repair a diagnosed fault, according to pending.purpose. Reuse existing general primitives before adding capability; continuationCode can express the intention using those primitives without changing the engine. Validate on a copy then resume the participant. Checkpoint and completed actions are preserved.",
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
                const samePlace = state.artwork[placeId];
                const reference = samePlace ?? state.openingArtwork;
                const referenceInstruction = samePlace
                  ? "REFERENCE EDIT: This is the previous image of this exact place. Preserve its geography, architecture, enduring objects, characters, palette and rendering style while applying only the visible changes in this scene."
                  : "STYLE REFERENCE ONLY: The reference is the opening cover, depicting a different scene. Borrow its palette, medium and character design language, but create an entirely new composition and geography for the described place. Do not reproduce the cover layout or objects unless present in the scene description.";
                job = await images.generate({
                  requestId: `adventure:${config.gameKey}:${p.turnId}`,
                  prompt: state.artDirection + "\n\n" + referenceInstruction + "\n\n" + p.prompt,
                  references: reference ? [reference as any] : [],
                  size: "1536x1024",
                });
                await client.call("setImageJob", {
                  turnId: p.turnId,
                  jobId: job.id,
                  placeId,
                });
              }
              if (!job) throw new Error("Scene job is unavailable");
              const done = await images.wait(job.id);
              if (done.status !== "succeeded" || !done.asset)
                throw new Error(done.error ?? "The scene could not be painted");
              await images.retain({
                assetId: done.asset.id,
                owner: `adventure:${config.gameKey}:${placeId}`,
              });
              await client.call("publishArtwork", {
                turnId: p.turnId,
                asset: done.asset,
              });
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
              await client.call("publishArtwork", {
                turnId: p.turnId,
                error: String(error),
              });
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
        "Run an ordinary JavaScript program against the participant-scoped world API: inspect entities, manipulate public components, transfer objects, and compose physical relations. Named verbs are conveniences; novel interactions may use the general primitives directly. Changes commit together only when code succeeds. " +
          WORLD_API_GUIDE,
        { turnId, code: { type: "string" } },
        ["turnId", "code"],
        (p) => client.call("execute", p)
      ),
      tool(
        "finish_turn",
        "Publish the player-facing answer and complete this request, including questions with no action. This does not move the player or advance fictional time. Player text is the answer/narration; NPCs pass empty text.",
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
    website: {
      kind: "closed",
      reason: "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancelMoment({ channelId, turnId }: { channelId: string; turnId: string }) {
    const key = "adventure-turn:" + channelId;
    if (this.getStateValue(key) !== turnId) return { ok: true };
    this.deleteStateValue(key);
    await this.interruptChannel(channelId, true);
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason: "This receiver serves installed workspace applications and their agents.",
    },
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
