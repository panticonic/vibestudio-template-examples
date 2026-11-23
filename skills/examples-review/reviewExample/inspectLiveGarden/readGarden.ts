import {gardenRead} from "natlang:services";
import type {GardenObservations} from "../../types.js";
/** Read the actual garden observations furnished by the caller. */
export default async function readGarden():Promise<GardenObservations>{
 return gardenRead.observe();
}
