import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { AdventureWorldDO } from "./index.js";

export const adventureWorldRpcMethods = createReceiverRpcMethods<
  Pick<AdventureWorldDO, "init" | "getGame" | "setOpeningArtwork" | "setBundledReference" | "registerParticipant" | "play" | "retry" | "cancel" | "participantStopped" | "perspective" | "setReferenceJob" | "publishReference" | "execute" | "finish" | "repair" | "setImageJob" | "withdrawIllustrationJobs" | "publishArtwork" | "illustrationPublication">
>([
  "init", "getGame", "setOpeningArtwork", "setBundledReference", "registerParticipant",
  "play", "retry", "cancel", "participantStopped", "perspective", "setReferenceJob",
  "publishReference", "execute", "finish", "repair", "setImageJob",
  "withdrawIllustrationJobs", "publishArtwork", "illustrationPublication",
]);
