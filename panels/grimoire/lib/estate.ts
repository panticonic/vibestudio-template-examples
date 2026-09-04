/**
 * Seating the estate: the familiar's two rooms (the circle and the study are
 * two channels over one agent), one channel per spirit opened lazily the
 * first time the player goes to it, and one per chartered golem. Agents are
 * ordinary workspace chat agents (`workers/grimoire-agents`) subscribed to
 * those channels with a seat in their config. Everything here is idempotent.
 */
import { contextId as runtimeContextId, openPanel, panelTree, rpc, workers } from "@workspace/runtime";
import { addAgentToChannel, agentObjectKey } from "@workspace-skills/agents";
import { waitForApprovalResolution } from "@workspace/pubsub";
import type { AgentSeatConfig, Participant, SpiritId } from "@workspace/grimoire-engine";
import { hallChannelKey } from "@workspace/grimoire-engine";
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

interface InstalledAgent {
  agentId: string;
  handle: string;
  key: string;
  source: string;
  className: string;
  config: Record<string, unknown>;
}

export interface SeatResult {
  participant: Participant | null;
  installation: InstalledAgent | null;
  error: string | null;
}

interface ConversationPresentation {
  eyebrow: string;
  title: string;
  subtitle: string;
  sigil: string;
  emptyTitle: string;
  emptyBody: string;
  composerPlaceholder: string;
  headingFont: string;
  bodyFont: string;
  palette: Record<string, string>;
}

function installation(
  channelId: string,
  config: AgentSeatConfig & { handle: string; name: string },
): InstalledAgent {
  return {
    agentId: AGENT_CLASS,
    handle: config.handle,
    key: agentObjectKey(config.handle, channelId),
    source: AGENT_SOURCE,
    className: AGENT_CLASS,
    config: { ...config, respondPolicy: "all" },
  };
}

async function seat(client: EstateClient, channelId: string, config: AgentSeatConfig, room: "circle" | "study" | null): Promise<SeatResult> {
  const contextId = runtimeContextId;
  if (!contextId) return { participant: null, installation: null, error: "The panel has no context; cannot seat the estate." };
  try {
    await ensureChannel(channelId, contextId);
    const handle = config.handle ?? config.role.replace(":", "-");
    const name = config.name ?? config.role;
    const completeConfig = { ...config, handle, name };
    const result = await addAgentToChannel({
      source: AGENT_SOURCE,
      className: AGENT_CLASS,
      handle,
      name,
      channelId,
      contextId,
      replay: false,
      config: { ...completeConfig, respondPolicy: "all" },
      waitForReview: (approvalId) => waitForApprovalResolution(rpc, approvalId),
    });
    if (!result.ok) throw new Error(`the agent could not join ${channelId}`);
    if (!result.targetId || !result.participantId) throw new Error(`the agent joined ${channelId} without a target or participant id`);
    const participant: Participant = { role: config.role, channelId, participantId: result.participantId, targetId: result.targetId, handle, name, apprentice: config.apprentice ?? null, room };
    await client.call("registerParticipant", participant);
    await client.call("setChannel", { key: channelId, channelId });
    return { participant, installation: installation(channelId, completeConfig), error: null };
  } catch (err) {
    return { participant: null, installation: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function existingSeat(
  participant: Participant | null,
  channelId: string,
  config: AgentSeatConfig & { handle: string; name: string },
): SeatResult | null {
  return participant
    ? { participant, installation: installation(channelId, config), error: null }
    : null;
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
  const participants = await client.call("listParticipants", {});
  const has = (channelId: string) => participants.find((p) => p.channelId === channelId) ?? null;
  const dir = directory(estateKey, apprentice);
  onProgress?.("The hearth notices you.");
  const circleId = circleChannelKey(estateKey, apprentice);
  const circleConfig: AgentSeatConfig & { handle: string; name: string } = { role: "familiar", estateKey, apprentice, apprenticeName, room: "circle", handle: "familiar", name: "the familiar", directory: dir };
  const circle = existingSeat(has(circleId), circleId, circleConfig) ?? await seat(client, circleId, circleConfig, "circle");
  onProgress?.(circle.error ? `The circle is cold: ${circle.error}` : "The familiar looks up.");
  const studyId = studyChannelKey(estateKey, apprentice);
  const studyConfig: AgentSeatConfig & { handle: string; name: string } = { role: "familiar", estateKey, apprentice, apprenticeName, room: "study", handle: "familiar", name: "the familiar", directory: dir };
  const study = existingSeat(has(studyId), studyId, studyConfig) ?? await seat(client, studyId, studyConfig, "study");
  onProgress?.(study.error ? `The study is locked: ${study.error}` : "The study door is unlatched.");
  return { circle, study };
}

/** Seat a spirit in its channel the first time the player goes to it. */
export async function seatSpirit(client: EstateClient, spirit: SpiritId | "moor", apprentice: string): Promise<SeatResult> {
  const estateKey = client.estateKey;
  const channelId = spiritChannelKey(estateKey, spirit);
  const participants = await client.call("listParticipants", {});
  const existing = participants.find((p) => p.channelId === channelId);
  const config: AgentSeatConfig & { handle: string; name: string } = { role: spirit === "moor" ? "moor" : `spirit:${spirit}`, estateKey, handle: spirit, name: SPIRIT_TITLES[spirit] ?? spirit, directory: directory(estateKey, apprentice) };
  return existingSeat(existing ?? null, channelId, config) ?? seat(client, channelId, config, null);
}

/** Seat a chartered golem: its charter becomes a mission it explains in its own channel. */
export async function seatGolem(client: EstateClient, golem: string, apprentice: string): Promise<SeatResult> {
  const estateKey = client.estateKey;
  const channelId = golemChannelKey(estateKey, golem);
  const participants = await client.call("listParticipants", {});
  const existing = participants.find((p) => p.channelId === channelId);
  const config: AgentSeatConfig & { handle: string; name: string } = { role: `golem:${golem}`, estateKey, handle: golem.toLowerCase(), name: golem, directory: directory(estateKey, apprentice) };
  return existingSeat(existing ?? null, channelId, config) ?? seat(client, channelId, config, null);
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

const GRIMOIRE_PRESENTATION: ConversationPresentation = {
  eyebrow: "A living correspondence",
  title: "The Familiar",
  subtitle: "Ask plainly. The familiar remembers the estate and will lead you onward.",
  sigil: "✦",
  emptyTitle: "The hearth is listening",
  emptyBody: "You do not need to know the rules. Ask what deserves attention, describe what you hope to change, or simply say that you are lost.",
  composerPlaceholder: "Speak to the familiar…",
  headingFont: "Georgia, 'Times New Roman', serif",
  bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
  palette: {
    surface: "#101611",
    card: "#19231b",
    raised: "#223126",
    border: "rgba(126, 190, 133, .34)",
    text: "#f1ead8",
    muted: "#aeb8a5",
    accent: "#76cf88",
    rail: "#4fa967",
    playerSurface: "rgba(93, 183, 111, .12)",
    playerSurfaceStrong: "rgba(93, 183, 111, .2)",
  },
};

async function openSeatedConversation(
  channelId: string,
  seats: SeatResult[],
  presentation: ConversationPresentation = GRIMOIRE_PRESENTATION,
  initialPrompt?: string,
): Promise<void> {
  const failed = seats.find((seat) => seat.error || !seat.participant || !seat.installation);
  if (failed) throw new Error(failed.error ?? "The intended voice has not reached this room yet.");
  const stateArgs = {
    channelName: channelId,
    installedAgents: seats.map((seat) => seat.installation!),
    defaultRecipients: seats.map((seat) => seat.participant!.participantId),
    presentation,
    ...(initialPrompt
      ? {
          initialPrompt,
          forceInitialPrompt: true,
          initialPromptIdempotencyKey: `grimoire-guidance:${crypto.randomUUID()}`,
        }
      : {}),
  };
  const existing = await findChatPanelForChannel(channelId);
  if (existing) {
    const handle = panelTree.get(existing);
    await handle.stateArgs.set(stateArgs);
    await handle.reload();
    await handle.focus();
    return;
  }
  const contextId = runtimeContextId;
  if (!contextId) throw new Error("The panel has no context.");
  await openPanel(CHAT_PANEL_SOURCE, { focus: true, title: presentation.title, contextId, placement: { disposition: "side-if-room" }, stateArgs });
}

export async function openFamiliarConversation(
  client: EstateClient,
  apprentice: string,
  room: "circle" | "study" = "circle",
  initialPrompt?: string,
): Promise<void> {
  const overview = await client.call("overview", { apprentice });
  const apprenticeName = overview.apprentices.find((row) => row.id === apprentice)?.name ?? apprentice;
  const familiar = await seatFamiliar(client, apprentice, apprenticeName);
  const channelId = room === "study"
    ? studyChannelKey(client.estateKey, apprentice)
    : circleChannelKey(client.estateKey, apprentice);
  await openSeatedConversation(
    channelId,
    [room === "study" ? familiar.study : familiar.circle],
    GRIMOIRE_PRESENTATION,
    initialPrompt,
  );
}

export async function openSpiritConversation(
  client: EstateClient,
  spirit: SpiritId | "moor",
  apprentice: string,
): Promise<void> {
  const seatResult = await seatSpirit(client, spirit, apprentice);
  const title = SPIRIT_TITLES[spirit] ?? spirit;
  await openSeatedConversation(spiritChannelKey(client.estateKey, spirit), [seatResult], {
    ...GRIMOIRE_PRESENTATION,
    eyebrow: "A voice bound to place",
    title,
    subtitle: `Speak in verse. ${title} answers according to its nature and its hour.`,
    emptyTitle: `${title} is listening`,
    composerPlaceholder: `Verse for ${title}…`,
  });
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

/**
 * A hall: two or more spirits seated together in one channel so they can
 * argue in public. The world is told (`convene`) and wakes each of them
 * with the topic; the player may be admitted by opening the conversation.
 */
export async function convene(client: EstateClient, spirits: SpiritId[], topic: string, apprentice: string): Promise<{ ok: boolean; reason?: string; channelId: string; seats: SeatResult[] }> {
  const estateKey = client.estateKey;
  const channelId = hallChannelKey(estateKey, spirits);
  const participants = await client.call("listParticipants", {});
  const seated: SeatResult[] = [];
  for (const id of spirits) {
    if (participants.some((p) => p.channelId === channelId && p.role === `spirit:${id}`)) continue;
    const r = await seat(client, channelId, { role: `spirit:${id}`, estateKey, handle: id, name: SPIRIT_TITLES[id] ?? id, directory: directory(estateKey, apprentice) }, null);
    seated.push(r);
    if (r.error) return { ok: false, reason: r.error, channelId, seats: seated };
  }
  for (const id of spirits) {
    if (seated.some((row) => row.participant?.role === `spirit:${id}`)) continue;
    const config: AgentSeatConfig & { handle: string; name: string } = { role: `spirit:${id}`, estateKey, handle: id, name: SPIRIT_TITLES[id] ?? id, directory: directory(estateKey, apprentice) };
    const participant = participants.find((p) => p.channelId === channelId && p.role === `spirit:${id}`) ?? null;
    const restored = existingSeat(participant, channelId, config);
    if (restored) seated.push(restored);
  }
  const out = await client.call("convene", { apprentice, spirits, topic, channelId });
  return { ok: out.ok, reason: out.reason, channelId, seats: seated };
}

export async function openHallConversation(
  client: EstateClient,
  channelId: string,
  spirits: SpiritId[],
  apprentice: string,
): Promise<void> {
  const participants = await client.call("listParticipants", {});
  const seats = await Promise.all(spirits.map(async (id) => {
    const config: AgentSeatConfig & { handle: string; name: string } = { role: `spirit:${id}`, estateKey: client.estateKey, handle: id, name: SPIRIT_TITLES[id] ?? id, directory: directory(client.estateKey, apprentice) };
    const found = participants.find((p) => p.channelId === channelId && p.role === `spirit:${id}`) ?? null;
    return existingSeat(found, channelId, config) ?? seat(client, channelId, config, null);
  }));
  await openSeatedConversation(channelId, seats, {
    ...GRIMOIRE_PRESENTATION,
    eyebrow: "A hall of contrary voices",
    title: spirits.map((id) => SPIRIT_TITLES[id] ?? id).join(" & "),
    subtitle: "Listen to the spirits contend, or address one by name.",
    emptyTitle: "The hall holds its breath",
    composerPlaceholder: "Speak before the hall…",
  });
}
