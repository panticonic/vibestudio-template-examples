import type {
  AdventureObservations,
  AdventureTransitionObservations,
  GardenObservations,
  RealmObservations,
} from "./types.js";

declare module "natlang:services" {
  export const gardenRead: { observe(): Promise<GardenObservations> };
  export const adventureRead: { observe(): Promise<AdventureObservations> };
  export const adventureTransitionRead: {
    observe(): Promise<AdventureTransitionObservations>;
  };
  export const realmRead: {
    observe(months: number): Promise<RealmObservations>;
  };
}
