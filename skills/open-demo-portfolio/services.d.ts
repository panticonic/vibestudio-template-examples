import type { Horizon, PortfolioFrame, PortfolioIndex, PortfolioNote, PortfolioProjection, PortfolioReport } from "./types.js";

declare module "natlang:services" {
  export const demoPortfolioIndex: { list():Promise<PortfolioIndex> };
  export const demoPortfolioState: { read(portfolio:string):Promise<PortfolioFrame|null> };
  export const demoPortfolioForecast: { preview(portfolio:string,basis:string,months:Horizon):Promise<PortfolioProjection|null> };
  export const demoPortfolioHandoff: { stage(report:PortfolioReport):Promise<PortfolioNote|null> };
}
