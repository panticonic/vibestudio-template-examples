import {regencyNote} from "natlang:services";
import type {RegencyNote, RegencyReport} from "./types.js";
/** Stage one private Regency note supported by exact observed and projected receipts. */
export default async function stageRegencyNote(report: RegencyReport):Promise<RegencyNote | null>{
 return regencyNote.stage(report);
}
