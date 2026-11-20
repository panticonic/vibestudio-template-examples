import type { Horizon, RegencyAdvance, RegencyForecast, RegencyIndex, RegencyNote, RegencyReport, RegencySnapshot } from "./types.js";

declare module "natlang:services" {
  export const regencyAssignment: { list():Promise<RegencyIndex> };
  export const regencySaved: { read(realm:string):Promise<RegencySnapshot|null> };
  export const regencyForecast: { preview(realm:string,basis:string,months:Horizon):Promise<RegencyForecast|null> };
  export const regencyAdvance: { commit(realm:string,basis:string,months:Horizon):Promise<RegencyAdvance|null> };
  export const regencyNote: { stage(report:RegencyReport):Promise<RegencyNote|null> };
}
