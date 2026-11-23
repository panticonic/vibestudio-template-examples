declare module "natlang:services" {
  export const gardenRead: { observe(): Promise<import("./types.js").GardenObservations> };
  export const adventureRead: { observe(): Promise<import("./types.js").AdventureObservations> };
  export const adventureTransitionRead: {
    observe(): Promise<import("./types.js").AdventureTransitionObservations>;
  };
  export const realmRead: {
    observe(months: number): Promise<import("./types.js").RealmObservations>;
  };
}
