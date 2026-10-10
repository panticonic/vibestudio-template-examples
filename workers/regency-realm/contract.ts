import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { RegencyGameDO } from "./index.js";

export const regencyRealmRpcMethods = createReceiverRpcMethods<
  Pick<RegencyGameDO, "artCatalog" | "getArt" | "storeArt" | "getGame" | "registerParticipant" | "play" | "advance" | "enact" | "proposePolicy" | "executePolicy" | "perspective" | "speak" | "requestDevelopment" | "developWorld" | "visitPlace" | "interactWorld" | "consult" | "invite" | "retry" | "cancel" | "finish">
>([
  "artCatalog", "getArt", "storeArt", "getGame", "registerParticipant", "play", "advance",
  "enact", "proposePolicy", "executePolicy", "perspective", "speak", "requestDevelopment",
  "developWorld", "visitPlace", "interactWorld", "consult", "invite", "retry", "cancel", "finish",
]);
