import { expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@workspace/runtime", () => ({ workers: { durableObjectService: () => native } }));
vi.mock("./realm-readback.js", () => ({ realmReadback: (id: string, state: object) => ({ id, ...state }) }));
import { prepareRealmReview } from "./live-realm.js";
it("replays a native realm snapshot while retaining horizon and current-source guards", async () => {
  let current: any = { pending: false, painting: false, seated: false, game: { world: { month: 0, treasury: 120 } } };
  native.call.mockImplementation(async (name: string) => name === "getGame" ? structuredClone(current) : { basis: current.game.world, forecast: { month: 3, treasury: 150 } });
  const prepared = prepareRealmReview("natlang-realm-11111111-1111-1111-1111-111111111111", { request: { months: 3, goal: "Review the assigned forecast", claims: [] } as never, expected: [], projectedTreasury: 150 });
  const [first, second] = await Promise.all([prepared.services.realmRead.observe(3), prepared.services.realmRead.observe(3)]);
  expect(second).toEqual(first);
  expect(native.call.mock.calls.filter(([name]) => name === "previewSettlement")).toHaveLength(1);
  await expect(prepared.services.realmRead.observe(4)).rejects.toThrow("horizon");
  expect((await prepared.verify(prepared.expected())).passed).toBe(true);
  current = { ...current, changedByOtherOwner: true };
  expect((await prepared.verify(prepared.expected())).passed).toBe(false);
});
