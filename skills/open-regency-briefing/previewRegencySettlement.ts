import {regencyForecast} from "natlang:services";
import type {Horizon, RegencyForecast} from "./types.js";
/** Ask the installed Regency worker for a read-only projection on one exact persisted basis. */
export default async function previewRegencySettlement(realm: string, basis: string, months: Horizon):Promise<RegencyForecast | null>{
 return regencyForecast.preview(realm, basis, months);
}
