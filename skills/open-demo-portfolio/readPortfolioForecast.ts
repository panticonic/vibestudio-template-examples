import {demoPortfolioForecast} from "natlang:services";
import type {Horizon, PortfolioProjection} from "./types.js";
/** Observe the native Regency projection on the current paired checkpoint. */
export default async function readPortfolioForecast(portfolio: string, basis: string, months: Horizon):Promise<PortfolioProjection | null>{
 return demoPortfolioForecast.preview(portfolio, basis, months);
}
