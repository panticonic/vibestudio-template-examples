import { workers } from "@workspace/runtime";
import { regencyRealmRpcMethods } from "@workspace-workers/regency-realm/contract";
import type { World } from "@workspace/regency-engine";
import type { RealmCheck } from "../examples-review/types.js";
import { realmReadback } from "./realm-readback.js";
import { exampleReference } from "./oracle.js";

export const openRegencyInstalled = {
  owner(realm:string) {
    if(!/^natlang-realm-[a-f0-9-]{36}$/u.test(realm))throw new Error("Expected one assigned Regency realm");
    const worker=workers.durableObjectService("examples.regency.v1",regencyRealmRpcMethods,realm);
    return {
      read:()=>worker.call("getGame"),
      preview:(months:1|2|3)=>worker.call("previewSettlement",{months}),
      seat:(targetId:string,channelId:string)=>worker.call("registerParticipant",{role:"storyteller",targetId,channelId}),
      advance:(id:string,months:number)=>worker.call("advance",{id,months}),
      cancel:()=>worker.call("cancel"),
    };
  },
  readback(id:string,world:unknown) { return realmReadback(id,world as World); },
  review(review:unknown) { return exampleReference({kind:"realm",goal:"Qualify exact installed Regency accounts",review:review as RealmCheck}); },
};
