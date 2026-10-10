import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";

/** Cross-worker calls used to deliver and cancel one adventure moment. */
export interface AdventureAgentProtocol {
  receiveMoment(input: {
    channelId: string;
    steeringId: string;
    turnId: string;
  }): Promise<{ ok: true }>;
  cancelMoment(input: {
    channelId: string;
    turnId: string;
  }): Promise<{ ok: true }>;
}

export const adventureAgentRpcMethods = createReceiverRpcMethods<AdventureAgentProtocol>([
  "receiveMoment",
  "cancelMoment",
]);
