import { beforeEach, expect, it, vi } from "vitest";
import type { Campaign } from "@workspace/adventure-engine";
import { openOwnedAdventurePlayer } from "./owned-player.js";

const mocks = vi.hoisted(() => ({ openPanel: vi.fn(), status: vi.fn(), resolveRepository: vi.fn(), readFile: vi.fn(), edit: vi.fn() }));
vi.mock("@workspace/runtime", () => ({
  contextId: "owned-context",
  openPanel: mocks.openPanel,
  vcs: { status: mocks.status, resolveRepository: mocks.resolveRepository, readFile: mocks.readFile, edit: mocks.edit },
}));

const contextId = "owned-context";
const campaign = "dead-letter-office";
const id = "natlang-adventure-a662e54f-f389-4d1f-beda-118b6b3fb7d9";
const journeys = [{ id, campaign: { id: campaign } as Campaign }];
const source = "panels/" + campaign;
const marker = '[data-owned-adventure-player="ready"]';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.status.mockResolvedValue({ workingHead: { kind: "event", eventId: "head" } });
  mocks.resolveRepository.mockResolvedValue({ repositoryId: "owned-repository" });
  mocks.readFile.mockResolvedValue({ fileId: "entry", content: { kind: "text", text: "original entry" } });
  mocks.edit.mockResolvedValue({ changeIds: ["owned-change"] });
});

function panel({ attached = true, attemptId = "owned-attempt" } = {}) {
  const actual = { contextId, source, requestedRef: "ctx:" + contextId, attemptId: "owned-attempt", buildKey: "owned-build" };
  const archive = vi.fn().mockResolvedValue(undefined);
  const page = {
    close: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ tick: 0 }),
    waitForSelector: vi.fn(async (selector: string, options: { state?: string } = {}) => {
      expect(selector).toBe(marker);
      if (!attached || options.state !== "attached") throw new Error("The blank player marker does not satisfy this readiness check");
      return {};
    }),
  };
  mocks.openPanel.mockResolvedValue({ id: "owned-panel", archive, observe: vi.fn().mockResolvedValue(actual),
    cdp: { session: async () => ({ page, receipt: { generation: { panelId: "owned-panel", attemptId, buildKey: "owned-build" } } }) },
  });
  return { page, archive };
}

it("opens on attachment of a blank marker and evaluates only the assigned player save", async () => {
  const { page, archive } = panel();
  const player = await openOwnedAdventurePlayer(contextId, campaign, journeys);
  expect(page.waitForSelector).toHaveBeenCalledWith(marker, { state: "attached" });
  expect(mocks.openPanel).toHaveBeenCalledWith(source, { contextId, ref: "ctx:" + contextId, focus: false, parentId: null });
  await expect(player.start("foreign-save")).rejects.toThrow("outside the assigned player runtime");
  expect(page.evaluate).not.toHaveBeenCalled();
  await expect(player.start(id)).resolves.toEqual({ tick: 0 });
  expect(page.evaluate).toHaveBeenCalledWith('window.__ownedAdventurePlayer["start"](...' + JSON.stringify([id]) + ')');
  await player.close();
  expect(page.close).toHaveBeenCalledOnce();
  expect(archive).toHaveBeenCalledOnce();
});

it("cleans up when the blank readiness marker never attaches", async () => {
  const { page, archive } = panel({ attached: false });
  await expect(openOwnedAdventurePlayer(contextId, campaign, journeys)).rejects.toThrow("does not satisfy this readiness check");
  expect(page.evaluate).not.toHaveBeenCalled();
  expect(page.close).toHaveBeenCalledOnce();
  expect(archive).toHaveBeenCalledOnce();
});

it("rejects a stale player generation even after the marker attaches", async () => {
  const { page, archive } = panel({ attemptId: "stale-attempt" });
  await expect(openOwnedAdventurePlayer(contextId, campaign, journeys)).rejects.toThrow("unexpected panel generation");
  expect(page.evaluate).not.toHaveBeenCalled();
  expect(page.close).toHaveBeenCalledOnce();
  expect(archive).toHaveBeenCalledOnce();
});
