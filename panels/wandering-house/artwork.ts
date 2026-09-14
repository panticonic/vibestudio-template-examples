import asset0 from "./assets/foundations/porter.png";
import asset1 from "./assets/foundations/saffron.png";
import asset2 from "./assets/foundations/vale.png";
import asset3 from "./assets/foundations/lobby.png";
import asset4 from "./assets/foundations/conservatory.png";
import asset5 from "./assets/foundations/engine-room.png";
import asset6 from "./assets/foundations/guest-room.png";
import opening from "./assets/foundations/opening.png";
export const artwork: {people: Record<string,string>;places: Record<string,string>;opening:string} = {
  people: {"porter": asset0, "saffron": asset1, "vale": asset2},
  places: {"lobby": asset3, "conservatory": asset4, "engine-room": asset5, "guest-room": asset6},
  opening,
};
