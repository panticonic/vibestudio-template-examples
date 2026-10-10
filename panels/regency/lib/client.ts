import type { Artworks } from "@workspace/living-canvas";
import { contextId, rpc, workers } from "@workspace/runtime";
import type { Game } from "@workspace/regency-engine";
import type { RegencyAgentRole } from "@workspace/regency-engine/agentRpc";
import { regencyRealmRpcMethods } from "@workspace-workers/regency-realm/contract";
export type View = {
  game: Game;
  painting: boolean;
  artworks: Artworks;
  artError?: string;
  seated: boolean;
  neededSeats: Array<{ role: RegencyAgentRole; name: string }>;
  pending: {
    id: string;
    wish: string;
    started: number;
    attempt: number;
    error: string | null;
    world: unknown | null;
    cast: Array<{ id: string; name: string }>;
    audience: string[];
    voices: Record<string, { text: string }>;
  } | null;
};
export class StoryClient {
  private service;
  private artKey = "";
  private artworks: Artworks = {};
  private readonly artRequests = new Map<string, Promise<Artworks>>();
  async getArt(view: View): Promise<View> {
    const ids = [
        ...new Set([
          ...(view.game.scene.assets ?? []),
          ...(view.game.world.places.find(
            (place) => place.id === view.game.world.location,
          )?.scene?.assets ?? []),
        ]),
      ],
      key = JSON.stringify(ids);
    if (key !== this.artKey) {
      let pending = this.artRequests.get(key);
      if (!pending) {
        pending = ids.length
          ? this.service.call("getArt", { ids })
          : Promise.resolve({});
        this.artRequests.set(key, pending);
      }
      try {
        this.artworks = await pending;
      } finally {
        if (this.artRequests.get(key) === pending) this.artRequests.delete(key);
      }
      this.artKey = key;
    }
    return { ...view, artworks: this.artworks };
  }
  constructor(readonly key: string) {
    this.service = workers.durableObjectService("examples.regency.v1", regencyRealmRpcMethods, key);
  }
  async get() {
    let view = await this.service.call("getGame");
    for (const seat of view.neededSeats)
      await this.seatRole(seat.role, seat.name);
    if (view.neededSeats.length)
      view = await this.service.call("getGame");
    return { ...view, artworks: this.artworks };
  }
  advance(id: string, months: number) {
    return this.service.call("advance", { id, months }).then(() => this.get());
  }
  enact(id: string, proposalId: string) {
    return this.service
      .call("enact", { id, proposalId })
      .then(() => this.get());
  }
  play(id: string, wish: string) {
    return this.service.call("play", { id, wish }).then(() => this.get());
  }
  retry() {
    return this.service.call("retry").then(() => this.get());
  }
  cancel() {
    return this.service.call("cancel").then(() => this.get());
  }
  async seat() {
    if (!contextId) throw new Error("This game needs a workspace context.");
    for (const role of ["storyteller"] as const)
      await this.seatRole(role, "The scene artist");
  }
  private async seatRole(role: RegencyAgentRole, name: string) {
    const [{ addAgentToChannel }, { waitForApprovalResolution }] =
      await Promise.all([
        import("@workspace-skills/agents"),
        import("@workspace/pubsub"),
      ]);
    const channelId = `regency-story-${this.key}-${role}`;
    const seat = await addAgentToChannel({
      source: "workers/regency-agents",
      className: "RegencyAgentWorker",
      handle: role.replace(":", "-"),
      name,
      channelId,
      contextId,
      replay: false,
      config: {
        gameKey: this.key,
        role,
        wakePolicy: "manual",
        thinkingLevel: "low",
      },
      waitForReview: (id) => waitForApprovalResolution(rpc, id),
    });
    if (!seat.ok || !seat.targetId)
      throw new Error("Your storyteller could not arrive. Please try again.");
    await this.service.call("registerParticipant", {
      targetId: seat.targetId,
      channelId,
      role,
    });
  }
}
