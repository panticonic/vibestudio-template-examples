export type Horizon = 1 | 2 | 3;
export type GardenHome = {id:string; values:{key:string;amount:number}[]};
export type GardenResident = {id:string;name:string;home:string;needs:{key:string;amount:number}[];
  energy:number;attachment:number;settled:number;lastVisit:number};
export type GardenState = {id:string;day:number;phase:number;weather:string;homes:GardenHome[];
  residents:GardenResident[];discoveries:{id:string;title:string}[]};
export type RealmRoute = {id:string;subsidy:number;condition:number;progress:number;workers:number;cargo:number|null;capacity:number|null};
export type RealmRegion = {id:string;grain:number;population:number;confidence:number};
export type RealmState = {id:string;month:number;treasury:number;debt:number;income:number;spending:number;
  serviceCost:number;worksCost:number;routes:RealmRoute[];regions:RealmRegion[];borderTension:number|null};
export type GardenCondition = {kind:"meets-needs"|"is-home"|"settled";resident:string;home:string};
export type GardenTransition = {kind:"recognized"|"attachment-grew"|"relocated";resident:string}
  | {kind:"day-advanced"|"phase-advanced"|"weather-changed"|"new-discovery"};
export type RealmCondition = {kind:"subsidy-paid-and-idle"|"cargo-under-capacity"|"crossing-reopened";route:string}
  | {kind:"has-debt"|"net-positive"} | {kind:"region-grain-at-least";region:string;amount:number};
export type RealmTrend = {kind:"route-works-progressed";route:string}
  | {kind:"regional-grain-grew"|"population-fell";region:string} | {kind:"treasury-grew"|"border-tension-grew"};
export type GardenCriterion = {kind:"habitat";check:GardenCondition} | {kind:"transition";check:GardenTransition};
export type RealmCriterion = {kind:"settlement";basis:"saved"|"forecast";check:RealmCondition}
  | {kind:"compare";basis:"saved"|"forecast";check:RealmTrend;assertCommitted:boolean};
export type AcceptanceCard = {title:string;path:string;digest:string;text:string};
export type PortfolioIndex = {id:string;gardenId:string;realmId:string;title:string;allowedHorizons:Horizon[]};
export type PortfolioFrame = {portfolio:string;id:string;garden:GardenState;realm:RealmState;card:AcceptanceCard|null};
export type PortfolioProjection = {portfolio:string;basis:string;months:Horizon;accounts:RealmState};
export type PortfolioPlan = {criteriaBasis:string|null;garden:GardenCriterion[];realm:RealmCriterion[];
  months:Horizon|null;note:"none"|"decision"|"ready-only"};
export type PortfolioFinding = {decision:"supported"|"contradicted"|"not-observed";finding:string;evidenceIds:string[]};
export type GardenResult = {criterion:GardenCriterion;review:PortfolioFinding};
export type RealmResult = {criterion:RealmCriterion;review:PortfolioFinding};
export type PortfolioDecision = {status:"ready"|"blocked"|"incomplete";write:boolean;explanation:string};
export type PortfolioNote = {path:string;digest:string;portfolio:string;basis:string};
export type PortfolioReport = {plan:PortfolioPlan;opening:PortfolioFrame;current:PortfolioFrame;projection:PortfolioProjection|null;
  garden:GardenResult[];realm:RealmResult[];decision:PortfolioDecision;note:PortfolioNote|null};
