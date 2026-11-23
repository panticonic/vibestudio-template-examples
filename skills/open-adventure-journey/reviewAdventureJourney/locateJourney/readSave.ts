import {adventurePlayerView} from "natlang:services";
import type {PlayerJourney} from "../../types.js";
/** Get the current player-scoped evidence from a discovered save. */
export default async function readSave(save: string):Promise<PlayerJourney>{
 return adventurePlayerView.read(save);
}
