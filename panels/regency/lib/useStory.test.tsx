// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useStory } from "./useStory.js";
const mocks = vi.hoisted(() => ({ clients: new Map<string, any>() }));
vi.mock("./client.js", () => ({
  StoryClient: class {
    constructor(key: string) {
      return mocks.clients.get(key);
    }
  },
}));
afterEach(cleanup);
it("keeps the current world's state and action lock when a previous world finishes", async () => {
  let finish!: (view: any) => void;
  const previousAction = new Promise((resolve) => {
    finish = resolve;
  });
  const previous = { game: { id: "previous" }, pending: null, seated: true };
  const current = { game: { id: "current" }, pending: null, seated: true };
  const getArt = async (view: any) => view;
  mocks.clients.set("previous", {
    get: async () => previous,
    getArt,
    play: () => previousAction,
  });
  const currentPlay = vi.fn(async () => current);
  mocks.clients.set("current", {
    get: async () => current,
    getArt,
    play: currentPlay,
  });
  const hook = renderHook(({ id }) => useStory(id), {
    initialProps: { id: "previous" },
  });
  await waitFor(() => expect(hook.result.current.view).toEqual(previous));
  let pending!: Promise<boolean>;
  act(() => {
    pending = hook.result.current.play("old wish");
  });
  hook.rerender({ id: "current" });
  await waitFor(() => expect(hook.result.current.view).toEqual(current));
  await act(async () => {
    await hook.result.current.play("new wish");
  });
  expect(currentPlay).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(previous);
    expect(await pending).toBe(false);
  });
  expect(hook.result.current.view).toEqual(current);
  expect(hook.result.current.working).toBe(false);
});
it("shows accepted game state while artwork is pending and keeps it after an art failure", async () => {
  let failArt!: (error: Error) => void;
  const illustration = new Promise((_resolve, reject) => {
    failArt = reject;
  });
  const game = { game: { id: "accepted" }, pending: null, seated: true };
  mocks.clients.set("art", {
    get: async () => game,
    getArt: () => illustration,
  });
  const hook = renderHook(() => useStory("art"));
  await waitFor(() =>
    expect(hook.result.current.view?.game).toEqual(game.game),
  );
  expect(hook.result.current.error).toBeNull();
  await act(async () => {
    failArt(new Error("Illustrations offline"));
  });
  expect(hook.result.current.view).toMatchObject({
    game: game.game,
    artError: "Illustrations offline",
  });
  expect(hook.result.current.error).toBeNull();
});
