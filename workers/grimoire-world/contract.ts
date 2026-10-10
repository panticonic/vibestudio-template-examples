import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { GrimoireWorldDO } from "./index.js";

export const grimoireWorldRpcMethods = createReceiverRpcMethods<
  Pick<GrimoireWorldDO, "artCatalog" | "getArt" | "storeArt" | "reply" | "weave" | "linger" | "visit" | "getGame" | "registerParticipant" | "play" | "perspective" | "stir" | "retry" | "cancel" | "finish">
>([
  "artCatalog", "getArt", "storeArt", "reply", "weave", "linger", "visit", "getGame",
  "registerParticipant", "play", "perspective", "stir", "retry", "cancel", "finish",
]);
