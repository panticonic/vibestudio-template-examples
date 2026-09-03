import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "svelte/compiler";
import { describe, expect, it } from "vitest";

describe("Regency panel", () => {
  const files = readdirSync(__dirname).filter((f) => f.endsWith(".svelte"));

  it("ships every Svelte 5 component compiling cleanly", () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
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
    for (const name of ["seal-card.tsx", "matter-card.tsx", "season-card.tsx", "debate-card.tsx", "handover-card.tsx"]) {
      const source = readFileSync(resolve(__dirname, "renderers", name), "utf8");
      expect(source).toContain("export default function");
      expect(source).not.toMatch(/from "@workspace\//);
    }
    expect(readFileSync(resolve(__dirname, "renderers", "seal-card.tsx"), "utf8")).toContain('"regency.decide"');
  });

  it("ships the ending scene, the why panel and the second layer of the map", () => {
    expect(files).toEqual(expect.arrayContaining(["Ending.svelte", "Why.svelte"]));
    const map = readFileSync(resolve(__dirname, "Map.svelte"), "utf8");
    // The season paints the map, the camera moves, and staged intents are drawn.
    for (const marker of ["weather", "camera", "focusOn", "intentMarches", "siege-camp", "pennant", "caption-strip", "snowPath"]) {
      expect(map, `Map.svelte should mention ${marker}`).toContain(marker);
    }
  });

  it("declares the sound toggle in the panel's stateArgs schema", () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { vibestudio: { stateArgs: { properties: Record<string, unknown> } } };
    expect(Object.keys(manifest.vibestudio.stateArgs.properties)).toEqual(expect.arrayContaining(["gameKey", "sound"]));
  });

  it("reads the runtime stores and the game key from stateArgs", () => {
    const app = readFileSync(resolve(__dirname, "App.svelte"), "utf8");
    expect(app).toContain('from "@workspace/svelte"');
    expect(app).toContain("gameKey");
    expect(app).toContain("new GameClient(gameKey)");
    // Keyboard, sound and the ending scene are wired from the shell component.
    expect(app).toContain("addEventListener(\"keydown\"");
    expect(app).toContain("playCue");
    expect(app).toContain("setStateArgs({ sound: on })");
    expect(app).toContain("<Ending");
  });
});

describe("reading the law and the numbers", () => {
  it("tokenises an edict and diffs the law book", async () => {
    const { edictLines, edictDiff } = await import("./lib/laws.js");
    const edict = {
      id: "e1",
      title: "Relief for the hungry marches",
      when: [
        { field: "is_border", op: "==", value: true },
        { field: "food_ratio", op: "<", value: 1 },
      ],
      then: [{ kind: "tax_relief", factor: 0.5 }, { kind: "grain_dole" }],
      enacted: 0,
      author: "chancellor",
    } as const;
    const lines = edictLines(edict as never);
    expect(lines.map((l) => l.lead)).toEqual(["when", "and", "then", "and"]);
    expect(lines[0]!.tokens.map((t) => t.kind)).toEqual(["field", "plain", "op", "plain", "value"]);
    expect(lines[2]!.tokens.some((t) => t.kind === "action" && t.text === "tax_relief")).toBe(true);
    expect(lines[2]!.tokens.some((t) => t.kind === "key" && t.text === "factor")).toBe(true);
    const diff = edictDiff([edict as never], [
      { kind: "repeal_edict", edictId: "e1" },
      { kind: "enact_edict", edict: { ...edict, id: "e2", title: "Curfew in the towns" } },
    ] as never);
    expect(diff.map((r) => r.kind)).toEqual(["removed", "added"]);
    expect(diff[1]!.title).toBe("Curfew in the towns");
  });

  it("generates the sound cues rather than shipping audio files", async () => {
    const sound = readFileSync(resolve(__dirname, "lib", "sound.ts"), "utf8");
    expect(sound).toContain("createOscillator");
    expect(sound).not.toMatch(/\.mp3|\.wav|\.ogg/);
    const { playCue } = await import("./lib/sound.js");
    // No WebAudio in the test environment: the cue is a no-op, not a crash.
    expect(() => playCue("season", true)).not.toThrow();
    expect(() => playCue("battle", false)).not.toThrow();
  });

  it("puts snow only on the high ground", async () => {
    const { snowPath } = await import("./lib/geometry.js");
    expect(snowPath({ x: 10, y: 10, kind: "peak", scale: 1 })).toMatch(/^M/);
    expect(snowPath({ x: 10, y: 10, kind: "hill", scale: 1 })).toMatch(/^M/);
  });
});
