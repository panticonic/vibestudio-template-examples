import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
const fixture = vi.hoisted(() => ({
  args: {} as Record<string, string>,
  set: vi.fn(),
  service: vi.fn(),
  worker: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({
  contextId: "ctx",
  rpc: {},
  workers: { durableObjectService: fixture.worker },
  panel: { stateArgs: { patch: fixture.set } },
}));
vi.mock("@workspace/react", () => ({ useStateArgs: () => fixture.args }));
vi.mock("@workspace/living-canvas/react", () => ({
  StoryText: () => null,
  SceneCanvas: () => null,
}));
vi.mock("./Kingdom.js", () => ({ Kingdom: () => null }));
vi.mock("./RealmScene.js", () => ({ RealmScene: () => null }));
import Game from "./App";
afterEach(cleanup);
beforeEach(() => {
  fixture.args = {};
  fixture.set.mockReset();
  fixture.service
    .mockReset()
    .mockRejectedValue(new Error("Story service is unavailable"));
  fixture.worker.mockReset().mockReturnValue({ call: fixture.service });
});
it("owns a distinct world before first launch, retaining its identity after a rejected save", async () => {
  await page.viewport(390, 800);
  fixture.set
    .mockRejectedValueOnce(new Error("Saving this panel was denied"))
    .mockImplementation(async (args: Record<string, string>) => {
      fixture.args = args;
    });
  const view = render(<Game />);
  expect(fixture.worker).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Begin a new story" }));
  await screen.findByRole("alert");
  const proposed = fixture.set.mock.calls[0]![0];
  expect(proposed).toHaveProperty("gameKey");
  fireEvent.click(screen.getByRole("button", { name: "Begin a new story" }));
  await waitFor(() => expect(fixture.set).toHaveBeenCalledTimes(2));
  expect(fixture.set.mock.calls[1]![0]).toEqual(proposed);
  view.rerender(<Game />);
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Story service is unavailable",
  );
  expect(fixture.worker).toHaveBeenLastCalledWith(
    "examples.regency.v1",
    proposed.gameKey,
  );
  expect(screen.queryByRole("textbox")).toBeNull();
});
