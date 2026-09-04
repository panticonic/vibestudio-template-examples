/**
 * Seating the court: one conversation for the Regent's council, private
 * chambers for each minister, one court per rival sovereign, one embassy per
 * rival at the Regent's side, and a seat for a Lord Protector. Agents are
 * ordinary workspace chat agents (`workers/regency-agents`) subscribed to
 * those channels with a seat in their config. Everything here is idempotent
 * so the court can be re-seated after a failure.
 */
import { contextId as runtimeContextId, openPanel, panelTree, rpc, workers } from "@workspace/runtime";
import { addAgentToChannel, agentObjectKey } from "@workspace-skills/agents";
import { waitForApprovalResolution } from "@workspace/pubsub";
import type { GameState } from "@workspace/regency-engine";
import type { GameClient, Participant } from "./client.js";

const AGENT_SOURCE = "workers/regency-agents";
const AGENT_CLASS = "RegencyAgentWorker";
const CHANNEL_SOURCE = "workers/pubsub-channel";
const CHANNEL_CLASS = "PubSubChannel";
const CHAT_PANEL_SOURCE = "panels/chat";

export interface Seat {
  role: string;
  realm: string;
  realmName: string;
  handle: string;
  name: string;
  channelId: string;
  kind: "court" | "chambers";
  respondPolicy: "all" | "mentioned-or-followup";
  character?: string;
}

export const courtChannel = (gameKey: string) => `regency-${gameKey}-court`;
export const chambersChannel = (gameKey: string, role: string) => `regency-${gameKey}-chambers-${role}`;
export const rivalCourtChannel = (gameKey: string, realm: string) => `regency-${gameKey}-court-${realm}`;
export const embassyChannel = (gameKey: string, realm: string) => `regency-${gameKey}-embassy-${realm}`;

export const MINISTERS = ["chancellor", "treasurer", "marshal", "envoy"] as const;
const COUNCIL: Array<{ role: string; name: string }> = [
  { role: "herald", name: "The Herald" },
  { role: "chancellor", name: "The Chancellor" },
  { role: "treasurer", name: "The Treasurer" },
  { role: "marshal", name: "The Marshal" },
  { role: "envoy", name: "The Envoy" },
  { role: "protector", name: "The Lord Protector" },
  { role: "chronicler", name: "The Chronicler" },
];

export function planSeats(gameKey: string, state: GameState): Seat[] {
  const player = state.realms[state.playerRealm]!;
  const seats: Seat[] = COUNCIL.map((m) => ({
    role: m.role,
    realm: player.id,
    realmName: player.name,
    handle: m.role,
    name: state.court[m.role]?.name ? `${state.court[m.role]!.name}, ${m.name.replace("The ", "")}` : m.name,
    channelId: courtChannel(gameKey),
    kind: "court",
    respondPolicy: m.role === "herald" ? "all" : "mentioned-or-followup",
  }));
  for (const role of MINISTERS) {
    seats.push({ role, realm: player.id, realmName: player.name, handle: role, name: `${state.court[role]?.name ?? role} (in private)`, channelId: chambersChannel(gameKey, role), kind: "chambers", respondPolicy: "all" });
  }
  for (const r of Object.values(state.realms)) {
    if (r.sovereign !== "agent") continue;
    const sov = state.court[`sovereign:${r.id}`];
    const amb = state.court[`ambassador:${r.id}`];
    seats.push({ role: `sovereign:${r.id}`, realm: r.id, realmName: r.name, handle: `sovereign-${r.id}`, name: sov ? `${sov.name} of ${r.name}` : `Sovereign of ${r.name}`, channelId: rivalCourtChannel(gameKey, r.id), kind: "court", respondPolicy: "all", character: r.character });
    seats.push({ role: `ambassador:${r.id}`, realm: r.id, realmName: r.name, handle: `ambassador-${r.id}`, name: amb ? `${amb.name}, Ambassador of ${r.name}` : `Ambassador of ${r.name}`, channelId: embassyChannel(gameKey, r.id), kind: "court", respondPolicy: "all", character: r.character });
  }
  return seats;
}

function directoryFor(seat: Seat, seats: Seat[]): Array<{ role: string; name: string; ref: string; privateRef?: string }> {
  const courts = seats.filter((s) => s.kind === "court" && s.role !== seat.role);
  return courts.map((s) => {
    const chambers = seats.find((c) => c.kind === "chambers" && c.role === s.role);
    return {
      role: s.role,
      name: s.name,
      ref: s.channelId === seat.channelId ? `@${s.handle}` : `agent:${s.handle}@${s.channelId}`,
      ...(chambers ? { privateRef: `agent:${chambers.handle}@${chambers.channelId}` } : {}),
    };
  });
}

async function ensureChannel(channelId: string, contextId: string): Promise<void> {
  await workers.createDurableObject(CHANNEL_SOURCE, CHANNEL_CLASS, { key: channelId, contextId });
}

export interface SeatProgress {
  seat: Seat;
  status: "pending" | "seating" | "seated" | "failed";
  error?: string;
}

interface InstalledAgent {
  agentId: string;
  handle: string;
  key: string;
  source: string;
  className: string;
  config: Record<string, unknown>;
}

function configForSeat(seat: Seat, seats: Seat[], state: GameState, gameKey: string) {
  const player = state.realms[state.playerRealm]!;
  const person = state.court[seat.role];
  return {
    role: seat.role,
    realm: seat.realm,
    realmName: seat.realmName,
    gameKey,
    handle: seat.handle,
    name: seat.name,
    ...(seat.character ? { character: seat.character } : {}),
    regencyName: player.name,
    ...(state.legend && (seat.role.startsWith("sovereign:") || seat.role.startsWith("ambassador:")) ? { legend: state.legend } : {}),
    directory: directoryFor(seat, seats),
    ...(person ? { person: { name: person.name, house: person.house, ambition: person.ambition, temperament: person.temperament, rival: person.rival } } : {}),
    respondPolicy: seat.respondPolicy,
  };
}

function installationForSeat(
  seat: Seat,
  seats: Seat[],
  state: GameState,
  gameKey: string,
): InstalledAgent {
  return {
    agentId: AGENT_CLASS,
    handle: seat.handle,
    key: agentObjectKey(seat.handle, seat.channelId),
    source: AGENT_SOURCE,
    className: AGENT_CLASS,
    config: configForSeat(seat, seats, state, gameKey),
  };
}

async function seatOne(
  client: GameClient,
  state: GameState,
  seats: Seat[],
  seat: Seat,
): Promise<Participant> {
  const contextId = runtimeContextId;
  if (!contextId) throw new Error("The panel has no context; cannot seat the court.");
  await ensureChannel(seat.channelId, contextId);
  const existing = (await client.getGame()).participants.find(
    (participant) => participant.channelId === seat.channelId && participant.role === seat.role,
  );
  if (existing) return existing;
  const result = await addAgentToChannel({
    source: AGENT_SOURCE,
    className: AGENT_CLASS,
    handle: seat.handle,
    name: seat.name,
    channelId: seat.channelId,
    contextId,
    replay: false,
    config: configForSeat(seat, seats, state, client.gameKey),
    waitForReview: (approvalId) => waitForApprovalResolution(rpc, approvalId),
  });
  if (!result.ok) throw new Error(`the agent could not join ${seat.channelId}`);
  if (!result.targetId || !result.participantId)
    throw new Error(`the agent joined ${seat.channelId} without a target or participant id`);
  const participant: Participant = {
    role: seat.role,
    realm: seat.realm,
    channelId: seat.channelId,
    participantId: result.participantId,
    targetId: result.targetId,
    handle: seat.handle,
    name: seat.name,
    kind: seat.kind,
  };
  await client.registerParticipant(participant);
  return participant;
}

/** Create channels and agents for every seat, register them with the game, then open the court. */
export async function seatTheCourt(client: GameClient, state: GameState, onProgress?: (rows: SeatProgress[]) => void): Promise<Participant[]> {
  if (!runtimeContextId) throw new Error("The panel has no context; cannot seat the court.");
  const seats = planSeats(client.gameKey, state);
  const rows: SeatProgress[] = seats.map((seat) => ({ seat, status: "pending" }));
  const emit = () => onProgress?.(rows.map((r) => ({ ...r })));
  emit();
  await Promise.all(rows.map(async (row) => {
    row.status = "seating";
    emit();
    try {
      await seatOne(client, state, seats, row.seat);
      row.status = "seated";
    } catch (err) {
      row.status = "failed";
      row.error = err instanceof Error ? err.message : String(err);
    }
    emit();
  }));
  const failures = rows.filter((row) => row.status === "failed");
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} court seat${failures.length === 1 ? "" : "s"} could not be prepared: ${failures.map((row) => `${row.seat.name}: ${row.error}`).join("; ")}`,
    );
  }
  await client.openCourt();
  return (await client.getGame()).participants;
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

function courtPresentation(channelId: string) {
  const privateRoom = channelId.includes("-chambers-");
  const embassy = channelId.includes("-embassy-");
  return {
    eyebrow: privateRoom ? "A private audience" : embassy ? "Across the border" : "The council is assembled",
    title: privateRoom ? "The Privy Chamber" : embassy ? "The Embassy" : "The Royal Court",
    subtitle: privateRoom
      ? "Speak candidly. This counsel is held apart from the public court."
      : embassy
        ? "Negotiate in words; promises and consequences remain in the realm."
        : "Address the Herald for guidance, or name a minister to seek particular counsel.",
    sigil: privateRoom ? "⚜" : embassy ? "✉" : "♛",
    emptyTitle: privateRoom ? "Your minister awaits" : "The court awaits your word",
    emptyBody: "You do not need to know the machinery of rule. Describe the problem, ask what requires attention, or ask the court to recommend your next move.",
    composerPlaceholder: privateRoom ? "Speak in confidence…" : "Address the court…",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
    palette: {
      surface: "#11140f",
      card: "#1d2119",
      raised: "#292d22",
      border: "rgba(196, 156, 61, .38)",
      text: "#f4ecd8",
      muted: "#b9b29f",
      accent: "#d6ad4a",
      rail: "#a77b1f",
      playerSurface: "rgba(214, 173, 74, .11)",
      playerSurfaceStrong: "rgba(214, 173, 74, .2)",
    },
  } as const;
}

/** Ensure the intended voices are seated, then open or focus their themed conversation. */
export async function openCourt(
  client: GameClient,
  state: GameState,
  channelId: string,
  initialPrompt?: string,
): Promise<void> {
  const seats = planSeats(client.gameKey, state);
  const channelSeats = seats.filter((seat) => seat.channelId === channelId);
  if (channelSeats.length === 0) throw new Error("No court belongs to that chamber.");
  const participants = await Promise.all(
    channelSeats.map((seat) => seatOne(client, state, seats, seat)),
  );
  const herald = participants.find((participant) => participant.role === "herald");
  const defaultRecipient = herald ?? participants[0];
  if (!defaultRecipient) throw new Error("The court could not find a voice to answer you.");
  const stateArgs = {
    channelName: channelId,
    installedAgents: channelSeats.map((seat) =>
      installationForSeat(seat, seats, state, client.gameKey),
    ),
    defaultRecipients: [defaultRecipient.participantId],
    presentation: courtPresentation(channelId),
    ...(initialPrompt
      ? {
          initialPrompt,
          forceInitialPrompt: true,
          initialPromptIdempotencyKey: `regency-guidance:${crypto.randomUUID()}`,
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
  await openPanel(CHAT_PANEL_SOURCE, { focus: true, title: stateArgs.presentation.title, contextId, placement: { disposition: "side-if-room" }, stateArgs });
}
