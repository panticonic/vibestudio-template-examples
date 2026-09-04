/**
 * Seating the estate: the familiar's two rooms (the circle and the study are
 * two channels over one agent), one channel per spirit opened lazily the
 * first time the player goes to it, and one per chartered golem. Agents are
 * ordinary workspace chat agents (`workers/grimoire-agents`) subscribed to
 * those channels with a seat in their config. Everything here is idempotent.
 */
import { contextId as runtimeContextId, openPanel, panelTree, workers } from "@workspace/runtime";
import { addAgentToChannel } from "@workspace-skills/agents";
import type { AgentSeatConfig, Participant, SpiritId } from "@workspace/grimoire-engine";
import type { EstateClient } from "./client.js";

const AGENT_SOURCE = "workers/grimoire-agents";
const AGENT_CLASS = "GrimoireAgentWorker";
const CHANNEL_SOURCE = "workers/pubsub-channel";
const CHANNEL_CLASS = "PubSubChannel";
const CHAT_PANEL_SOURCE = "panels/chat";

export const circleChannelKey = (estateKey: string, apprentice: string) => `grimoire-${estateKey}-circle-${apprentice}`;
export const studyChannelKey = (estateKey: string, apprentice: string) => `grimoire-${estateKey}-study-${apprentice}`;
export const spiritChannelKey = (estateKey: string, spirit: SpiritId | "moor") => `grimoire-${estateKey}-spirit-${spirit}`;
export const golemChannelKey = (estateKey: string, golem: string) => `grimoire-${estateKey}-golem-${golem.toLowerCase()}`;

export const SPIRIT_TITLES: Record<string, string> = {
  hearth: "the Hearth", river: "the River", library: "the Library", foundry: "the Foundry", mill: "the Mill", bell: "the Bell",
  glass: "the Glass", orchard: "the Orchard", deep: "the Deep", boneyard: "the Boneyard", ridge: "the Ridge", moor: "the Moor",
};

async function ensureChannel(channelId: string, contextId: string): Promise<void> {
  await workers.createDurableObject(CHANNEL_SOURCE, CHANNEL_CLASS, { key: channelId, contextId });
}

export interface SeatResult { participant: Participant | null; error: string | null }

async function seat(client: EstateClient, channelId: string, config: AgentSeatConfig, room: "circle" | "study" | null): Promise<SeatResult> {
  const contextId = runtimeContextId;
  if (!contextId) return { participant: null, error: "The panel has no context; cannot seat the estate." };
  try {
    await ensureChannel(channelId, contextId);
    const handle = config.handle ?? config.role.replace(":", "-");
    const name = config.name ?? config.role;
    const result = await addAgentToChannel({
      source: AGENT_SOURCE,
      className: AGENT_CLASS,
      handle,
      name,
      channelId,
      contextId,
      replay: false,
      config: { ...config, handle, name, respondPolicy: "all" },
    });
    if (!result.ok) throw new Error(`the agent could not join ${channelId}`);
    if (!result.targetId || !result.participantId) throw new Error(`the agent joined ${channelId} without a target or participant id`);
    const participant: Participant = { role: config.role, channelId, participantId: result.participantId, targetId: result.targetId, handle, name, apprentice: config.apprentice ?? null, room };
    await client.call("registerParticipant", participant);
    await client.call("setChannel", { key: channelId, channelId });
    return { participant, error: null };
  } catch (err) {
    return { participant: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function directory(estateKey: string, apprentice: string): AgentSeatConfig["directory"] {
  const rows: NonNullable<AgentSeatConfig["directory"]> = [
    { role: "familiar:circle", name: "the familiar, in the circle", ref: `agent:familiar@${circleChannelKey(estateKey, apprentice)}` },
    { role: "familiar:study", name: "the familiar, in the study", ref: `agent:familiar@${studyChannelKey(estateKey, apprentice)}` },
  ];
  for (const [id, title] of Object.entries(SPIRIT_TITLES)) rows.push({ role: `spirit:${id}`, name: title, ref: `agent:${id}@${spiritChannelKey(estateKey, id as SpiritId)}` });
  return rows;
}

/** Seat the familiar in the circle and the study for one apprentice. */
export async function seatFamiliar(client: EstateClient, apprentice: string, apprenticeName: string, onProgress?: (line: string) => void): Promise<{ circle: SeatResult; study: SeatResult }> {
  const estateKey = client.estateKey;
  const participants = await client.call("listParticipants", {}).catch(() => [] as Participant[]);
  const has = (channelId: string) => participants.find((p) => p.channelId === channelId) ?? null;
  const dir = directory(estateKey, apprentice);
  onProgress?.("The hearth notices you.");
  const circleId = circleChannelKey(estateKey, apprentice);
  const circle = has(circleId) ? { participant: has(circleId), error: null } : await seat(client, circleId, { role: "familiar", estateKey, apprentice, apprenticeName, room: "circle", handle: "familiar", name: "the familiar", directory: dir }, "circle");
  onProgress?.(circle.error ? `The circle is cold: ${circle.error}` : "The familiar looks up.");
  const studyId = studyChannelKey(estateKey, apprentice);
  const study = has(studyId) ? { participant: has(studyId), error: null } : await seat(client, studyId, { role: "familiar", estateKey, apprentice, apprenticeName, room: "study", handle: "familiar", name: "the familiar", directory: dir }, "study");
  onProgress?.(study.error ? `The study is locked: ${study.error}` : "The study door is unlatched.");
  return { circle, study };
}

/** Seat a spirit in its channel the first time the player goes to it. */
export async function seatSpirit(client: EstateClient, spirit: SpiritId | "moor", apprentice: string): Promise<SeatResult> {
  const estateKey = client.estateKey;
  const channelId = spiritChannelKey(estateKey, spirit);
  const participants = await client.call("listParticipants", {}).catch(() => [] as Participant[]);
  const existing = participants.find((p) => p.channelId === channelId);
  if (existing) return { participant: existing, error: null };
  return seat(client, channelId, { role: spirit === "moor" ? "moor" : `spirit:${spirit}`, estateKey, handle: spirit, name: SPIRIT_TITLES[spirit] ?? spirit, directory: directory(estateKey, apprentice) }, null);
}

/** Seat a chartered golem: its charter becomes a mission it explains in its own channel. */
export async function seatGolem(client: EstateClient, golem: string, apprentice: string): Promise<SeatResult> {
  const estateKey = client.estateKey;
  const channelId = golemChannelKey(estateKey, golem);
  const participants = await client.call("listParticipants", {}).catch(() => [] as Participant[]);
  const existing = participants.find((p) => p.channelId === channelId);
  if (existing) return { participant: existing, error: null };
  return seat(client, channelId, { role: `golem:${golem}`, estateKey, handle: golem.toLowerCase(), name: golem, directory: directory(estateKey, apprentice) }, null);
}

async function findChatPanelForChannel(channelId: string): Promise<string | null> {
  const visit = async (group: { kind: "roots" } | { kind: "children"; parentSlotId: string }): Promise<string | null> => {
    let cursor: string | undefined;
    do {
      const page = group.kind === "roots"
        ? await panelTree.roots({ ...(cursor ? { cursor } : {}), limit: 100 })
        : await panelTree.children(group.parentSlotId, { ...(cursor ? { cursor } : {}), limit: 100 });
      for (const entry of page.entries) {
        if (entry.node.source === CHAT_PANEL_SOURCE) {
          const args = await entry.handle.stateArgs.get<{ channelName?: string }>().catch(() => ({}) as { channelName?: string });
          if (args.channelName === channelId) return entry.node.slotId;
        }
        if (entry.node.childCount > 0) {
          const nested = await visit({ kind: "children", parentSlotId: entry.node.slotId });
          if (nested) return nested;
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return null;
  };
  return visit({ kind: "roots" });
}

/** Open (or focus) the conversation panel for a channel. */
export async function openConversation(channelId: string): Promise<void> {
  const existing = await findChatPanelForChannel(channelId);
  if (existing) {
    await panelTree.get(existing).focus();
    return;
  }
  const contextId = runtimeContextId;
  if (!contextId) throw new Error("The panel has no context.");
  await openPanel(CHAT_PANEL_SOURCE, { focus: true, contextId, placement: { disposition: "side-if-room" }, stateArgs: { channelName: channelId } });
}

/** A stable apprentice id when the workspace gives us none: kept in stateArgs. */
export function mintApprenticeId(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `apprentice-${s}`;
}
