import type { Artworks } from "@workspace/living-canvas";
import { contextId, rpc, workers } from "@workspace/runtime";
import { addAgentToChannel } from "@workspace-skills/agents";
import { waitForApprovalResolution } from "@workspace/pubsub";
import type { Game } from "@workspace/regency-engine";
export type View = {
  game: Game;
  painting: boolean;
  artworks: Artworks;
  seated: boolean;
  neededSeats: Array<{ role: string; name: string }>;
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
  private async withArt(view: View) {
    const ids = [...new Set([...(view.game.scene.assets ?? []), ...(view.game.world.places.find(place => place.id === view.game.world.location)?.scene?.assets ?? [])])],
      key = JSON.stringify(ids);
    if (key !== this.artKey) {
      this.artworks = ids.length
        ? await this.service.call<Artworks>("getArt", { ids })
        : {};
      this.artKey = key;
    }
    return { ...view, artworks: this.artworks };
  }
  constructor(readonly key: string) {
    this.service = workers.durableObjectService("examples.regency.v1", key);
  }
  async get() {
    let view = await this.service.call<View>("getGame");
    for (const seat of view.neededSeats)
      await this.seatRole(seat.role, seat.name);
    if (view.neededSeats.length)
      view = await this.service.call<View>("getGame");
    return this.withArt(view);
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
    return this.service.call<View>("play", { id, wish }).then(() => this.get());
  }
  retry() {
    return this.service.call<View>("retry").then(() => this.get());
  }
  cancel() {
    return this.service.call<View>("cancel").then(() => this.get());
  }
  async seat() {
    if (!contextId) throw new Error("This game needs a workspace context.");
    for (const role of ["storyteller"])
      await this.seatRole(role, "The scene artist");
  }
  private async seatRole(role: string, name: string) {
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
