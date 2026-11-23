import {realmRead} from "natlang:services";
import type {RealmObservations} from "../../types.js";
/** Read the assigned saved settlement and forecast for the requested horizon. */
export default async function readSettlement(months: number):Promise<RealmObservations>{
 return realmRead.observe(months);
}
