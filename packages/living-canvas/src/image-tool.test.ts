import { describe, expect, it, vi } from "vitest";
import { Type } from "@panticonic/pi-ai";
import type { ToolRegistration } from "@panticonic/pi-durable";
import { executeTool } from "@workspace/harness/testing/native-tool";
import { imageTool } from "./image-tool.js";
function outputPath(args: unknown): string {
  if (
    !args ||
    typeof args !== "object" ||
    !("outputPath" in args) ||
    typeof args.outputPath !== "string"
  )
    throw new Error("Native image invocation lost its actual output path");
  return args.outputPath;
}
function fixture(command = "native:owner-one:invocation-one") {
  const native: ToolRegistration = {
    name: "imagegen",
    description: "Actual native imagegen port",
    parameters: Type.Any(),
    execute: vi.fn(async () => ({
      content: [
        { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" },
      ],
    })),
  };
  const call = vi.fn(async (method: string, _input?: unknown) =>
    method === "artCatalog"
      ? { portrait: { path: "panels/story/assets/portrait.png" } }
      : { ok: true },
  );
  return {
    native,
    call,
    tool: imageTool(native, call, "story", () => command),
  };
}
describe("native story image tool", () => {
  it("retains artifact identity across an accepted store with a lost response", async () => {
    const f = fixture();
    const original = new Error("Store accepted but reply lost");
    let lost = true;
    f.call.mockImplementation(async (method) => {
      if (method === "artCatalog")
        return { portrait: { path: "panels/story/assets/portrait.png" } };
      if (lost) {
        lost = false;
        throw original;
      }
      return { ok: true };
    });
    const args = {
      name: "garden",
      prompt: "A walled garden",
      references: ["portrait"],
    };
    await expect(executeTool(f.tool, args)).rejects.toBe(original);
    const result = await executeTool(f.tool, args);
    const executions = vi.mocked(f.native.execute).mock.calls;
    expect(executions).toHaveLength(2);
    expect(executions[0]![0]).toEqual(executions[1]![0]);
    expect(executions[0]![0]).toMatchObject({
      referencePaths: ["panels/story/assets/portrait.png"],
      outputPath: expect.stringMatching(
        /^panels\/story\/assets\/generated\/garden-[0-9a-f]{16}\.png$/,
      ),
      createOnly: true,
    });
    const writes = f.call.mock.calls.filter((call) => call[0] === "storeArt");
    expect(writes[0]![1]).toEqual(writes[1]![1]);
    expect(result.details).toMatchObject({
      path: outputPath(executions[0]![0]),
    });
  });
  it("keeps different owning native invocations distinct even with the same local call id", async () => {
    const a = fixture("native:owner-one:invocation-one"),
      b = fixture("native:owner-two:invocation-one");
    await executeTool(
      a.tool,
      { name: "garden", prompt: "A garden" },
      { callId: "same-local-call" },
    );
    await executeTool(
      b.tool,
      { name: "garden", prompt: "A garden" },
      { callId: "same-local-call" },
    );
    expect(outputPath(vi.mocked(a.native.execute).mock.calls[0]![0])).not.toBe(
      outputPath(vi.mocked(b.native.execute).mock.calls[0]![0]),
    );
  });
  it("preserves a native provider refusal without claiming artwork was stored", async () => {
    const f = fixture();
    const failed = {
      isError: true,
      content: [
        { type: "text" as const, text: "Provider declined the request" },
      ],
    };
    vi.mocked(f.native.execute).mockResolvedValue(failed);
    expect(
      await executeTool(f.tool, { name: "garden", prompt: "A garden" }),
    ).toMatchObject(failed);
    expect(f.call.mock.calls.some((call) => call[0] === "storeArt")).toBe(
      false,
    );
  });
  it("propagates the actual caller cancellation before any domain or provider dispatch", async () => {
    const f = fixture();
    const controller = new AbortController(),
      original = new Error("Original cancellation");
    controller.abort(original);
    await expect(
      executeTool(
        f.tool,
        { name: "garden", prompt: "A garden" },
        { signal: controller.signal },
      ),
    ).rejects.toBe(original);
    expect(f.call).not.toHaveBeenCalled();
    expect(f.native.execute).not.toHaveBeenCalled();
  });
});
