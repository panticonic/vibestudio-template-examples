import {adventureTransitionRead} from "natlang:services";
import type {AdventureTransitionObservations} from "../../types.js";
/** Read the committed scene and the corresponding browser observations. */
export default async function readTurn():Promise<AdventureTransitionObservations>{
 return adventureTransitionRead.observe();
}
