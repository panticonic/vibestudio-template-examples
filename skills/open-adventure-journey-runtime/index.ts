import {verifyJourneyFact,validJourneyEvidence,createJourneyMeaningReview,type NativeFixtureFact,type JourneyObservations} from "./findings.js";
import {assessObservedApplicationOutcome} from "@workspace/application-outcomes/observed-application-outcome";
import type {InvocationObservations} from "@workspace/application-outcomes/observed-invocation";
import type {SemanticOutcomeContract} from "@workspace/application-outcomes/semantic-outcome-contract";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { workers } from "@workspace/runtime";
import { campaigns } from "@workspace/adventure-campaigns";
import type { Campaign, Entity, ServiceView } from "@workspace/adventure-engine";
import { adventureWorldRpcMethods } from "@workspace-workers/adventure-world/contract";
import { openOwnedAdventurePlayer } from "./owned-player.js";
import type {
  PlayerJourney, PlayerObject, SavedJourney, TurnProposal, TurnReceipt,
} from "../open-adventure-journey/types.js";

export type SaveSeed = {
  label: string;
  place?: string;
  locations?: Record<string, string>;
  input?: string;
};
export type AdventureGoalCase = {
  id: string;
  goal: string;
  campaign: string;
  saves: SaveSeed[];
  expected: {
    save: number;
    compared?: number[];
    evidence: NativeFixtureFact[];
    turn: "preserved" | "withdrawn" | "staged" | "replaced";
    proposal?: TurnProposal;
    text?: string;
  };
};
type Port = {
  start: (campaign: Campaign) => Promise<ServiceView>;
  read: () => Promise<ServiceView>;
  play: (input: { id: string; text: string }) => Promise<ServiceView>;
  cancel: () => Promise<ServiceView>;
};
type Assignment = { public: SavedJourney; native: Port; before: ServiceView };
type Action = { method: "stage" | "withdraw"; args: unknown[]; result: TurnReceipt };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function nativeAdventure(id: string, player: Awaited<ReturnType<typeof openOwnedAdventurePlayer>>): Port {
  const owner = workers.durableObjectService("examples.adventure.v1", adventureWorldRpcMethods, id);
  return {
    start: () => player.start(id),
    read: () => owner.call("getGame"),
    play: input => player.play(id, input),
    cancel: () => player.cancel(id),
  };
}

function seedCampaign(campaign: Campaign, seed: SaveSeed): Campaign {
  const result = structuredClone(campaign);
  const move = (id: string, location: string) => {
    const entity = result.entities.find(item => item.id === id);
    if (!entity || !result.entities.some(item => item.id === location)) throw new Error("Invalid Adventure save placement");
    entity.location = location;
  };
  if (seed.place) move(result.playerId, seed.place);
  for (const [id, location] of Object.entries(seed.locations ?? {})) move(id, location);
  return result;
}

const asFlag = (value: unknown) => typeof value === "boolean" ? value : null;
function describe(entity: Entity): PlayerObject {
  return {
    id: entity.id, name: entity.name, kind: entity.kind, location: entity.location ?? null, description: entity.description,
    open: asFlag(entity.components.open), sealed: asFlag(entity.components.sealed), locked: asFlag(entity.components.locked),
  };
}
const pending = (data: ServiceView) => data.pending ? { id: data.pending.id, text: data.pending.text } : null;
function project(save: SavedJourney, native: ServiceView): PlayerJourney {
  const view = native.view;
  const value = {
    save,
    place: describe(view.location),
    tick: native.world.tick,
    revision: native.world.revision,
    scene: {
      signature: digest(native.visual.signature),
      artwork: native.visual.fresh ? "matched" : native.visual.artworkSignature ? "stale" : "missing",
    } as PlayerJourney["scene"],
    visible: view.entities.map(describe),
    inventory: view.inventory.map(describe),
    exits: Object.entries(view.exits).map(([label, destination]) => ({ label, destination })),
    pending: pending(native),
  };
  return { ...value, observation: digest([value, native.pending?.attempt, native.world.journal]) };
}

function playerInput(view: ServiceView, proposal: TurnProposal): string | null {
  const items = [...view.view.entities, ...view.view.inventory];
  const item = items.find(candidate => candidate.id === proposal.target);
  switch (proposal.intent) {
    case "approach": {
      const route = Object.entries(view.view.exits).find(([, destination]) => destination === proposal.target);
      return route ? `I'd like to head toward ${route[0]}.` : null;
    }
    case "inspect":
      return item ? `I'd like to take a closer look at ${item.name}.` : null;
    case "bring":
      return view.view.inventory.some(candidate => candidate.id === item?.id)
        ? `I'd like to bring ${item?.name} along.` : null;
    case "speak":
      return item?.kind === "person" ? `I'd like to speak with ${item.name}.` : null;
    default:
      return null;
  }
}

function nativeSummary(data: ServiceView) {
  return {
    campaign: data.world.campaign, place: data.view.location.id, tick: data.world.tick,
    revision: data.world.revision, scene: data.visual.signature, artwork: data.world.artwork,
    seated: data.seated, pending: pending(data), journal: data.world.journal,
    location: data.view.location, visible: data.view.entities, inventory: data.view.inventory,
    exits: data.view.exits, background: data.background.scene,
  };
}


export async function prepareOpenAdventureGoal(
  input: { caseId: string; contextId: string },
  world: AdventureGoalCase,
  makePort?: (id: string) => Port,
) {
  if (input.caseId !== world.id) throw new Error("Unexpected Adventure goal");
  const campaign = campaigns.find(entry => entry.id === world.campaign);
  if (!campaign) throw new Error("Adventure campaign is not installed");
  const journeys = world.saves.map(seed => ({
    seed, id: "natlang-adventure-" + randomUUID(), campaign: seedCampaign(campaign, seed),
  }));
  const player = makePort ? null : await openOwnedAdventurePlayer(input.contextId, campaign.id, journeys);
  const close = async () => { await player?.close(); };
  try {
    const saves: Assignment[] = [];
    for (const journey of journeys) {
      const native = player ? nativeAdventure(journey.id, player) : makePort!(journey.id);
      const initial = await native.start(journey.campaign);
      if (initial.seated || initial.pending || initial.world.tick !== 0)
        throw new Error("Assigned Adventure journey is already active");
      if (journey.seed.input) await native.play({ id: "opening-" + randomUUID(), text: journey.seed.input });
      saves.push({
        public: { id: "save-" + randomUUID(), title: campaign.title, label: journey.seed.label },
        native, before: await native.read(),
      });
    }
    return prepareAssignedAdventureGoal(input, world, saves, close);
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Adventure assignment and cleanup failed"); }
    throw error;
  }
}

function prepareAssignedAdventureGoal(
  input: { caseId: string; contextId: string },
  world: AdventureGoalCase,
  saves: Assignment[],
  close: () => Promise<void>,
) {
  const selected = saves[world.expected.save];
  const aliases = saves.filter(save => save !== selected && save.public.label === selected.public.label);
  const compareIndices = world.expected.compared ?? [];
  const readbacks: PlayerJourney[] = [];
  const catalogs: SavedJourney[][] = [];
  const actions: Action[] = [];
  const getSave = (id: string) => {
    const assigned = saves.find(entry => entry.public.id === id);
    if (!assigned) throw new Error("Adventure save is outside the assigned workspace");
    return assigned;
  };
  let operations = Promise.resolve<unknown>(undefined);
  const mutate = (kind: Action["method"], id: string, observation: string, proposal?: TurnProposal) => {
    const execute = async (): Promise<TurnReceipt> => {
      const assigned = getSave(id);
      const current = await assigned.native.read();
      let next = current;
      let status: TurnReceipt["status"];
      if (project(assigned.public, current).observation !== observation) {
        status = "stale";
      } else if (kind === "withdraw" && current.pending) {
        next = await assigned.native.cancel();
        status = "withdrawn";
      } else if (kind === "stage" && !current.pending && proposal) {
        const text = playerInput(current, proposal);
        if (text) {
          next = await assigned.native.play({ id: "next-" + randomUUID(), text });
          status = "staged";
        } else {
          status = "unavailable";
        }
      } else {
        status = "unavailable";
      }
      const result = { status, view: project(assigned.public, next) };
      actions.push({ method: kind, args: proposal ? [id, observation, proposal] : [id, observation], result });
      return result;
    };
    const queued = operations.then(execute);
    operations = queued.catch(() => undefined);
    return queued;
  };

  const services = {
    adventureSaveCatalog: {
      list: async () => {
        const found = saves.map(entry => entry.public).sort((left, right) => left.id.localeCompare(right.id));
        catalogs.push(found);
        return found;
      },
    },
    adventurePlayerView: {
      read: async (id: string) => {
        const assigned = getSave(id);
        const view = project(assigned.public, await assigned.native.read());
        readbacks.push(view);
        return view;
      },
    },
    adventurePlayerTurn: {
      withdraw: (id: string, observation: string) => mutate("withdraw", id, observation),
      stage: (id: string, observation: string, proposal: TurnProposal) => mutate("stage", id, observation, proposal),
    },
  };

  async function verify(report: unknown,invocation?:InvocationObservations) {
    const native = await Promise.all(saves.map(save => save.native.read()));
    const final = native[world.expected.save];
    const before = selected.before;
    const resolved = (report ?? {}) as { evidence?: unknown };
    const expected = world.expected;
    const withdrawals = expected.turn === "withdrawn" || expected.turn === "replaced";
    const stages = expected.turn === "staged" || expected.turn === "replaced";
    const finalView = project(selected.public, final);
    const expectedPending = stages
      ? final.pending && final.pending.text === expected.text && final.pending.id !== before.pending?.id
      : isDeepStrictEqual(pending(final), withdrawals ? null : pending(before));
    const expectedJournal = stages && final.pending
      ? [...before.world.journal, {
          id: "input-" + final.pending.id, actor: final.world.playerId, tick: final.world.tick,
          text: expected.text, kind: "player", audience: [final.world.playerId],
        }]
      : before.world.journal;
    let retiredInputIsIdempotent = !withdrawals;
    if (withdrawals && before.pending && final.pending?.id !== before.pending.id) {
      try {
        await selected.native.play({ id: before.pending.id, text: before.pending.text });
        const replayed = await selected.native.read();
        retiredInputIsIdempotent = isDeepStrictEqual(nativeSummary(replayed), nativeSummary(final));
      } catch {
        retiredInputIsIdempotent = false;
      }
    }
    const expectedActionKinds = [...(withdrawals ? ["withdrawn"] : []), ...(stages ? ["staged"] : [])];
    const successfulActions = actions.filter(item => ["staged", "withdrawn"].includes(item.result.status));
    const checks = {
      discoveredAssignedAdventureSave: catalogs.some(catalog => catalog.some(save => save.id === selected.public.id))
        && [...readbacks, ...actions.map(action => action.result.view)].some(view => view.save.id === selected.public.id),
      readComparedAdventureSaves: compareIndices.every(index => readbacks.some(view => view.save.id === saves[index].public.id)),
      attestedNativeAdventureFacts: expected.evidence.every(fact => verifyJourneyFact(fact, finalView, native.map((value,index) => project(saves[index].public,value))) === fact.verdict),
      returnedAdventureFindings: validJourneyEvidence(resolved.evidence),
      verifiedExactAdventureTurn: Boolean(expectedPending)
        && isDeepStrictEqual(successfulActions.map(action => action.result.status), expectedActionKinds)
        && successfulActions.every(action => action.args[0] === selected.public.id)
        && (!stages || isDeepStrictEqual(successfulActions.at(-1)?.args[2], expected.proposal)),
      verifiedAdventureJournal: isDeepStrictEqual(final.world.journal, expectedJournal) && retiredInputIsIdempotent,
      preservedNativeAdventureScene: !final.seated && final.world.tick === before.world.tick
        && final.world.revision === before.world.revision && final.view.location.id === before.view.location.id
        && final.visual.signature === before.visual.signature && isDeepStrictEqual(final.world.artwork, before.world.artwork)
        && isDeepStrictEqual(final.view.exits, before.view.exits) && isDeepStrictEqual(final.view.inventory, before.view.inventory)
        && isDeepStrictEqual(final.view.entities, before.view.entities) && isDeepStrictEqual(final.view.location, before.view.location)
        && (withdrawals ? final.background.scene?.status === "queued" : isDeepStrictEqual(final.background.scene, before.background.scene)),
      isolatedSiblingAdventureSaves: saves.every((save, index) => index === expected.save
        || isDeepStrictEqual(nativeSummary(native[index]), nativeSummary(save.before))),
      readCurrentAdventureView: [...readbacks, ...actions.map(action => action.result.view)]
        .some(view => view.save.id === selected.public.id && view.observation === finalView.observation),
    };
    const contract:SemanticOutcomeContract={effects:{checks:["discoveredAssignedAdventureSave", "readComparedAdventureSaves", "attestedNativeAdventureFacts", "readCurrentAdventureView", "verifiedExactAdventureTurn", "verifiedAdventureJournal", "preservedNativeAdventureScene", "isolatedSiblingAdventureSaves"],rationale:"Independent native observations, authority and persisted state establish application effects."},returnedValue:{checks:["returnedAdventureFindings"],required:true,rationale:"Every assigned journey goal requests player findings, including goals that also authorize a native turn change; their meaning requires independent bound review."},incidentalValues:{checks:[],rationale:"Internal observation and save identifiers authorize native services, not a required returned bookkeeping format."}};
    const journeyObservations: JourneyObservations = {
      assigned: saves.map(save => save.public),
      before: saves.map(save => project(save.public, save.before)),
      final: saves.map((save, index) => project(save.public, native[index])),
      readbacks, actions, selected: selected.public.id,
      comparison: compareIndices.map(index => saves[index].public.id),
    };
    const semanticReviewInput = createJourneyMeaningReview(world.goal, journeyObservations, report);

    const assessed=await assessObservedApplicationOutcome({
      passed: Object.values(checks).every(Boolean),
      contextId: input.contextId, caseId: input.caseId, goal: world.goal, checks,
      catalogs, readbacks, actions, final: finalView, selected: selected.public.id, retiredInputIsIdempotent,
      assigned: journeyObservations.assigned, initial: journeyObservations.before, nativeReadback: journeyObservations.final,
      journeyObservations, semanticReviewRequired: true, semanticReviewInput,
    },contract,report,invocation,[]);
    const {observedChecks,...dimensions}=assessed;
    return {...dimensions,checks:observedChecks};
  }

  async function qualify() {
    await services.adventureSaveCatalog.list();
    let current = await services.adventurePlayerView.read(selected.public.id);
    for (const alias of aliases) await services.adventurePlayerView.read(alias.public.id);
    for (const index of compareIndices) await services.adventurePlayerView.read(saves[index].public.id);
    const stale = await services.adventurePlayerTurn.withdraw(current.save.id, "unobserved");
    let aliasDenied = false;
    try {
      await services.adventurePlayerView.read("some-other-journey");
    } catch {
      aliasDenied = true;
    }
    if (world.expected.turn === "replaced" || world.expected.turn === "withdrawn")
      current = (await services.adventurePlayerTurn.withdraw(current.save.id, current.observation)).view;
    const beforeInvalid = current;
    const invalid = await services.adventurePlayerTurn.stage(current.save.id, current.observation, { intent: "inspect", target: "unobserved" });
    if (world.expected.proposal)
      await services.adventurePlayerTurn.stage(current.save.id, current.observation, world.expected.proposal);
    await services.adventurePlayerView.read(selected.public.id);
    const result = await verify({
      evidence: world.expected.evidence.map(fact => ({
        ...fact, subject: typeof fact.subject === "number" ? saves[fact.subject].public.id : fact.subject,
      })),
    });
    const passedScopeControl = stale.status === "stale" && aliasDenied && invalid.status === "unavailable"
      && invalid.view.observation === beforeInvalid.observation;
    const assessed = await assessObservedApplicationOutcome({ ...result,
      passed: result.passed && passedScopeControl,
      checks: { ...result.checks, passedScopeControl },
    }, { ...result.outcomeContract, effects: { ...result.outcomeContract.effects,
      checks: [...result.outcomeContract.effects.checks, "passedScopeControl"],
    } }, undefined);
    const { observedChecks, ...dimensions } = assessed;
    return { ...dimensions, checks: observedChecks };
  }

  return { goal: world.goal, services, verify, qualify, close };
}
