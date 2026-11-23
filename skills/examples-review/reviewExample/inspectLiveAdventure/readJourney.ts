import {adventureRead} from "natlang:services";
import type {AdventureObservations} from "../../types.js";
/** Read the assigned actor-visible Adventure scene and its opening baseline. */
export default async function readJourney():Promise<AdventureObservations>{
 return adventureRead.observe();
}
