import asset0 from "./assets/foundations/elin.webp";
import asset1 from "./assets/foundations/tomas.webp";
import asset2 from "./assets/foundations/landing.webp";
import asset3 from "./assets/foundations/customs.webp";
import asset4 from "./assets/foundations/quay.webp";
import opening from "./assets/foundations/landing.webp";
export const artwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"elin": asset0, "tomas": asset1},
  places: {"landing": asset2, "customs": asset3, "quay": asset4},
  opening,
};
