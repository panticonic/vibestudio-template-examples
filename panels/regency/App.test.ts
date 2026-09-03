import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "svelte/compiler";
import { describe, expect, it } from "vitest";

describe("Regency panel", () => {
  const files = readdirSync(__dirname).filter((f) => f.endsWith(".svelte"));

  it("ships every Svelte 5 component compiling cleanly", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const file of files) {
      const filename = resolve(__dirname, file);
      const source = readFileSync(filename, "utf8");
      const compiled = compile(source, { filename, generate: "client", modernAst: true });
      const warnings = compiled.warnings.filter((w: { code: string }) => !w.code.startsWith("a11y"));
      expect(warnings, `${file}: ${warnings.map((w: { message: string }) => w.message).join("; ")}`).toEqual([]);
      expect(compiled.js.code.length).toBeGreaterThan(500);
    }
  });

  it("ships React renderers for the chat cards", () => {
    for (const name of ["seal-card.tsx", "matter-card.tsx", "season-card.tsx"]) {
      const source = readFileSync(resolve(__dirname, "renderers", name), "utf8");
      expect(source).toContain("export default function");
      expect(source).not.toMatch(/from "@workspace\//);
    }
    expect(readFileSync(resolve(__dirname, "renderers", "seal-card.tsx"), "utf8")).toContain('"regency.decide"');
  });

  it("reads the runtime stores and the game key from stateArgs", () => {
    const app = readFileSync(resolve(__dirname, "App.svelte"), "utf8");
    expect(app).toContain('from "@workspace/svelte"');
    expect(app).toContain("gameKey");
    expect(app).toContain("new GameClient(gameKey)");
  });
});
