import {adventureSaveCatalog} from "natlang:services";
import type {SavedJourney} from "../../types.js";
/** List the entitled saved journeys in this workspace. */
export default async function listSaves():Promise<SavedJourney[]>{
 return adventureSaveCatalog.list();
}
