/**
 * The Regent's voice from the map. The panel joins the council conversation
 * as the user — a panel carrying the host-verified user id is canonicalised
 * to that person's participant — so a message sent here is the Regent
 * speaking, with the province or army they pointed at as metadata and, for
 * the Herald's eyes, in words at the end of the message.
 */
import { contextId as runtimeContextId, panel, rpc } from "@workspace/runtime";
import { connectViaRpc, type PubSubClient } from "@workspace/pubsub";

export class CourtVoice {
  private client: PubSubClient | null = null;

  constructor(private readonly channelId: string) {}

  private async connect(): Promise<PubSubClient> {
    if (this.client) return this.client;
    const contextId = runtimeContextId;
    if (!contextId) throw new Error("no context");
    const client = connectViaRpc({
      rpc,
      channel: this.channelId,
      contextId,
      clientId: `${panel.slotId}:regency-voice`,
      name: "The Regent",
      type: "panel",
      handle: "regent",
      replayMode: "skip",
    });
    await client.ready();
    this.client = client;
    return client;
  }

  async speak(text: string, about: { province?: string; army?: string }): Promise<void> {
    const client = await this.connect();
    await client.send(text, { metadata: { regency: { ...(about.province ? { province: about.province } : {}), ...(about.army ? { army: about.army } : {}) } } });
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = null;
  }
}
