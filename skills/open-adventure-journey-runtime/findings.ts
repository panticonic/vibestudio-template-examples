import type {JourneyEvidence,PlayerJourney,PlayerObject,TurnReceipt} from "../open-adventure-journey/types.js";
export type JourneyFact = Omit<JourneyEvidence,"subject"> & {subject:string|number};
export type JourneyObservations = {
  assigned: PlayerJourney["save"][]; before: PlayerJourney[]; final: PlayerJourney[];
  readbacks: PlayerJourney[]; actions: {method:"stage"|"withdraw";args:unknown[];result:TurnReceipt}[];
  selected:string; comparison:string[];
};
const nativeName = (value:string) => value.toLowerCase().replace(/^the\s+/u,"").replace(/[-\s]+/gu," ").trim();
/** Domain facts use the same canonical player projection live and in archived reassessment. */
export function verifyJourneyFact(fact:JourneyFact, native:PlayerJourney, comparison:PlayerJourney[]):JourneyEvidence["verdict"] {
  const subject=nativeName(String(fact.subject));
  const same=(candidate:string)=>nativeName(candidate)===subject;
  const namesEntity=(entity:PlayerObject)=>same(entity.id)||same(entity.name)||(entity.kind==="person"&&same(entity.name.split(" ")[0]));
  const item=[...native.visible,...native.inventory].find(namesEntity);
  const yn=(value:boolean)=>value?"confirmed":"refuted";
  switch(fact.topic){
    case "place":return yn(fact.subject===native.place.id);
    case "exit":return yn(native.exits.some(({label,destination})=>same(label)||same(destination)));
    case "visible":return yn(Boolean(item));
    case "carried":return yn(native.inventory.some(namesEntity));
    case "open":case "sealed":case "locked":{const exact=item?.[fact.topic];return typeof exact==="boolean"?yn(exact):"unknown";}
    case "contents":return item?.sealed||item?.open!==true?"unknown":yn(native.visible.some(entity=>entity.location===item.id));
    case "scene":return yn(native.scene.artwork==="matched");
    case "same-place":return yn(native.place.id===comparison[Number(fact.subject)].place.id);
    case "same-time":return yn(native.tick===comparison[Number(fact.subject)].tick);
    case "same-scene":return yn(native.scene.signature===comparison[Number(fact.subject)].scene.signature);
  }
}
export function validJourneyEvidence(value:unknown):value is JourneyEvidence[]{
  const topics=new Set(["place","exit","carried","visible","sealed","open","locked","contents","scene","same-place","same-time","same-scene"]);
  return Array.isArray(value)&&value.length>0&&value.every(fact=>fact&&topics.has(fact.topic)&&typeof fact.subject==="string"&&fact.subject.trim().length>0&&["confirmed","refuted","unknown"].includes(fact.verdict));
}
/** No golden claim list or receiver bookkeeping is part of semantic admission. */
export function createJourneyMeaningReview<T extends object>(goal:string,observations:T,requestedReturn:unknown){
 return {actual:{goal,observations,requestedReturn},expected:{goal,requestedReturnRequired:true},
  rubric: "Judge whether the actual returned player findings answer every question in the user's goal, supported by the actual actor-visible readbacks or mutation receipts and independently verified native player snapshots. Accept meaningful entity names, save labels, combined subjects and equivalent fact selections; no opaque subject identifier, exact evidence count, extra report format or tool trajectory is required. Reject false, contradictory, unsupported or missing requested findings. Distinguish same place, fictional time and scene signature; an absent or stale illustration is not a current painted reference. Unspecified properties and inaccessible contents remain unknown. A queued player intention does not move anyone or perform an inspection. Native checks independently establish authorized turn effects and protected sibling/state preservation.",
 };
}
