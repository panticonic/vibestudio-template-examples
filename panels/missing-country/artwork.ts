import asset0 from "./assets/foundations/ada.png";
import asset1 from "./assets/foundations/ilyan.png";
import asset2 from "./assets/foundations/vesper.png";
import asset3 from "./assets/foundations/vestibule.png";
import asset4 from "./assets/foundations/salon.png";
import asset5 from "./assets/foundations/square.png";
import opening from "./assets/foundations/opening.png";
export const artwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"ada": asset0, "ilyan": asset1, "vesper": asset2},
  places: {"vestibule": asset3, "salon": asset4, "square": asset5},
  opening,
};
