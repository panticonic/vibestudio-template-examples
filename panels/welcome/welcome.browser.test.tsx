import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
vi.mock("@workspace/react/theme", () => ({
  usePanelTheme: () => "light",
  usePanelThemeConfig: () => ({ accentColor: "blue", grayColor: "slate" }),
}));
vi.mock("@workspace/react/responsive", () => ({
  useIsMobile: () => window.innerWidth < 640,
}));
vi.mock("@workspace/runtime", () => ({
  buildPanelLink: (source: string) => `panel://${source}`,
}));
import Welcome from "./index";
afterEach(cleanup);
it.each([320, 390, 1280])(
  "offers working story entry points and readable setup expectations at %i pixels",
  async (width) => {
    await page.viewport(width, 1000);
    render(<Welcome />);
    expect(screen.getAllByRole("link", { name: /^Begin / })).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: "Begin Grimoire" }).getAttribute("href"),
    ).toBe("panel://panels/grimoire");
    expect(screen.getByText(/connect a model provider/)).toBeTruthy();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 1);
    fireEvent.click(screen.getByText("Build your own panels"));
    expect(
      screen
        .getByRole("link", { name: "Open Svelte example" })
        .getAttribute("href"),
    ).toBe("panel://panels/hello-svelte");
    await page.screenshot({
      path: `/home/werg/vibestudio/.cache/template-review/template-ui-examples-${width}.png`,
    });
  },
);
