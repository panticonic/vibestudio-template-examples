import {expect,it,vi} from "vitest";
import {createWorldAPI,initialWorld,type Campaign,type ServiceView} from "@workspace/adventure-engine";
import {prepareOpenAdventureGoal,type AdventureGoalCase} from "./index.js";
vi.mock("@workspace/runtime",()=>({workers:{}}));
vi.mock("@workspace-workers/adventure-world/contract",()=>({adventureWorldRpcMethods:[]}));
vi.mock("./owned-player.js",()=>({openOwnedAdventurePlayer:()=>{throw Error("Component tests must not start a UI");}}));
export function fixture(world:AdventureGoalCase){
 const states:ServiceView[]=[];
 const prepared=prepareOpenAdventureGoal({caseId:world.id,contextId:"actual-test-context"},world,()=>{
  let state:ServiceView;const seen=new Set<string>();
  const read=async()=>structuredClone({...state,view:createWorldAPI(state.world,state.world.playerId).observe()});
  return {start:async(campaign:Campaign)=>{const native=initialWorld(campaign),view=createWorldAPI(native,native.playerId).observe();
   state={world:native,view,pending:null,background:{scene:null},visual:{signature:JSON.stringify(view),fresh:false},seated:false,neededSeats:[]};states.push(state);return read();},read,
   play:async({id,text})=>{if(seen.has(id))return read();seen.add(id);state.pending={id,text,phase:"player",replies:[],participants:[],attempt:0};state.world.journal.push({id:"input-"+id,actor:state.world.playerId,tick:state.world.tick,text,kind:"player",audience:[state.world.playerId]});return read();},
   cancel:async()=>{state.pending=null;state.background.scene={id:"scene",placeId:state.view.location.id,signature:state.visual.signature,status:"queued"};return read();}};
 });return {prepared,states};
}
const continuity:AdventureGoalCase={id:"postal-image-continuity",campaign:"dead-letter-office",
 goal:"Compare Front Steps with Counter. Are they the same scene at the same fictional time, and can Front Steps be a painted reference? Leave both alone.",
 saves:[{label:"Counter",place:"customs"},{label:"Front Steps"}],expected:{save:1,compared:[0],turn:"preserved",evidence:[{topic:"same-scene",subject:0,verdict:"refuted"},{topic:"same-time",subject:0,verdict:"confirmed"},{topic:"scene",subject:"landing",verdict:"refuted"}]}};
const answer={evidence:[{topic:"same-scene",subject:"Front Steps and Counter",verdict:"refuted"},{topic:"same-time",subject:"Front Steps and Counter",verdict:"confirmed"},{topic:"scene",subject:"Front Steps current illustration",verdict:"refuted"}]};
async function observed(world=continuity){const f=fixture(structuredClone(world)),p=await f.prepared;const saves=await p.services.adventureSaveCatalog.list();for(const save of saves)await p.services.adventurePlayerView.read(save.id);return {...f,p,saves};}
it("retains actual human-labelled comparison findings without opaque receipt echoes",async()=>{
 const {p}=await observed();const proof=await p.verify(answer);expect(proof.passed).toBe(true);expect(proof.semanticReviewRequired).toBe(true);
 expect(proof.semanticReviewInput.actual.requestedReturn).toEqual(answer);expect(proof.outcomeDimensions.returnedValue.required).toBe(true);
 expect(proof.journeyObservations.before[0].place.id).toBe("customs");expect(proof.journeyObservations.before[1].place.id).toBe("landing");
 expect(proof.semanticReviewInput.expected).toEqual({goal:continuity.goal,requestedReturnRequired:true});
});
it("allows additional supported findings and requires independent review of their meaning",async()=>{
 const {p}=await observed();const report={evidence:[...answer.evidence,{topic:"same-place",subject:"both bookmarks",verdict:"refuted"}]};
 const proof=await p.verify(report);expect(proof.passed).toBe(true);expect(proof.semanticReviewInput.actual.requestedReturn).toEqual(report);expect(proof.semanticReviewRequired).toBe(true);
});
it.each([undefined,{evidence:[]},{evidence:[{topic:"scene",subject:"Front Steps",verdict:"invented"}]}])("rejects missing or malformed requested findings %#",async report=>{
 const {p}=await observed();const proof=await p.verify(report);expect(proof.passed).toBe(false);expect(proof.outcomeDimensions.returnedValue.required).toBe(true);expect(proof.checks.returnedAdventureFindings).toBe(false);
});
it("keeps semantic falsehoods bound to their actual bytes for required review",async()=>{
 const {p}=await observed();const wrong={evidence:[{topic:"scene",subject:"Front Steps current illustration",verdict:"confirmed"}]};const proof=await p.verify(wrong);
 expect(proof.semanticReviewRequired).toBe(true);expect(proof.semanticReviewInput.actual.requestedReturn).toEqual(wrong);expect(proof.journeyObservations.final[1].scene.artwork).toBe("missing");
});
it("requires the comparison actually requested by the user",async()=>{
 const f=fixture(continuity),p=await f.prepared;const saves=await p.services.adventureSaveCatalog.list();const selected=saves.find(save=>save.label==="Front Steps")!;await p.services.adventurePlayerView.read(selected.id);
 expect((await p.verify(answer)).checks.readComparedAdventureSaves).toBe(false);
});
it("does not prescribe inspecting every unrelated same-labelled alias",async()=>{
 const world:AdventureGoalCase={id:"chosen-save",campaign:"dead-letter-office",goal:"On the landing copy of Rain Check, is the letter carried? Leave the plan alone.",saves:[{label:"Rain Check",place:"customs"},{label:"Rain Check"}],expected:{save:1,turn:"preserved",evidence:[{topic:"carried",subject:"mara-letter",verdict:"confirmed"}]}};
 const f=fixture(world),p=await f.prepared;await p.services.adventureSaveCatalog.list();
 const initial=await p.verify({evidence:[{topic:"carried",subject:"letter",verdict:"confirmed"}]});
 await p.services.adventurePlayerView.read(initial.assigned[1].id);
 const proof=await p.verify({evidence:[{topic:"carried",subject:"letter to Mara",verdict:"confirmed"}]});expect(proof.passed).toBe(true);expect(proof.readbacks).toHaveLength(1);
});
it("rejects native world changes and corruption of an unselected save",async()=>{
 for(const index of [0,1]){const {p,states}=await observed();states[index].world.tick++;const proof=await p.verify(answer);expect(proof.passed).toBe(false);expect(index===0?proof.checks.isolatedSiblingAdventureSaves:proof.checks.preservedNativeAdventureScene).toBe(false);}
});
it("a preserve goal cannot lose its pending plan through a null withdrawal",async()=>{
 const world:AdventureGoalCase={id:"preserve-plan",campaign:"dead-letter-office",goal:"Is the letter carried? Keep my unfinished plan.",saves:[{label:"Rain Check",input:"Watch the window."}],expected:{save:0,turn:"preserved",evidence:[{topic:"carried",subject:"mara-letter",verdict:"confirmed"}]}};
 const {p,saves}=await observed(world);const view=await p.services.adventurePlayerView.read(saves[0].id);await p.services.adventurePlayerTurn.withdraw(view.save.id,view.observation);
 const proof=await p.verify({evidence:[{topic:"carried",subject:"letter",verdict:"confirmed"}]});expect(proof.checks.verifiedExactAdventureTurn).toBe(false);expect(proof.passed).toBe(false);
});
it("authorized mutations still require the user's requested findings",async()=>{
 const world:AdventureGoalCase={id:"inspect-lamp",campaign:"dead-letter-office",goal:"Leave a plan to inspect the lamp and tell me whether I carry the extra canvas.",saves:[{label:"Spare Canvas"}],expected:{save:0,turn:"staged",proposal:{intent:"inspect",target:"harbour-lamp"},text:"I'd like to take a closer look at The harbour lamp.",evidence:[{topic:"carried",subject:"canvas-cover",verdict:"refuted"}]}};
 const {p,saves}=await observed(world);const current=await p.services.adventurePlayerView.read(saves[0].id);await p.services.adventurePlayerTurn.stage(current.save.id,current.observation,world.expected.proposal!);
 const proof=await p.verify(undefined);expect(proof.checks.verifiedExactAdventureTurn).toBe(true);expect(proof.checks.readCurrentAdventureView).toBe(true);expect(proof.outcomeDimensions.returnedValue.required).toBe(true);expect(proof.passed).toBe(false);
});

it("qualification retains scope controls in the shared normalized effects contract",async()=>{
 const f=fixture(continuity),p=await f.prepared;const proof=await p.qualify();expect(proof.passed).toBe(true);expect(proof.checks.passedScopeControl).toBe(true);expect(proof.outcomeContract.effects.checks).toContain("passedScopeControl");expect(proof.outcomeDimensions.effects.passed).toBe(true);
});

it("represents requested action occurrence as an open proposition rather than a receipt echo",async()=>{
 const world:AdventureGoalCase={id:"action-question",campaign:"dead-letter-office",goal:"Plan to inspect the lamp and tell me whether the closer look has already happened.",saves:[{label:"Lamp plan"}],expected:{save:0,turn:"staged",proposal:{intent:"inspect",target:"harbour-lamp"},text:"I'd like to take a closer look at The harbour lamp.",evidence:[{topic:"visible",subject:"harbour-lamp",verdict:"confirmed"}]}};
 const {p,saves}=await observed(world);const current=await p.services.adventurePlayerView.read(saves[0].id);await p.services.adventurePlayerTurn.stage(current.save.id,current.observation,world.expected.proposal!);
 const report={evidence:[{topic:"Whether the requested closer look has already happened",subject:"the harbour lamp inspection",verdict:"refuted"}]};
 const proof=await p.verify(report);expect(proof.passed).toBe(true);expect(proof.semanticReviewRequired).toBe(true);expect(proof.semanticReviewInput.actual.requestedReturn).toEqual(report);expect(proof.final.pending).not.toBeNull();expect(proof.final.tick).toBe(current.tick);
});
it("still rejects empty proposition names",async()=>{const {p}=await observed();const proof=await p.verify({evidence:[{topic:" ",subject:"Front Steps",verdict:"confirmed"}]});expect(proof.checks.returnedAdventureFindings).toBe(false);});
