/**
 * Thin typed client for the world service (`examples.grimoire.v1`).
 * One estate per object key; the panel's `stateArgs.estateKey` selects it.
 */
import { workers } from "@workspace/runtime";
import type { WorldIn, WorldMethodName, WorldOut } from "@workspace/grimoire-engine";

export const GRIMOIRE_PROTOCOL = "examples.grimoire.v1";

export class EstateClient {
  private readonly service;

  constructor(readonly estateKey: string) {
    this.service = workers.durableObjectService(GRIMOIRE_PROTOCOL, estateKey);
  }

  async call<M extends WorldMethodName>(method: M, input: WorldIn<M>): Promise<WorldOut<M>> {
    return this.service.call<WorldOut<M>>(method, input);
  }
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
