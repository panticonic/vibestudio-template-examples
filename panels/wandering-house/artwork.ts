import asset0 from "./assets/foundations/porter.webp";
import asset1 from "./assets/foundations/saffron.webp";
import asset2 from "./assets/foundations/vale.webp";
import asset3 from "./assets/foundations/lobby.webp";
import asset4 from "./assets/foundations/conservatory.webp";
import asset5 from "./assets/foundations/engine-room.webp";
import asset6 from "./assets/foundations/guest-room.webp";
import opening from "./assets/foundations/opening.webp";
export const artwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"porter": asset0, "saffron": asset1, "vale": asset2},
  places: {"lobby": asset3, "conservatory": asset4, "engine-room": asset5, "guest-room": asset6},
  opening,
};
