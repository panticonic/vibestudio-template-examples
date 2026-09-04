import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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

  it("reduces navigation to Valley, Codex, and Journal without losing world paths", () => {
    const source = app();
    expect(source).toContain('id: "valley" as const');
    expect(source).toContain('id: "codex" as const');
    expect(source).toContain('id: "journal" as const');
    expect(source).toContain("Ask the familiar what to try next");
    expect(source).toContain("g-section-tabs");
    expect(source).toContain('"2": "grimoire"');
    expect(source).toContain('"3": "news"');
    expect(source).not.toContain("entry.key === event.key");
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
    expect(source).toContain("openFamiliarConversation");
    expect(source).toContain("drawRegion");
    expect(source).toContain("StudyRoom");
  });

  it("ships the complete conversational card family", () => {
    expect(
      readdirSync(join(here, "renderers"))
        .filter((name) => name.endsWith("-card.tsx"))
        .sort(),
    ).toEqual([
      "chapel-card.tsx",
      "festival-card.tsx",
      "hall-card.tsx",
      "reading-card.tsx",
      "scry-card.tsx",
      "spell-card.tsx",
      "verse-card.tsx",
    ]);
    const rendererSource = readdirSync(join(here, "renderers"))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => readFileSync(join(here, "renderers", name), "utf8"))
      .join("\n");
    expect(rendererSource).toContain("FolioPill");
    expect(rendererSource).not.toMatch(/minWidth:\s*300/);
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
    const estate = readFileSync(join(here, "lib", "estate.ts"), "utf8");
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
      "subagents.create",
      "workspace-service:channel",
      "workspace-service:grimoire",
      "workspace.runtime-state.inspect",
      "workspace.runtime-state.manage",
    ]);
    expect(estate).toContain("waitForApprovalResolution");
    expect(estate).toContain("installedAgents");
    expect(estate).toContain("defaultRecipients");
    expect(estate).toContain("initialPromptIdempotencyKey");
  });

  it("lays out every region of the valley", async () => {
    const { VALLEY_LAYOUT } = await import("./lib/layout.js");
    const { REGION_ORDER } = await import("@workspace/grimoire-engine");
    const placed = new Set(VALLEY_LAYOUT.map((point) => point.id));
    for (const id of REGION_ORDER) expect(placed.has(id), id).toBe(true);
  });
});
