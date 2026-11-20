export type Horizon = 1 | 2 | 3;
export type RealmRoute = { id:string; subsidy:number; condition:number; progress:number; workers:number; cargo:number|null; capacity:number|null };
export type RealmRegion = { id:string; grain:number; population:number; confidence:number };
export type RealmReadback = { id:string; month:number; treasury:number; debt:number; income:number; spending:number;
  serviceCost:number; worksCost:number; routes:RealmRoute[]; regions:RealmRegion[]; borderTension:number|null; };
export type RealmCurrentCheck =
  | { kind:"subsidy-paid-and-idle"|"cargo-under-capacity"|"crossing-reopened"; route:string }
  | { kind:"has-debt"|"net-positive" }
  | { kind:"region-grain-at-least"; region:string; amount:number };
export type RealmTrendCheck =
  | { kind:"route-works-progressed"; route:string }
  | { kind:"regional-grain-grew"|"population-fell"; region:string }
  | { kind:"treasury-grew"|"border-tension-grew" };
export type Source = "opening" | "current" | Horizon;
export type RegencyClaim =
  | { kind:"settlement"; source:Source; check:RealmCurrentCheck }
  | { kind:"compare"; from:Source; to:Source; check:RealmTrendCheck; assertCommitted:boolean };
export type RegencyMemo = { path:string; digest:string; basis:string; text:string };
export type RegencyIndex = { realm:string; title:string; originalMonth:number; allowedHorizons:Horizon[]; routes:string[]; regions:string[]; memo:RegencyMemo|null };
export type RegencySnapshot = { realm:string; revision:string; accounts:RealmReadback; pending:string|null };
export type RegencyForecast = { realm:string; basis:string; months:Horizon; accounts:RealmReadback };
export type RegencyPlan = { horizons:Horizon[]; claims:RegencyClaim[]; localNote:boolean; advance:Horizon|null; treasuryFloor:number|null };
export type RealmFinding = { decision:"supported"|"contradicted"|"not-observed"; finding:string; evidenceIds:string[] };
export type RegencyFinding = { claim:RegencyClaim; review:RealmFinding };
export type RegencyDecision = { action:"report"|"hold"|"stage"|"advance"; explanation:string };
export type RegencyAdvance = { id:string; realm:string; basis:string; months:Horizon; committed:RegencySnapshot };
export type RegencyNote = { path:string; digest:string; realm:string; revision:string };
export type RegencyReport = { plan:RegencyPlan; opening:RegencySnapshot; current:RegencySnapshot; forecasts:RegencyForecast[];
  findings:RegencyFinding[]; decision:RegencyDecision; advance:RegencyAdvance|null; note:RegencyNote|null };
