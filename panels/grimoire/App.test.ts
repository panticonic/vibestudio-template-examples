import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = () => readFileSync(join(here, "App.tsx"), "utf8");

describe("the Grimoire React panel", () => {
  it("is a native React workspace panel with no Svelte runtime", () => {
    const manifest = JSON.parse(
      readFileSync(join(here, "package.json"), "utf8"),
    ) as {
      vibestudio: { entry: string };
      dependencies: Record<string, string>;
    };
    expect(manifest.vibestudio.entry).toBe("index.tsx");
    expect(manifest.dependencies["@workspace/react"]).toBe("workspace:*");
    expect(manifest.dependencies["react"]).toMatch(/^\^19/);
    expect(manifest.dependencies["react-dom"]).toMatch(/^\^19/);
    expect(manifest.dependencies).not.toHaveProperty("svelte");
    expect(manifest.dependencies).not.toHaveProperty("@workspace/svelte");
    expect(app()).toContain("export default function GrimoirePanel");
    expect(app()).toContain("usePanelTheme()");
    expect(app()).toContain("useStateArgs<GrimoireArgs>()");
    expect(app()).not.toMatch(/\.svelte|@workspace\/svelte|\$state|\$derived/);
  });

  it("preserves every room and the interactive world paths", () => {
    const source = app();
    for (const room of [
      "valley",
      "circle",
      "study",
      "grimoire",
      "spellbook",
      "scry",
      "chapel",
      "spirits",
      "news",
      "green",
    ])
      expect(source).toContain(`id: \"${room}\"`);
    for (const marker of [
      "newEstate",
      "joinEstate",
      "overview",
      "region",
      "speak",
      "recast",
      "release",
      "shelve",
      "addUndone",
      "enterFestival",
      "adorn",
      "seal",
      "address",
      "acknowledgeNews",
      "advance",
    ])
      expect(source).toContain(`\"${marker}\"`);
    expect(source).toContain("panel.stateArgs.set");
    expect(source).toContain("openConversation");
    expect(source).toContain("drawRegion");
    expect(source).toContain("StudyRoom");
  });

  it("uses the typed workspace runtime layers for services and owned channels", () => {
    const client = readFileSync(join(here, "lib", "client.ts"), "utf8");
    const estate = readFileSync(join(here, "lib", "estate.ts"), "utf8");
    expect(client).toContain(
      "workers.durableObjectService(GRIMOIRE_PROTOCOL, estateKey)",
    );
    expect(client).not.toContain("workers.resolveService");
    expect(estate).toContain(
      "workers.createDurableObject(CHANNEL_SOURCE, CHANNEL_CLASS",
    );
  });

  it("declares the complete authority ceiling used by the panel", () => {
    const manifest = JSON.parse(
      readFileSync(join(here, "package.json"), "utf8"),
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
    ).toEqual(["examples.grimoire.v1", "vibestudio.channel.v1"]);
    expect(
      manifest.vibestudio.authority.requests
        .map(({ capability }) => capability)
        .sort(),
    ).toEqual([
      "context.boundary",
      "workspace-service:channel",
      "workspace-service:grimoire",
      "workspace.runtime-state.inspect",
      "workspace.runtime-state.manage",
    ]);
  });

  it("lays out every region of the valley", async () => {
    const { VALLEY_LAYOUT } = await import("./lib/layout.js");
    const { REGION_ORDER } = await import("@workspace/grimoire-engine");
    const placed = new Set(VALLEY_LAYOUT.map((point) => point.id));
    for (const id of REGION_ORDER) expect(placed.has(id), id).toBe(true);
  });
});
