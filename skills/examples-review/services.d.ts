import type { AdventureObservations, GardenObservations } from "./types.js";

declare module "natlang:services" {
  export const gardenRead: { observe(): Promise<GardenObservations> };
  export const adventureRead: { observe(): Promise<AdventureObservations> };
}
