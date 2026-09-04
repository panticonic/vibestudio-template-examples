/**
 * Inline chat cards. The panel joins the council conversation as a quiet
 * participant and publishes typed cards: an act awaiting the seal, a matter
 * of state awaiting a decision, and a season digest. Card buttons call the
 * Herald's `regency.decide` method, so the decision flows through the same
 * identity checks as everything else. The game remembers which message
 * renders which order, so a reopened panel updates cards instead of
 * duplicating them.
 */
import { contextId as runtimeContextId, panel, rpc } from "@workspace/runtime";
import { connectViaRpc, type PubSubClient } from "@workspace/pubsub";
import { describeEffects, describeOrder, seasonLabel, type GameState } from "@workspace/regency-engine";
import type { GameClient, GameView } from "./client.js";

export const CARD_VERSION = 1;
const SEAL_TYPE = "regency.seal";
const MATTER_TYPE = "regency.matter";
const SEASON_TYPE = "regency.season";
const DEBATE_TYPE = "regency.debate";
const HANDOVER_TYPE = "regency.handover";
const RENDERER_DIR = "panels/regency/renderers";
const IMPORTS = { "@radix-ui/themes": "npm:^3.2.1", "@radix-ui/react-icons": "npm:^1.3.2" };

export class CourtCards {
  private client: PubSubClient | null = null;
  private registered = false;
  private busy = false;

  constructor(private readonly game: GameClient, private readonly channelId: string) {}

  private async connect(): Promise<PubSubClient> {
    if (this.client) return this.client;
    const contextId = runtimeContextId;
    if (!contextId) throw new Error("no context");
    const client = connectViaRpc({
      rpc,
      channel: this.channelId,
      contextId,
      clientId: `${panel.slotId}:regency-cards`,
      name: "Regency",
      type: "panel",
      handle: "regency",
      replayMode: "skip",
    });
    await client.ready();
    this.client = client;
    return client;
  }

  private async ensureTypes(view: GameView): Promise<void> {
    if (this.registered) return;
    const key = `types:v${CARD_VERSION}`;
    if (view.cards.some((c) => c.key === key)) {
      this.registered = true;
      return;
    }
    const client = await this.connect();
    await client.registerMessageType({ typeId: SEAL_TYPE, displayMode: "inline", source: { type: "file", path: `${RENDERER_DIR}/seal-card.tsx` }, imports: IMPORTS });
    await client.registerMessageType({ typeId: MATTER_TYPE, displayMode: "inline", source: { type: "file", path: `${RENDERER_DIR}/matter-card.tsx` }, imports: IMPORTS });
    await client.registerMessageType({ typeId: SEASON_TYPE, displayMode: "row", source: { type: "file", path: `${RENDERER_DIR}/season-card.tsx` }, imports: IMPORTS });
    await client.registerMessageType({ typeId: DEBATE_TYPE, displayMode: "inline", source: { type: "file", path: `${RENDERER_DIR}/debate-card.tsx` }, imports: IMPORTS });
    await client.registerMessageType({ typeId: HANDOVER_TYPE, displayMode: "inline", source: { type: "file", path: `${RENDERER_DIR}/handover-card.tsx` }, imports: IMPORTS });
    await this.game.setCard({ key, channelId: this.channelId, messageId: "-", kind: "types" });
    this.registered = true;
  }

  /** Publish new cards and update changed ones. Safe to call on every poll. */
  async sync(view: GameView, previous: GameView | null): Promise<void> {
    if (this.busy || !view.state) return;
    const herald = view.participants.find((p) => p.role === "herald" && p.kind !== "chambers");
    if (!herald) return;
    this.busy = true;
    try {
      await this.ensureTypes(view);
      const state = view.state;
      const cards = new Map(view.cards.map((c) => [c.key, c]));
      // Acts awaiting the seal (and their later fate).
      for (const o of view.orders) {
        if (o.status === "pending" || o.status === "resolved" || o.status === "rejected") {
          if (!cards.has(`seal:${o.id}`)) continue; // never needed the seal
        }
        const key = `seal:${o.id}`;
        const person = state.court[o.actor];
        const cardState = {
          orderId: o.id,
          actor: o.actor,
          actorName: person?.name ?? o.actor,
          summary: describeOrder(state, o.order),
          rationale: o.rationale,
          status: o.status,
          reason: o.reason,
          heraldParticipantId: herald.participantId,
          season: seasonLabel(state),
        };
        const existing = cards.get(key);
        if (!existing) {
          if (o.status !== "awaiting_seal") continue;
          const client = await this.connect();
          const { messageId } = await client.publishCustomMessage({ typeId: SEAL_TYPE, initialState: cardState, displayMode: "inline" }, { idempotencyKey: `regency:${key}` });
          await this.game.setCard({ key, channelId: this.channelId, messageId, kind: "seal" });
        } else if (previous && previous.orders.find((p) => p.id === o.id)?.status !== o.status) {
          const client = await this.connect();
          await client.updateCustomMessage(existing.messageId, cardState, { idempotencyKey: `regency:${key}:${o.status}` });
        }
      }
      // Matters of state.
      for (const c of state.crises) {
        const key = `matter:${c.id}`;
        const cardState = {
          crisisId: c.id,
          title: c.title,
          text: c.text,
          options: c.options.map((o) => ({ id: o.id, label: o.label, text: o.text, effects: describeEffects(state, o.effects), adviser: o.adviser ?? null })),
          defaultOption: c.defaultOption,
          chosen: c.chosen,
          decidedBy: c.decidedBy,
          heraldParticipantId: herald.participantId,
          season: seasonLabel({ season: c.season, startYear: state.startYear }),
        };
        const existing = cards.get(key);
        if (!existing) {
          if (c.chosen !== null) continue;
          const client = await this.connect();
          const { messageId } = await client.publishCustomMessage({ typeId: MATTER_TYPE, initialState: cardState, displayMode: "inline" }, { idempotencyKey: `regency:${key}` });
          await this.game.setCard({ key, channelId: this.channelId, messageId, kind: "matter" });
        } else {
          const prev = previous?.state?.crises.find((p) => p.id === c.id);
          if (prev && prev.chosen !== c.chosen) {
            const client = await this.connect();
            await client.updateCustomMessage(existing.messageId, cardState, { idempotencyKey: `regency:${key}:${c.chosen}` });
          }
        }
      }
      // Season digests, one row card per season passed.
      const season = state.season;
      const key = `season:${season}`;
      if (season > 0 && state.digest.length > 0 && !cards.has(key)) {
        const highlights = view.events.filter((e) => e.season === season - 1 && ["battle", "capture", "treaty", "war", "famine", "revolt", "crisis"].includes(e.kind)).slice(-8).map((e) => ({ kind: e.kind, text: e.text }));
        const player = state.realms[state.playerRealm]!;
        const cardState = {
          season: seasonLabel(state),
          digest: state.digest[state.digest.length - 1],
          highlights,
          treasury: player.treasury,
          legitimacy: player.legitimacy,
          estates: player.estates,
          outcome: state.outcome ? { kind: state.outcome.kind, title: state.outcome.title, reason: state.outcome.reason, verdict: state.outcome.verdict ?? null } : null,
        };
        const client = await this.connect();
        const { messageId } = await client.publishCustomMessage({ typeId: SEASON_TYPE, initialState: cardState, displayMode: "row" }, { idempotencyKey: `regency:${key}` });
        await this.game.setCard({ key, channelId: this.channelId, messageId, kind: "season" });
      }
      // Council debates: one card per debate, updated as the ministers answer.
      for (const d of view.debates) {
        const key = `debate:${d.id}`;
        const cardState = {
          debateId: d.id,
          question: d.question,
          status: d.status,
          season: seasonLabel({ season: d.season, startYear: state.startYear }),
          lines: d.lines,
          waiting: ["chancellor", "treasurer", "marshal", "envoy"].filter((r) => !d.lines.some((l) => l.role === r)),
        };
        const existing = cards.get(key);
        if (!existing) {
          const client = await this.connect();
          const { messageId } = await client.publishCustomMessage({ typeId: DEBATE_TYPE, initialState: cardState, displayMode: "inline" }, { idempotencyKey: `regency:${key}` });
          await this.game.setCard({ key, channelId: this.channelId, messageId, kind: "debate" });
        } else {
          const before = previous?.debates.find((p) => p.id === d.id);
          if (!before || before.lines.length !== d.lines.length || before.status !== d.status) {
            const client = await this.connect();
            await client.updateCustomMessage(existing.messageId, cardState, { idempotencyKey: `regency:${key}:${d.lines.length}:${d.status}` });
          }
        }
      }
      // The Lord Protector's hand-over, when the mandate has run out.
      for (const h of view.handovers) {
        const key = `handover:${h.id}`;
        if (cards.has(key)) continue;
        const client = await this.connect();
        const { messageId } = await client.publishCustomMessage(
          { typeId: HANDOVER_TYPE, initialState: { season: seasonLabel({ season: h.season, startYear: state.startYear }), mandate: h.mandate, text: h.text }, displayMode: "inline" },
          { idempotencyKey: `regency:${key}` },
        );
        await this.game.setCard({ key, channelId: this.channelId, messageId, kind: "handover" });
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * The Regent points at the map and speaks. The message carries the province
   * or army as metadata so the Herald routes it without guessing which one was
   * meant; the Herald's prompt says to expect it.
   */
  async speak(text: string, about: { province?: string; army?: string }): Promise<void> {
    const client = await this.connect();
    await client.send(text, { metadata: { regency: { ...(about.province ? { province: about.province } : {}), ...(about.army ? { army: about.army } : {}) } } });
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = null;
  }
}

export type { GameState };
