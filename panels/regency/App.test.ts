import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("the Regency React panel", () => {
  const app = () => readFileSync(resolve(__dirname, "App.tsx"), "utf8");

  it("is a native React workspace panel with no Svelte runtime", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "package.json"), "utf8"),
    ) as {
      vibestudio: { entry: string };
      dependencies: Record<string, string>;
    };
    expect(manifest.vibestudio.entry).toBe("index.tsx");
    expect(manifest.dependencies["@workspace/react"]).toBe("workspace:*");
    expect(manifest.dependencies.react).toMatch(/^\^19/);
    expect(manifest.dependencies["react-dom"]).toMatch(/^\^19/);
    expect(manifest.dependencies).not.toHaveProperty("svelte");
    expect(manifest.dependencies).not.toHaveProperty("@workspace/svelte");
    expect(app()).toContain("export default function RegencyPanel");
    expect(app()).toContain("usePanelTheme()");
    expect(app()).toContain("useStateArgs<RegencyArgs>()");
    expect(app()).not.toMatch(/\.svelte|@workspace\/svelte|\$state|\$derived/);
  });

  it("preserves the strategic surfaces and world operations", () => {
    const source = app();
    for (const tab of ["realm", "matters", "council", "diplomacy", "chronicle"])
      expect(source).toMatch(new RegExp(`id:\\s*\"${tab}\"`));
    for (const marker of [
      "newGame",
      "seatTheCourt",
      "closeSeason",
      "proceedWithoutPending",
      "sealOrder",
      "decideCrisis",
      "forecast",
      "convene",
      "settlePromise",
      "setMandate",
      "appointProtector",
      "submitOrder",
      "redeliverBriefings",
    ])
      expect(source).toContain(marker);
    for (const visual of [
      "StrategyMap",
      "ProvinceCard",
      "ForecastCard",
      "r-ending",
    ])
      expect(source).toContain(visual);
  });

  it("ships React renderers for every chat card", () => {
    expect(
      readdirSync(resolve(__dirname, "renderers"))
        .filter((name) => name.endsWith(".tsx"))
        .sort(),
    ).toEqual([
      "debate-card.tsx",
      "handover-card.tsx",
      "matter-card.tsx",
      "seal-card.tsx",
      "season-card.tsx",
    ]);
  });

  it("uses typed workspace services and preserves its authority ceiling", () => {
    const client = readFileSync(resolve(__dirname, "lib/client.ts"), "utf8");
    const court = readFileSync(resolve(__dirname, "lib/court.ts"), "utf8");
    expect(client).toContain(
      "workers.durableObjectService(REGENCY_PROTOCOL, gameKey)",
    );
    expect(court).toContain(
      "workers.createDurableObject(CHANNEL_SOURCE, CHANNEL_CLASS",
    );
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "package.json"), "utf8"),
    ) as {
      vibestudio: {
        authority: {
          serviceRequests: Array<{ protocol: string }>;
          requests: Array<{ capability: string }>;
        };
      };
    };
    expect(
      manifest.vibestudio.authority.serviceRequests
        .map(({ protocol }) => protocol)
        .sort(),
    ).toEqual(["examples.regency.v1", "vibestudio.channel.v1"]);
    expect(
      manifest.vibestudio.authority.requests
        .map(({ capability }) => capability)
        .sort(),
    ).toEqual([
      "context.boundary",
      "workspace-service:channel",
      "workspace-service:regency",
      "workspace.runtime-state.inspect",
      "workspace.runtime-state.manage",
    ]);
  });
});

describe("reading the law and the numbers", () => {
  it("tokenises an edict and preserves map geometry", async () => {
    const { edictLines } = await import("./lib/laws.js");
    const lines = edictLines({
      id: "e1",
      title: "Relief",
      when: [{ field: "is_border", op: "==", value: true }],
      then: [{ kind: "grain_dole" }],
      enacted: 0,
      author: "chancellor",
    } as never);
    expect(lines.map((line) => line.lead)).toEqual(["when", "then"]);
    const { snowPath } = await import("./lib/geometry.js");
    expect(snowPath({ x: 10, y: 10, kind: "peak", scale: 1 })).toMatch(/^M/);
  });
});
