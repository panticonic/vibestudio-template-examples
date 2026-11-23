declare module "natlang:services" {
  export const adventureSaveCatalog: {
    list(): Promise<import("./types.js").SavedJourney[]>;
  };
  export const adventurePlayerView: {
    read(save: string): Promise<import("./types.js").PlayerJourney>;
  };
  export const adventurePlayerTurn: {
    stage(save: string, observation: string, proposal: import("./types.js").TurnProposal): Promise<import("./types.js").TurnReceipt>;
    withdraw(save: string, observation: string): Promise<import("./types.js").TurnReceipt>;
  };
}
