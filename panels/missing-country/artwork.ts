import asset0 from "./assets/foundations/ada.webp";
import asset1 from "./assets/foundations/ilyan.webp";
import asset2 from "./assets/foundations/vesper.webp";
import asset3 from "./assets/foundations/vestibule.webp";
import asset4 from "./assets/foundations/salon.webp";
import asset5 from "./assets/foundations/square.webp";
import opening from "./assets/foundations/opening.webp";
export const artwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"ada": asset0, "ilyan": asset1, "vesper": asset2},
  places: {"vestibule": asset3, "salon": asset4, "square": asset5},
  opening,
};
