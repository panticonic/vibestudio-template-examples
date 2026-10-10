import {
  createEvalExecutor,
  type EvalCall,
} from "@vibestudio/service-schemas/eval";
import { deserializeRpcFailure, formatRpcFailure } from "@vibestudio/rpc";
/** One finite, capability-free execution. Durable state is committed by the world owner after validation. */
export async function runWorldCode(
  call: EvalCall,
  source: string,
): Promise<unknown> {
  const key = "living-world-" + crypto.randomUUID(),
    execute = createEvalExecutor(call);
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
      timeoutMs: 3000,
    });
  try {
    const result = await run(
      `scope.result=JSON.stringify(await (async()=>{${source}\n})());return scope.result.length;`,
    );
    if (!result.success)
      throw new Error(
        result.error
          ? formatRpcFailure(deserializeRpcFailure(result.error))
          : "Eval failed",
      );
    const length = result.returnValue;
    if (typeof length !== "number" || length > 300000)
      throw new Error("The world change is too large.");
    let json = "";
    for (let i = 0; i < length; i += 4000) {
      const page = await run(`return scope.result.slice(${i},${i + 4000});`);
      if (!page.success || typeof page.returnValue !== "string")
        throw new Error("The world change could not be read.");
      json += page.returnValue;
    }
    return JSON.parse(json);
  } finally {
    await call("eval.dispose", [{ scopeKey: key }]);
  }
}
