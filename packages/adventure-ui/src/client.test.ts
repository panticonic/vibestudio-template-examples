// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialWorld, createWorldAPI, type ServiceView } from "@workspace/adventure-engine";
import { sceneSnapshot, illustrationReferences } from "@workspace/adventure-engine/art";
import { missingCountry } from "@workspace/adventure-campaigns";
import { AdventureClient } from "./client.js";

const mock = vi.hoisted(() => ({call:vi.fn(), importAsset:vi.fn()}));
vi.mock("@workspace/runtime", () => ({contextId:"test",rpc:{},workers:{durableObjectService:()=>({call:mock.call})},images:{importAsset:mock.importAsset}}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); mock.call.mockReset(); mock.importAsset.mockReset(); });
function fixture() {
  const world = initialWorld(missingCountry);
  const view = createWorldAPI(world,world.playerId).observe();
  const game = {world,view,visual:{signature:sceneSnapshot(world).signature,references:{}},neededSeats:[]} as unknown as ServiceView;
  const artwork = {opening:"/opening.webp",places:Object.fromEntries(world.entities.filter(e=>e.kind==="place").map(e=>[e.id,`/${e.id}.webp`])),people:Object.fromEntries(world.entities.filter(e=>e.kind==="person").map(e=>[e.id,`/${e.id}.webp`]))};
  mock.call.mockResolvedValue({});
  mock.importAsset.mockResolvedValue({id:"asset",digest:"digest"});
  const fetch = vi.fn(async (_url: string) => ({ok:true,blob:async()=>new Blob(["image"],{type:"image/webp"})}));
  vi.stubGlobal("fetch",fetch);
  return {game,artwork,fetch,client:new AdventureClient("test",missingCountry,artwork.opening,artwork)};
}
describe("scene-local artwork preparation", () => {
  it("imports only visible identities and opening, single-flighting overlapping polls", async () => {
    const {client,game,fetch} = fixture();
    await Promise.all([client.prepare(game),client.prepare(game)]);
    const expected = illustrationReferences(game.view,game.world.artDirection).map(r=>`/${r.key.split(":")[1]}.webp`);
    expect(fetch.mock.calls.map(c=>c[0]).sort()).toEqual([...expected,"/opening.webp"].sort());
    await client.prepare(game);
    expect(fetch).toHaveBeenCalledTimes(expected.length+1);
  });
  it("does not upload already registered subjects or an established opening", async () => {
    const {client,game,fetch}=fixture();
    game.world.tick=3;
    game.visual.references=Object.fromEntries(illustrationReferences(game.view,game.world.artDirection).map(r=>[r.key,r.signature]));
    await client.prepare(game);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("prepares new places on exploration and retries failed uploads", async () => {
    const {client,game,fetch}=fixture();
    fetch.mockRejectedValueOnce(new Error("temporary"));
    await expect(client.prepare(game)).rejects.toThrow("temporary");
    await client.prepare(game);
    const square=game.world.entities.find(e=>e.id==="square")!;
    game.view={...game.view,location:square,entities:[]};
    game.world.tick=1;
    await client.prepare(game);
    expect(fetch.mock.calls.some(c=>c[0]==="/square.webp")).toBe(true);
  });
});
