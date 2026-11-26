import {
  createEvalExecutor,
  disposeEvalScope,
  type EvalCall,
} from "@vibestudio/service-schemas/eval";
import { deserializeRpcFailure } from "@vibestudio/rpc";
/** One finite, capability-free execution. Durable state is committed by the world owner after validation. */
export async function runWorldCode(
  call: EvalCall,
  source: string,
  options: { legacyWholeRunOnly?: boolean } = {},
): Promise<unknown> {
  const key = "living-world-" + crypto.randomUUID(),
    execute = createEvalExecutor(call, { captureFailureEvents: true });
  const run = (code: string) =>
    execute({
      runId: crypto.randomUUID(),
      scope: { key, lifecycle: "finite" },
      source: { kind: "inline", syntax: "javascript", code },
      authority: {
        requests: [],
        effects: "read-only",
        approvals: "pregranted-only",
      },
      ...(options.legacyWholeRunOnly
        ? { timeoutMs: 3000 }
        : { timeoutMs: 30000, executionTimeoutMs: 3000 }),
    });
  let failure: { error: unknown } | undefined;
  try {
    const result = await run(
      `scope.result=JSON.stringify(await (async()=>{${source}\n})());return scope.result.length;`,
    );
    if (!result.success)
      throw result.error
        ? deserializeRpcFailure(result.error)
        : new Error("Eval failed");
    const length = result.returnValue;
    if (
      !Number.isSafeInteger(length) ||
      typeof length !== "number" ||
      length < 0 ||
      length > 300000
    )
      throw new Error("The world change is too large.");
    let json = "";
    for (let i = 0; i < length; i += 4000) {
      const page = await run(`return scope.result.slice(${i},${i + 4000});`);
      if (!page.success || typeof page.returnValue !== "string")
        throw page.error
          ? deserializeRpcFailure(page.error)
          : new Error("The world change could not be read.");
      json += page.returnValue;
    }
    return JSON.parse(json);
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    await disposeEvalScope(call, key, failure);
  }
}
