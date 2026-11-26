import { describe, it, expect, vi } from "vitest";
import { serializeRpcFailure } from "@vibestudio/rpc";
import { createHash } from "node:crypto";
const sha256HexSyncText = (s: string) =>
  createHash("sha256").update(s).digest("hex");
import type {
  EvalCall,
  EvalStartInput,
} from "@vibestudio/service-schemas/eval";
import { initialGame } from "@workspace/regency-engine";
import { initialWorld, type Campaign } from "@workspace/adventure-engine";
import { runPolicies } from "./policy.js";
import { evaluate, defaultEngineSource } from "../adventure-world/evaluate.js";
import { runWorldCode } from "../../packages/living-canvas/src/execution.js";
const campaign: Campaign = {
  id: "test",
  title: "Test",
  subtitle: "",
  intro: "Start",
  artDirection: "ink",
  playerId: "player",
  story: { premise: "Start", arc: [], commitments: [] },
  entities: [
    {
      id: "room",
      name: "Room",
      kind: "place",
      description: "",
      components: {},
    },
    {
      id: "player",
      name: "Player",
      kind: "person",
      description: "",
      location: "room",
      components: {},
    },
  ],
  behaviors: [],
};
const consumers = [
  {
    name: "Regency",
    run: (call: EvalCall, legacyWholeRunOnly: boolean) =>
      runPolicies(call, initialGame().world, [], undefined, 0, undefined, {
        legacyWholeRunOnly,
      }),
  },
  {
    name: "Adventure",
    run: (call: EvalCall, legacyWholeRunOnly: boolean) =>
      evaluate(
        call,
        initialWorld(campaign),
        "player",
        "",
        defaultEngineSource,
        false,
        {
          legacyWholeRunOnly,
        },
      ),
  },
  {
    name: "Living canvas",
    run: (call: EvalCall, legacyWholeRunOnly: boolean) =>
      runWorldCode(call, "return null", { legacyWholeRunOnly }),
  },
];
function driver(cleanupFails = false) {
  const starts: EvalStartInput[] = [];
  const phases: unknown[] = [];
  const call: EvalCall = async (method, args) => {
    if (method === "eval.start") {
      const input = args[0] as EvalStartInput;
      starts.push(input);
      const error = serializeRpcFailure(
        Object.assign(new Error("guest budget exhausted"), {
          code: "eval_execution_deadline_exceeded",
          errorData: { phase: "execute" },
        }),
      );
      return {
        runId: input.runId,
        status: "terminal",
        runDigest: "digest",
        authorityManifestDigest: "authority",
        snapshot: {
          runId: input.runId,
          status: "done",
          result: { success: false, console: "", error },
        },
      } as never;
    }
    if (method === "eval.events") {
      const input = starts.at(-1)!;
      const sourceDigest = sha256HexSyncText(
        input.source.kind === "inline" ? input.source.code : "",
      );
      const event = {
        sequence: 1,
        at: 123,
        kind: "diagnostic",
        payload: { kind: "eval-phase", phase: "execute", sourceDigest },
      };
      phases.push(event);
      return { events: [event], hasMore: false, next: 1 } as never;
    }
    if (method === "eval.dispose") {
      if (cleanupFails) throw new Error("owned cleanup failed");
      return undefined as never;
    }
    throw new Error(`Unexpected method ${method}`);
  };
  const counted = vi.fn(call) as unknown as EvalCall;
  return { call: counted, starts, phases };
}
describe.each(consumers)(
  "$name finite guest execution contract",
  (consumer) => {
    it.each([false, true])(
      "keeps no-capability authority, source-bound phases, cleanup and legacy option=%s",
      async (legacy) => {
        const owned = driver();
        let error: unknown;
        try {
          await consumer.run(owned.call, legacy);
        } catch (cause) {
          error = cause;
        }
        expect(error).toMatchObject({
          message: "guest budget exhausted",
          code: "eval_execution_deadline_exceeded",
          errorData: {
            nativeEvalDiagnostic: {
              schema: "vibestudio.eval-failure-diagnostic/1",
              events: [{ phase: "execute" }],
            },
          },
        });
        expect(owned.starts).toHaveLength(1);
        expect(owned.starts[0]).toMatchObject({
          scope: { lifecycle: "finite" },
          authority: {
            requests: [],
            effects: "read-only",
            approvals: "pregranted-only",
          },
          timeoutMs: legacy ? 3000 : 30000,
        });
        if (legacy)
          expect(owned.starts[0]).not.toHaveProperty("executionTimeoutMs");
        else expect(owned.starts[0]?.executionTimeoutMs).toBe(3000);
        expect(owned.call).toHaveBeenLastCalledWith("eval.dispose", [
          { scopeKey: owned.starts[0]?.scope?.key },
        ]);
      },
    );
    it("preserves both the primary structured failure and independently failing scope cleanup", async () => {
      const owned = driver(true);
      let error: unknown;
      try {
        await consumer.run(owned.call, false);
      } catch (cause) {
        error = cause;
      }
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toMatchObject([
        {
          code: "eval_execution_deadline_exceeded",
          errorData: {
            nativeEvalDiagnostic: { events: [{ phase: "execute" }] },
          },
        },
        { message: "owned cleanup failed" },
      ]);
    });
  },
);
