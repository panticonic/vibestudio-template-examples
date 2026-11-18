import type { GardenObservations } from "./types.js";

declare module "natlang:services" {
  export const gardenRead: { observe(): Promise<GardenObservations> };
}
