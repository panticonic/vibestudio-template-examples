import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "svelte/compiler";

const here = dirname(fileURLToPath(import.meta.url));
const svelteFiles = readdirSync(here).filter((f) => f.endsWith(".svelte"));

describe("the Grimoire panel", () => {
  it("compiles every component without warnings", () => {
    expect(svelteFiles.length).toBeGreaterThanOrEqual(14);
    for (const file of svelteFiles) {
      const source = readFileSync(join(here, file), "utf8");
      const compiled = compile(source, { filename: file, generate: "client", modernAst: true });
      const warnings = compiled.warnings.filter((w) => !w.code.startsWith("a11y"));
      expect(warnings.map((w) => `${file}: ${w.code} ${w.message}`)).toEqual([]);
      expect(compiled.js.code.length).toBeGreaterThan(300);
    }
  });

  it("declares its state args and the world service", () => {
    const manifest = JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as { vibestudio: { stateArgs: { properties: Record<string, unknown> }; authority: { serviceRequests: Array<{ protocol: string }> } } };
    expect(Object.keys(manifest.vibestudio.stateArgs.properties).sort()).toEqual(["apprentice", "estateKey", "sound", "view"]);
    expect(manifest.vibestudio.authority.serviceRequests.map((s) => s.protocol)).toContain("examples.grimoire.v1");
    const app = readFileSync(join(here, "App.svelte"), "utf8");
    expect(app).toContain("new EstateClient(estateKey)");
    expect(app).toContain('client.call("presence"');
  });

  it("uses the typed workspace runtime layers for services and owned channels", () => {
    const client = readFileSync(join(here, "lib", "client.ts"), "utf8");
    const estate = readFileSync(join(here, "lib", "estate.ts"), "utf8");

    expect(client).toContain("workers.durableObjectService(GRIMOIRE_PROTOCOL, estateKey)");
    expect(client).not.toContain("workers.resolveService");
    expect(estate).toContain("workers.createDurableObject(CHANNEL_SOURCE, CHANNEL_CLASS");
    expect(estate).not.toContain('"runtime.createEntity"');
  });

  it("declares the complete authority ceiling used by the panel", () => {
    const manifest = JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as {
      vibestudio: {
        authority: {
          serviceRequests: Array<{ protocol: string }>;
          requests: Array<{ capability: string }>;
        };
      };
    };

    expect(manifest.vibestudio.authority.serviceRequests.map(({ protocol }) => protocol).sort()).toEqual([
      "examples.grimoire.v1",
      "vibestudio.channel.v1",
    ]);
    expect(manifest.vibestudio.authority.requests.map(({ capability }) => capability).sort()).toEqual([
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
    const placed = new Set(VALLEY_LAYOUT.map((p) => p.id));
    for (const id of REGION_ORDER) expect(placed.has(id), id).toBe(true);
    for (const p of VALLEY_LAYOUT) { expect(p.x + p.w).toBeLessThanOrEqual(1000); expect(p.y + p.h).toBeLessThanOrEqual(700); }
  });

  it("shifts the palette with season and hour and judges verse shape", async () => {
    const { paletteFor, nightness } = await import("./lib/palette.js");
    expect(nightness(12)).toBe(0);
    expect(nightness(23)).toBeGreaterThan(0.5);
    expect(paletteFor("winter", 12, false).name).toBe("winter");
    expect(paletteFor("summer", 2, false).paper).not.toBe(paletteFor("summer", 12, false).paper);
    const { shapeOf } = await import("./lib/verse.js");
    expect(shapeOf("Small fire, wake and warm this room\nhama, come up from the ash").lines.length).toBe(2);
    expect(shapeOf("please can you make the orchard less flooded because it has been bothering me for a long while and I want it dry").hint).toBeTruthy();
  });
});
