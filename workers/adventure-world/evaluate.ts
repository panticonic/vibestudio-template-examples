import {
  createEvalExecutor,
  type EvalCall,
} from "@vibestudio/service-schemas/eval";
import { deserializeRpcFailure, formatRpcFailure } from "@vibestudio/rpc";
import {
  createWorldAPI,
  validateWorld,
  type World,
} from "@workspace/adventure-engine";
import { parse } from "acorn";
export class AgentProgramError extends Error {
  override name = "AgentProgramError";
}
export class WorldActionRefusal extends Error {
  override name = "WorldActionRefusal";
}
export const defaultEngineSource = createWorldAPI.toString();
export function simulationSource(
  world: World,
  actorId: string,
  code: string,
  engineSource = defaultEngineSource,
  privileged = false,
) {
  try {
    const actionAst = parse(`async function action(world){${code}\n}`, {
      ecmaVersion: 2022,
    });
    if (
      actionAst.body.length !== 1 ||
      actionAst.body[0]?.type !== "FunctionDeclaration"
    )
      throw new Error("Supply only an action function body");
  } catch (error) {
    throw new AgentProgramError(String(error));
  }
  const hooks = (privileged ? [] : world.behaviors)
    .map((b) => {
      const ast = parse(
        `function behavior(world,state,event,self){${b.code}\n}`,
        {
          ecmaVersion: 2022,
        },
      );
      if (ast.body.length !== 1 || ast.body[0]?.type !== "FunctionDeclaration")
        throw new Error("Supply only a behavior function body");
      return `${JSON.stringify(b.id)}:function(world,state,event,self){${b.code}\n}`;
    })
    .join(",");
  parse(`const create=${engineSource};`, { ecmaVersion: 2022 });
  return `const action=async(world)=>{${code}\n}; return await (async()=>{
    const state=${JSON.stringify(world)}, failures=new Set();
    let output;
    try {
      const create=${engineSource}, hooks={${hooks}};
      const api=create(state,${JSON.stringify(actorId)},${privileged},hooks);
      const world=new Proxy(api,{get(target,key){
        try {
          const value=Reflect.get(target,key);
          return typeof value === "function" ? (...args)=>{
            try {return Reflect.apply(value,target,args);} catch(error) {failures.add(error);throw error;}
          } : value;
        } catch(error) {failures.add(error);throw error;}
      }});
      try {
        const result=await action(world);
        output=JSON.stringify({world:state,result:result??null});
      } catch(error) {output=JSON.stringify({failure:{kind:failures.has(error)?(error?.name === "WorldActionError" && error?.code === "WORLD_ACTION_REFUSED" ? "action":"world"):"program",message:String(error)}});}
    } catch(error) {output=JSON.stringify({failure:{kind:"world",message:String(error)}});}
    scope.output=output;
    return output.length;
  })();`;
}
export async function evaluate(
  call: EvalCall,
  world: World,
  actorId: string,
  code: string,
  engineSource: string,
  privileged = false,
) {
  const execute = createEvalExecutor(call),
    key = "adventure-" + crypto.randomUUID();
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
      simulationSource(world, actorId, code, engineSource, privileged),
    );
    if (!result.success)
      throw new Error(
        result.error
          ? formatRpcFailure(deserializeRpcFailure(result.error))
          : "Eval failed",
      );
    const length = result.returnValue;
    if (typeof length !== "number" || length > 1000000)
      throw new Error("Invalid simulation result");
    let output = "";
    for (let n = 0; n < length; n += 4000) {
      const page = await run(`return scope.output.slice(${n},${n + 4000});`);
      if (!page.success || typeof page.returnValue !== "string")
        throw new Error("Simulation result unavailable");
      output += page.returnValue;
    }
    const parsed = JSON.parse(output);
    if (parsed.failure) {
      if (parsed.failure.kind === "program")
        throw new AgentProgramError(parsed.failure.message);
      if (parsed.failure.kind === "action")
        throw new WorldActionRefusal(parsed.failure.message);
      throw new Error(parsed.failure.message);
    }
    validateWorld(parsed.world);
    return parsed as { world: World; result: unknown };
  } finally {
    await call("eval.dispose", [{ scopeKey: key }]);
  }
}
