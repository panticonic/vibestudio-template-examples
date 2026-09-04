/**
 * Thin typed client for the world service (`examples.grimoire.v1`).
 * One estate per object key; the panel's `stateArgs.estateKey` selects it.
 */
import { rpc, workers } from "@workspace/runtime";
import type { WorldIn, WorldMethodName, WorldOut } from "@workspace/grimoire-engine";

export const GRIMOIRE_PROTOCOL = "examples.grimoire.v1";

export class EstateClient {
  private targetId: string | null = null;

  constructor(readonly estateKey: string) {}

  private async target(): Promise<string> {
    if (this.targetId) return this.targetId;
    const svc = await workers.resolveService(GRIMOIRE_PROTOCOL, this.estateKey);
    if (svc.kind !== "durable-object") throw new Error("The Grimoire world is not a Durable Object service.");
    this.targetId = svc.targetId;
    return svc.targetId;
  }

  async call<M extends WorldMethodName>(method: M, input: WorldIn<M>): Promise<WorldOut<M>> {
    return rpc.call<WorldOut<M>>(await this.target(), method, [input]);
  }
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
