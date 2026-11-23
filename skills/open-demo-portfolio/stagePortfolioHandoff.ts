import {demoPortfolioHandoff} from "natlang:services";
import type {PortfolioNote, PortfolioReport} from "./types.js";
/** Write one authorized private readiness or diagnostic handoff. */
export default async function stagePortfolioHandoff(report: PortfolioReport):Promise<PortfolioNote | null>{
 return demoPortfolioHandoff.stage(report);
}
