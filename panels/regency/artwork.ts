import asset0 from "./assets/foundations/mara.webp";
import asset1 from "./assets/foundations/ivo.webp";
import asset2 from "./assets/foundations/sera.webp";
import asset3 from "./assets/foundations/council.webp";
import opening from "./assets/foundations/opening.webp";
export const regencyArtwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"mara": asset0, "ivo": asset1, "sera": asset2},
  places: {"council": asset3},
  opening,
};
