import asset0 from "./assets/foundations/mara.png";
import asset1 from "./assets/foundations/ivo.png";
import asset2 from "./assets/foundations/sera.png";
import asset3 from "./assets/foundations/council.png";
import opening from "./assets/foundations/opening.png";
export const regencyArtwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"mara": asset0, "ivo": asset1, "sera": asset2},
  places: {"council": asset3},
  opening,
};
