import { contextId, images, rpc, workers } from "@workspace/runtime";
import { initialWorld, type Campaign, type ServiceView } from "@workspace/adventure-engine";
import { illustrationReferences, sceneSnapshot, type BundledArtwork } from "@workspace/adventure-engine/art";

/** One campaign has one durable world; all participating panels see the same story. */
export class AdventureClient {
  private readonly service;
  private initialization?: Promise<void>;
  private imports = new Map<string, Promise<void>>();
  private seats = new Map<string, Promise<void>>();

  constructor(
    readonly key: string,
    readonly campaign: Campaign,
    readonly cover?: string,
    readonly artwork?: BundledArtwork
  ) {
    this.service = workers.durableObjectService("examples.adventure.v1", key);
  }

  private initialize() {
    if (!this.initialization) {
      this.initialization = this.service
        .call("init", { campaign: this.campaign })
        .then(() => undefined);
      this.initialization.catch(() => {
        this.initialization = undefined;
      });
    }
    return this.initialization;
  }

  private async importCover(game: ServiceView) {
    if (this.artwork) {
      const seed = initialWorld(this.campaign);
      const opening = sceneSnapshot(seed);
      // Register only subjects present in this scene. Off-screen references stay
      // as static URLs until exploration needs them, rather than being uploaded at boot.
      const jobs = illustrationReferences(game.view, game.world.artDirection).flatMap(ref => {
        if (game.visual.references?.[ref.key] === ref.signature) return [];
        const entityId = ref.key.slice(ref.key.indexOf(":") + 1);
        const entity = seed.entities.find(e => e.id === entityId);
        const url = (ref.kind === "portrait" ? this.artwork!.people : this.artwork!.places)[entityId];
        if (!entity || !url) return [];
        const authored = illustrationReferences({location:entity,entities:[],inventory:[],exits:{},events:[]},seed.artDirection)[0]!;
        if (authored.signature !== ref.signature) return [];
        return [this.importOnce(ref.key + ref.signature, async () => {
          const asset = await this.importImage(url, `adventure:${this.key}:reference:${ref.key}`);
          await this.service.call("setBundledReference", {key:ref.key,signature:ref.signature,asset});
        })];
      });
      if (game.world.tick === 0 && game.visual.signature === opening.signature && !game.world.artwork[opening.view.location.id]) {
        jobs.push(this.importOnce("opening", async () => {
          const asset = await this.importImage(this.artwork!.opening, `adventure:${this.key}:cover`);
          await this.service.call("setOpeningArtwork", { asset, signature: opening.signature, placeId: opening.view.location.id });
        }));
      }
      await Promise.all(jobs);
      return;
    }
    if (!this.cover || game.world.tick !== 0 || game.world.artwork[game.view.location.id]) return;
    await this.importOnce("opening", async () => {
      const asset = await this.importImage(this.cover!, `adventure:${this.key}:cover`);
      await this.service.call("setOpeningArtwork", { asset });
    });
  }
  private importOnce(key: string, run: () => Promise<void>) {
    const existing = this.imports.get(key);
    if (existing) return existing;
    const job = run();
    this.imports.set(key, job);
    void job.catch(() => this.imports.delete(key));
    return job;
  }
  private async importImage(url: string, owner: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("The opening illustration could not be opened.");
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]!);
      reader.onerror = () =>
        reject(reader.error ?? new Error("The illustration could not be read."));
      reader.readAsDataURL(blob);
    });
    return images.importAsset({ base64, owner });
  }

  async get(): Promise<ServiceView> {
    await this.initialize();
    return this.service.call<ServiceView>("getGame");
  }

  /** The caller publishes the useful world view before starting optional preparation. */
  async prepare(game: ServiceView) {
    const results = await Promise.allSettled([
      this.importCover(game),
      ...game.neededSeats.map(({ role, name }) => this.seat(role, name)),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
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

  async cancel() {
    await this.service.call("cancel");
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
    const [{ addAgentToChannel }, { waitForApprovalResolution }] = await Promise.all([
      import("@workspace-skills/agents"),
      import("@workspace/pubsub"),
    ]);
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
