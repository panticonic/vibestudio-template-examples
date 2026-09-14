import asset0 from "./assets/foundations/elin.png";
import asset1 from "./assets/foundations/tomas.png";
import asset2 from "./assets/foundations/landing.png";
import asset3 from "./assets/foundations/customs.png";
import asset4 from "./assets/foundations/quay.png";
import opening from "./assets/foundations/landing.png";
export const artwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"elin": asset0, "tomas": asset1},
  places: {"landing": asset2, "customs": asset3, "quay": asset4},
  opening,
};
