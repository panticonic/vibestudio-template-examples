import {demoPortfolioState} from "natlang:services";
import type {PortfolioFrame} from "./types.js";
/** Read both native applications and the assigned current acceptance card. */
export default async function readPortfolioFrame(portfolio: string):Promise<PortfolioFrame | null>{
 return demoPortfolioState.read(portfolio);
}
