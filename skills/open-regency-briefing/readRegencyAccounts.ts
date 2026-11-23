import {regencySaved} from "natlang:services";
import type {RegencySnapshot} from "./types.js";
/** Read a persisted Regency checkpoint and its own pending-turn status. */
export default async function readRegencyAccounts(realm: string):Promise<RegencySnapshot | null>{
 return regencySaved.read(realm);
}
