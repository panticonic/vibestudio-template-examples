// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createWorldAPI, initialWorld, type ServiceView } from "@workspace/adventure-engine";
import { missingCountry } from "@workspace/adventure-campaigns";
import { AdventurePanel } from "./AdventurePanel.js";

const state = vi.hoisted(() => ({
  game: null as ServiceView | null,
  play: vi.fn(async () => true),
}));
vi.mock("@workspace/runtime", () => ({ panel: {} }));
vi.mock("@workspace/react", () => ({ GeneratedImage: () => <img alt="Illustration" /> }));
vi.mock("./useAdventure.js", () => ({
  useCampaignKey: () => ({ key: "journey", journeys: [] }),
  useAdventure: () => ({ game: state.game, working: false, play: state.play }),
}));
beforeAll(() => {
  // jsdom does not implement the browser's dialog methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const game = (): ServiceView => {
  const world = initialWorld(missingCountry);
  return {
    world,
    view: createWorldAPI(world, world.playerId).observe(),
    pending: null,
    background: { scene: null },
    visual: { signature: "one", fresh: false },
    seated: true,
    neededSeats: [],
  };
};
const panel = () => <AdventurePanel campaign={missingCountry} theme="embassy" />;

describe("readable adventure interludes", () => {
  it("lets the player inspect and draft during a turn, without submitting or losing the draft", async () => {
    state.game = game();
    state.game.pending = {
      id: "turn",
      text: "Hello",
      phase: "participants",
      participants: ["ada"],
      replies: [],
      attempt: 0,
    };
    const view = render(panel());
    const input = screen.getByLabelText("What will you do?") as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "Ask Ada about the railway." } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(state.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Ada Serein/ }));
    expect(screen.getByRole("region", { name: "About Ada Serein" }).textContent).toContain(
      "olive coat"
    );
    expect(screen.getByText("Ada Serein is responding…")).toBeTruthy();
    state.game = { ...state.game, pending: null };
    view.rerender(panel());
    expect(input.value).toBe("Ask Ada about the railway.");
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(state.play).toHaveBeenCalledExactlyOnceWith("Ask Ada about the railway.");
  });

  it("renders story Markdown and keeps illustration progress outside the scene text", () => {
    state.game = game();
    state.game.world.journal.push({
      id: "answer",
      actor: "ada",
      tick: 1,
      kind: "speech",
      text: "Call **City Registry**.\n\n*Bring the records.*",
    });
    state.game.background.scene = {
      id: "art",
      placeId: "vestibule",
      signature: "one",
      status: "painting",
      preparing: ["Ada Serein"],
    };
    const view = render(panel());
    const prose = within(view.container.querySelector(".adventure-prose") as HTMLElement);
    expect(prose.getByText("City Registry").tagName).toBe("STRONG");
    expect(prose.getByText("Bring the records.").tagName).toBe("EM");
    const caption = screen.getByText(/Sketching Ada Serein/);
    expect(caption.closest(".adventure-scene")).toBeNull();
    expect(view.container.querySelector(".adventure-image-wait")?.textContent).toBe("");
    expect(view.container.querySelector(".adventure-prose")?.hasAttribute("tabindex")).toBe(false);
  });
});
