import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";

export type RegencyAgentRole = "storyteller" | "builder" | `person:${string}`;

export interface RegencyAgentReceiver {
  receiveMoment(input: {
    channelId: string;
    steeringId: string;
  }): Promise<{ ok: boolean }>;
}

export const regencyAgentRpcMethods =
  createReceiverRpcMethods<RegencyAgentReceiver>(["receiveMoment"]);
