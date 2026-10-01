import type { Artworks } from "@workspace/living-canvas";
import { contextId, rpc, workers } from "@workspace/runtime";
import { addAgentToChannel } from "@workspace-skills/agents";
import { waitForApprovalResolution } from "@workspace/pubsub";
import type { Game } from "@workspace/grimoire-engine";
export type View = {
  game: Game;
  garden: Game["life"]["garden"];
  notice: string;
  artworks: Artworks;
  artError?: string;
  seated: boolean;
  pending: {
    id: string;
    wish: string;
    started: number;
    attempt: number;
    error: string | null;
    reply: string;
  } | null;
};
export class StoryClient {
  private service;
  private artKey = "";
  private artworks: Artworks = {};
  private readonly artRequests = new Map<string, Promise<Artworks>>();
  async getArt(view: View): Promise<View> {
    const ids = view.game.scene.assets ?? [],
      key = JSON.stringify(ids);
    if (key !== this.artKey) {
      let pending = this.artRequests.get(key);
      if (!pending) {
        pending = ids.length
          ? this.service.call<Artworks>("getArt", { ids })
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
    this.service = workers.durableObjectService("examples.grimoire.v1", key);
  }
  async get() {
    return {
      ...(await this.service.call<View>("getGame")),
      artworks: this.artworks,
    };
  }
  linger(id: string) {
    return this.service.call("linger", { id }).then(() => this.get());
  }
  visit(residentId: string) {
    return this.service.call("visit", { residentId }).then(() => this.get());
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
    for (const role of ["wild", "moth"]) {
      const channelId = `grimoire-story-${this.key}-${role}`;
      const seat = await addAgentToChannel({
        source: "workers/grimoire-agents",
        className: "GrimoireAgentWorker",
        handle: role,
        name: role === "moth" ? "Moth" : "The wild",
        channelId,
        contextId,
        replay: false,
        config: {
          role,
          gameKey: this.key,
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
}
