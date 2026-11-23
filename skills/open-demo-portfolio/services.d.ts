declare module "natlang:services" {
  export const demoPortfolioIndex: { list():Promise<import("./types.js").PortfolioIndex> };
  export const demoPortfolioState: { read(portfolio:string):Promise<import("./types.js").PortfolioFrame|null> };
  export const demoPortfolioForecast: { preview(portfolio:string,basis:string,months:import("./types.js").Horizon):Promise<import("./types.js").PortfolioProjection|null> };
  export const demoPortfolioHandoff: { stage(report:import("./types.js").PortfolioReport):Promise<import("./types.js").PortfolioNote|null> };
}
