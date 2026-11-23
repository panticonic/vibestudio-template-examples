import {regencyAssignment} from "natlang:services";
import type {RegencyIndex} from "./types.js";
/** Identify the exact privately assigned Regency realm and installed route names. */
export default async function findRegencyRealm():Promise<RegencyIndex>{
 return regencyAssignment.list();
}
