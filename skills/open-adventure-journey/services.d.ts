import type { PlayerJourney, SavedJourney, TurnProposal, TurnReceipt } from "./types.js";

declare module "natlang:services" {
  export const adventureSaveCatalog: {
    list(): Promise<SavedJourney[]>;
  };
  export const adventurePlayerView: {
    read(save: string): Promise<PlayerJourney>;
  };
  export const adventurePlayerTurn: {
    stage(save: string, observation: string, proposal: TurnProposal): Promise<TurnReceipt>;
    withdraw(save: string, observation: string): Promise<TurnReceipt>;
  };
}
