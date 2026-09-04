/**
 * Seating the court: one conversation for the Regent's council, private
 * chambers for each minister, one court per rival sovereign, one embassy per
 * rival at the Regent's side, and a seat for a Lord Protector. Agents are
 * ordinary workspace chat agents (`workers/regency-agents`) subscribed to
 * those channels with a seat in their config. Everything here is idempotent
 * so the court can be re-seated after a failure.
 */
import { contextId as runtimeContextId, openPanel, panelTree, rpc } from "@workspace/runtime";
import { addAgentToChannel } from "@workspace-skills/agents";
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
  await rpc.call(
    "main",
    "runtime.createEntity",
    [{ kind: "do", execution: { surface: "code", source: CHANNEL_SOURCE }, className: CHANNEL_CLASS, key: channelId, contextId }],
    { idempotencyKey: `${channelId}:create` },
  );
}

export interface SeatProgress {
  seat: Seat;
  status: "pending" | "seating" | "seated" | "failed";
  error?: string;
}

/** Create channels and agents for every seat, register them with the game, then open the court. */
export async function seatTheCourt(client: GameClient, state: GameState, onProgress?: (rows: SeatProgress[]) => void): Promise<Participant[]> {
  const contextId = runtimeContextId;
  if (!contextId) throw new Error("The panel has no context; cannot seat the court.");
  const seats = planSeats(client.gameKey, state);
  const rows: SeatProgress[] = seats.map((seat) => ({ seat, status: "pending" }));
  const emit = () => onProgress?.(rows.map((r) => ({ ...r })));
  emit();
  for (const channelId of new Set(seats.map((s) => s.channelId))) await ensureChannel(channelId, contextId);
  const player = state.realms[state.playerRealm]!;
  let participants: Participant[] = [];
  for (const row of rows) {
    row.status = "seating";
    emit();
    const seat = row.seat;
    const person = state.court[seat.role];
    try {
      const result = await addAgentToChannel({
        source: AGENT_SOURCE,
        className: AGENT_CLASS,
        handle: seat.handle,
        name: seat.name,
        channelId: seat.channelId,
        contextId,
        replay: false,
        config: {
          role: seat.role,
          realm: seat.realm,
          realmName: seat.realmName,
          gameKey: client.gameKey,
          handle: seat.handle,
          name: seat.name,
          ...(seat.character ? { character: seat.character } : {}),
          regencyName: player.name,
          ...(state.legend && (seat.role.startsWith("sovereign:") || seat.role.startsWith("ambassador:")) ? { legend: state.legend } : {}),
          directory: directoryFor(seat, seats),
          ...(person ? { person: { name: person.name, house: person.house, ambition: person.ambition, temperament: person.temperament, rival: person.rival } } : {}),
          respondPolicy: seat.respondPolicy,
        },
      });
      if (!result.ok) throw new Error(`the agent could not join ${seat.channelId}`);
      if (!result.targetId || !result.participantId) throw new Error(`the agent joined ${seat.channelId} without a target or participant id, so the game cannot bind the seat to it`);
      participants = await client.registerParticipant({ role: seat.role, realm: seat.realm, channelId: seat.channelId, participantId: result.participantId, targetId: result.targetId, handle: seat.handle, name: seat.name, kind: seat.kind });
      row.status = "seated";
    } catch (err) {
      row.status = "failed";
      row.error = err instanceof Error ? err.message : String(err);
    }
    emit();
  }
  await client.openCourt().catch(() => undefined);
  return participants;
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

/** Open (or focus) the conversation panel for a court, chamber or embassy channel. */
export async function openCourt(channelId: string): Promise<void> {
  const existing = await findChatPanelForChannel(channelId);
  if (existing) {
    await panelTree.get(existing).focus();
    return;
  }
  const contextId = runtimeContextId;
  if (!contextId) throw new Error("The panel has no context.");
  await openPanel(CHAT_PANEL_SOURCE, { focus: true, contextId, placement: { disposition: "side-if-room" }, stateArgs: { channelName: channelId } });
}
