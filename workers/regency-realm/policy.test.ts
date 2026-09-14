import { describe, it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import {
  initialGame,
  programsWithProposal,
  type Proposal,
  type Program,
} from "@workspace/regency-engine";
import { policySource, runPolicies } from "./policy.js";
function simulate(
  programs: Program[],
  enact: string | undefined,
  months: number,
) {
  const scope: any = {};
  runInNewContext(
    `(function(){${policySource(initialGame().world, programs, enact, months)}})()`,
    { scope },
    { timeout: 100 },
  );
  return JSON.parse(scope.policyResult);
}
const ferry: Program = {
  id: "ferry",
  title: "Temporary ferry subsidy",
  summary: "Five crowns monthly for three months.",
  state: {},
  code: `const route=realm.economy.routes.find(x=>x.id==='east-ferry');if(phase==='enact'){state.remaining=3;realm.policies.push({id:'ferry',title:'Ferry subsidy',mandate:'Fund three months of ferry service.',status:'Authorized'});}if(phase==='tick'){route.subsidy=state.remaining>0?5:0;state.remaining=Math.max(0,state.remaining-1);realm.policies.find(x=>x.id==='ferry').status=route.subsidy?'Operating':'Expired';}`,
};
describe("policies inside the living economy", () => {
  it("runs recurring code monthly, charges real service costs and expires without arbitrary trust awards", () => {
    const three = simulate([ferry], "ferry", 3),
      four = simulate([ferry], "ferry", 4),
      without = simulate([], undefined, 3);
    expect(three.world.economy.accounts.services - without.world.economy.accounts.services).toBe(5);
    expect(four.world.economy.accounts.services).toBe(6); // The watch remains paid after the ferry expires.
    expect(four.states[0].remaining).toBe(0);
    expect(four.world.policies[0].status).toBe("Expired");
    expect(
      three.world.economy.regions.find((r: any) => r.id === "harbor").grain,
    ).toBeGreaterThan(
      without.world.economy.regions.find((r: any) => r.id === "harbor").grain,
    );
    expect(initialGame().world.ledger[0]!.amount).toBe(120);
  });
  it("does not enact or tick anything in a discussion", () => {
    expect(simulate([], undefined, 0).world).toEqual(initialGame().world);
  });
  it("rejects imaginary public-confidence rewards and malformed code", () => {
    expect(() =>
      simulate(
        [
          {
            ...ferry,
            code: "realm.ledger.find(x=>x.id==='trust').amount+=10;",
          },
        ],
        "ferry",
        1,
      ),
    ).toThrow(/causes/);
    expect(() =>
      policySource(
        initialGame().world,
        [{ ...ferry, code: "const = ;" }],
        "ferry",
        0,
      ),
    ).toThrow();
  });
  it("an enacted repeal removes the old recurring subsidy and stops its cost", () => {
    const running = simulate([ferry], "ferry", 1);
    const repeal: Proposal = {
      id: "end-ferry",
      title: "End ferry funding",
      summary: "Withdraw the temporary service",
      code: "if(phase==='enact')realm.economy.routes.find(r=>r.id==='east-ferry').subsidy=0;",
      state: {},
      author: "ivo",
      forecast: [],
      replaces: "ferry",
    };
    const programs = programsWithProposal(
        [{ ...ferry, state: running.states[0] }],
        repeal,
      ),
      scope: any = {};
    runInNewContext(
      `(function(){${policySource(running.world, programs, repeal.id, 1)}})()`,
      { scope },
      { timeout: 100 },
    );
    const result = JSON.parse(scope.policyResult);
    expect(result.world.economy.accounts.services).toBe(6); // Repeal stops the ferry, not the watch payroll.
    expect(result.states).toHaveLength(1);
    expect(() => programsWithProposal([], repeal)).toThrow(/fresh proposal/);
  });
  it("releases the finite execution scope even on failure", async () => {
    const calls: any[] = [];
    const call = async (method: string, args: unknown[]) => {
      calls.push({ method, args });
      if (method === "eval.start") throw new Error("Execution unavailable");
      return { ok: true };
    };
    await expect(
      runPolicies(call as never, initialGame().world, [], undefined, 0),
    ).rejects.toThrow("Execution unavailable");
    expect(calls.at(-1).method).toBe("eval.dispose");
    expect(calls[0].args[0].authority.requests).toEqual([]);
  });
});
