declare module "natlang:services" {
  export const regencyAssignment: { list():Promise<import("./types.js").RegencyIndex> };
  export const regencySaved: { read(realm:string):Promise<import("./types.js").RegencySnapshot|null> };
  export const regencyForecast: { preview(realm:string,basis:string,months:import("./types.js").Horizon):Promise<import("./types.js").RegencyForecast|null> };
  export const regencyAdvance: { commit(realm:string,basis:string,months:import("./types.js").Horizon):Promise<import("./types.js").RegencyAdvance|null> };
  export const regencyNote: { stage(report:import("./types.js").RegencyReport):Promise<import("./types.js").RegencyNote|null> };
}
