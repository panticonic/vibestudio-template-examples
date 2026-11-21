import { workers } from "@workspace/runtime";
import { grimoireWorldRpcMethods } from "@workspace-workers/grimoire-world/contract";
import type { Garden } from "@workspace/grimoire-engine";
import type { GardenCheck } from "../examples-review/types.js";
import { exampleReference } from "./oracle.js";
import { gardenReadback } from "./garden-readback.js";
import { openRegencyInstalled } from "./open-regency-owner.js";

export const pairedPortfolioInstalled = {
  realm:openRegencyInstalled,
  garden(id:string) {
    if(!/^natlang-garden-[a-f0-9-]{36}$/u.test(id))throw new Error("Expected one assigned estate");
    const worker=workers.durableObjectService("examples.grimoire.v1",grimoireWorldRpcMethods,id);
    return {
      read:()=>worker.call("getGame"),
      pulse:(id:string)=>worker.call("linger",{id,quiet:true}),
      visit:(residentId:string)=>worker.call("visit",{residentId}),
    };
  },
  readGarden:(id:string,garden:unknown)=>gardenReadback(id,garden as Garden),
  reviewGarden:(review:unknown)=>exampleReference({
    kind:"garden",goal:"Qualify the exact assigned garden criterion",review:review as GardenCheck,
  }),
};
