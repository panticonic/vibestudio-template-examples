import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";

export interface GrimoireAgentReceiver {
  receiveMoment(input: {
    channelId: string;
    steeringId: string;
  }): Promise<{ ok: boolean }>;
}

export const grimoireAgentRpcMethods =
  createReceiverRpcMethods<GrimoireAgentReceiver>(["receiveMoment"]);
