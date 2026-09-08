import { contextId, images, rpc, workers } from "@workspace/runtime";
import { addAgentToChannel } from "@workspace-skills/agents";
import { waitForApprovalResolution } from "@workspace/pubsub";
import type { Campaign, ServiceView } from "@workspace/adventure-engine";

/** One campaign has one durable world; all participating panels see the same story. */
export class AdventureClient {
  private readonly service;
  private initialization?: Promise<void>;
  private seats = new Map<string, Promise<void>>();

  constructor(
    readonly key: string,
    readonly campaign: Campaign,
    readonly cover?: string
  ) {
    this.service = workers.durableObjectService("examples.adventure.v1", key);
  }

  private initialize() {
    if (!this.initialization) {
      this.initialization = this.initializeWorld();
      this.initialization.catch(() => {
        this.initialization = undefined;
      });
    }
    return this.initialization;
  }

  private async initializeWorld() {
    const game = await this.service.call<ServiceView>("init", { campaign: this.campaign });
    if (!this.cover || game.world.tick !== 0 || game.world.artwork[game.view.location.id]) return;
    const response = await fetch(this.cover);
    if (!response.ok) throw new Error("The opening illustration could not be opened.");
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]!);
      reader.onerror = () =>
        reject(reader.error ?? new Error("The illustration could not be read."));
      reader.readAsDataURL(blob);
    });
    const asset = await images.importAsset({ base64, owner: `adventure:${this.key}:cover` });
    await this.service.call("setOpeningArtwork", { asset });
  }

  async get(): Promise<ServiceView> {
    await this.initialize();
    let game = await this.service.call<ServiceView>("getGame");
    for (const seat of game.neededSeats) await this.seat(seat.role, seat.name);
    if (game.neededSeats.length) game = await this.service.call<ServiceView>("getGame");
    return game;
  }

  async play(id: string, text: string) {
    await this.get();
    await this.service.call("play", { id, text });
    return this.get();
  }

  async retry() {
    await this.service.call("retry");
    return this.get();
  }

  private seat(role: string, name: string) {
    const existing = this.seats.get(role);
    if (existing) return existing;
    const creation = this.seatRole(role, name);
    this.seats.set(role, creation);
    void creation.then(
      () => this.seats.delete(role),
      () => this.seats.delete(role)
    );
    return creation;
  }

  private async seatRole(role: string, name: string) {
    if (!contextId) throw new Error("This adventure needs an open workspace.");
    const channelId = `adventure-${this.key}-${role}`;
    const participant = await addAgentToChannel({
      source: "workers/adventure-agents",
      className: "AdventureAgentWorker",
      handle: role.replaceAll(":", "-"),
      name,
      channelId,
      contextId,
      replay: false,
      config: { gameKey: this.key, role, wakePolicy: "manual", thinkingLevel: "low" },
      waitForReview: (id) => waitForApprovalResolution(rpc, id),
    });
    if (!participant.ok || !participant.targetId)
      throw new Error(`${name} could not join the story. Please try again.`);
    await this.service.call("registerParticipant", {
      role,
      targetId: participant.targetId,
      channelId,
    });
  }
}
