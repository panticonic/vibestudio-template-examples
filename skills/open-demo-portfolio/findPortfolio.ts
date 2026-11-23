import {demoPortfolioIndex} from "natlang:services";
import type {PortfolioIndex} from "./types.js";
/** Resolve the assigned paired Grimoire estate and Regency realm. */
export default async function findPortfolio():Promise<PortfolioIndex>{
 return demoPortfolioIndex.list();
}
