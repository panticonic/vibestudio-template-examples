import {regencyAdvance} from "natlang:services";
import type {Horizon, RegencyAdvance} from "./types.js";
/** Make the one authorized calendar advance on the exact saved basis. */
export default async function advanceOwnedRegency(realm: string, basis: string, months: Horizon):Promise<RegencyAdvance | null>{
 return regencyAdvance.commit(realm, basis, months);
}
