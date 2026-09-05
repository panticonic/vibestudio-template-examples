import {
  createEvalExecutor,
  type EvalCall,
} from "@vibestudio/service-schemas/eval";
import {
  validateWorld,
  settleRealmMonth,
  type World,
  type Program,
} from "@workspace/regency-engine";
import { parse } from "acorn";
export function policySource(
  world: World,
  programs: Program[],
  enact: string | undefined,
  months: number,
): string {
  for (const program of programs) {
    const ast = parse(
      `function policy(realm,state,phase,months,events){\n${program.code}\n}`,
      { ecmaVersion: 2022 },
    );
    if (ast.body.length !== 1 || ast.body[0]?.type !== "FunctionDeclaration")
      throw new Error("Return only a policy function body.");
  }
  const functions = programs
    .map((p) => `function(realm,state,phase,months,events){\n${p.code}\n}`)
    .join(",");
  return `const realm=${JSON.stringify(world)},states=${JSON.stringify(programs.map((p) => p.state))},events=[],policies=[${functions}];
  const invoke=(i,phase)=>{const before={month:realm.month,time:realm.time,ledger:realm.ledger.filter(x=>['trust','grain'].includes(x.id)).map(x=>[x.id,x.amount]),opinions:realm.economy.regions.map(r=>[r.id,r.confidence,r.prosperity])};policies[i](realm,states[i],phase,phase==='tick'?1:0,events);if(realm.month!==before.month||realm.time!==before.time||before.ledger.some(([id,value])=>realm.ledger.find(x=>x.id===id)?.amount!==value)||before.opinions.some(([id,confidence,prosperity])=>{const r=realm.economy.regions.find(r=>r.id===id);return r&&(r.confidence!==confidence||r.prosperity!==prosperity)}))throw new Error('Time, confidence, prosperity and summary indicators arise from the shared simulation; change their causes instead.');};
  ${enact ? `invoke(${programs.findIndex((p) => p.id === enact)},'enact');` : ""}
  for(let month=0;month<${months};month++){for(let i=0;i<policies.length;i++)invoke(i,'tick');(${settleRealmMonth.toString()})(realm,events);}
  scope.policyResult=JSON.stringify({world:realm,states,events});return scope.policyResult.length;`;
}
/** Native finite EvalDO, attenuated to no capabilities. Generated policy never gets game RPC authority. */
export async function runPolicies(
  call: EvalCall,
  world: World,
  programs: Program[],
  enact: string | undefined,
  months: number,
) {
  const key = "regency-policy-" + crypto.randomUUID();
  const execute = createEvalExecutor(call);
  try {
    const result = await execute({
      runId: key,
      scope: { key, lifecycle: "finite" },
      source: {
        kind: "inline",
        syntax: "javascript",
        code: policySource(world, programs, enact, months),
      },
      authority: {
        requests: [],
        effects: "read-only",
        approvals: "pregranted-only",
      },
      timeoutMs: 3000,
    });
    if (!result.success)
      throw new Error(String(result.error ?? "Policy execution failed."));
    const length = result.returnValue;
    if (typeof length !== "number" || length > 200000)
      throw new Error("Policy result is too large.");
    let text = "";
    for (let offset = 0; offset < length; offset += 4000) {
      const page = await execute({
        runId: key + "-" + offset,
        scope: { key, lifecycle: "finite" },
        source: {
          kind: "inline",
          syntax: "javascript",
          code: `return scope.policyResult.slice(${offset},${offset + 4000});`,
        },
        authority: {
          requests: [],
          effects: "read-only",
          approvals: "pregranted-only",
        },
      });
      if (!page.success || typeof page.returnValue !== "string")
        throw new Error("Policy result could not be read.");
      text += page.returnValue;
    }
    const output = JSON.parse(text);
    const next = validateWorld(output.world);
    if (
      !Array.isArray(output.states) ||
      output.states.length !== programs.length ||
      !Array.isArray(output.events) ||
      output.events.some((x: unknown) => typeof x !== "string")
    )
      throw new Error("Invalid policy result.");
    return {
      world: next,
      programs: programs.map((p, i) => ({ ...p, state: output.states[i] })),
      events: output.events as string[],
    };
  } finally {
    await call("eval.dispose", [{ scopeKey: key }]);
  }
}
