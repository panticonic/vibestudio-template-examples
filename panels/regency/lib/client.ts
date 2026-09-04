/**
 * Thin client for the Regency state service (`examples.regency.v1`).
 * One game per object key; the panel's `stateArgs.gameKey` selects it.
 */
import { rpc, workers } from "@workspace/runtime";
import type { Crisis, GameState, Order, RealmId, RegentPromise, StagedIntent } from "@workspace/regency-engine";

export const REGENCY_PROTOCOL = "examples.regency.v1";

export type MandateLevel = "advise" | "act" | "plenary";
export type OrderStatus = "pending" | "awaiting_seal" | "vetoed" | "withdrawn" | "resolved" | "rejected";

export interface OrderRow {
  id: string;
  season: number;
  realm: RealmId;
  actor: string;
  order: Order;
  rationale: string;
  status: OrderStatus;
  reason: string | null;
  submittedAt: string;
}

export interface Participant {
  role: string;
  realm: RealmId;
  channelId: string;
  participantId: string;
  targetId: string;
  handle: string;
  name: string;
  kind?: "court" | "chambers";
}

export interface Briefing {
  id: string;
  season: number;
  role: string;
  targetId: string;
  channelId: string;
  content: string;
  status: "pending" | "delivered" | "failed";
  error: string | null;
  attempts: number;
}

export interface EventRow {
  seq: number;
  season: number;
  kind: string;
  text: string;
  realms: RealmId[];
  province?: string;
  data?: Record<string, unknown>;
}

export interface ProtectorLimits {
  maySealWar: boolean;
  maySealLaws: boolean;
  maySealTreaties: boolean;
  mayDecideCrises: boolean;
  mayCloseSeason: boolean;
}

export interface Protectorate {
  active: boolean;
  mandate: string;
  seasonsLeft: number;
  limits: ProtectorLimits;
  startedSeason: number;
}

export interface Bribe {
  id: string;
  season: number;
  fromRealm: RealmId;
  targetRole: string;
  gold: number;
  note: string;
  status: "pending" | "accepted" | "reported" | "expired";
  untilSeason: number | null;
}

export interface Debate {
  id: string;
  season: number;
  question: string;
  openedBy: string;
  status: "open" | "closed";
  lines: Array<{ role: string; name: string; text: string }>;
}

export interface ChronicleEntry {
  year: number;
  season: number;
  text: string;
}

export interface Handover {
  id: string;
  season: number;
  mandate: string;
  text: string;
}

export interface SecretHistory {
  bribes: Bribe[];
  dossiers: Array<{ role: string; text: string }>;
  doctrines: Array<{ realm: RealmId; text: string; season: number }>;
  promises: RegentPromise[];
  diaries: Array<{ realm: RealmId; text: string }>;
  chambers: Array<{ role: string; channelId: string }>;
}

export interface GameView {
  state: GameState | null;
  participants: Participant[];
  mandates: Record<string, MandateLevel>;
  orders: OrderRow[];
  events: EventRow[];
  briefings: Briefing[];
  waitingFor: RealmId[];
  snapshots: number[];
  protectorate: Protectorate | null;
  bribes: Bribe[];
  dossiers: Array<{ role: string; text: string }>;
  doctrines: Array<{ realm: RealmId; text: string; season: number }>;
  intents: StagedIntent[];
  promises: RegentPromise[];
  debates: Debate[];
  chronicles: ChronicleEntry[];
  handovers: Handover[];
  secrets: SecretHistory | null;
}

export interface Forecast {
  season: string;
  treasury: { before: number; after: number };
  legitimacy: { before: number; after: number };
  estates: Record<string, number>;
  provinces: { before: number; after: number };
  wars: string[];
  events: string[];
  rejected: string[];
  assumption: string;
}

export type SubmitOrderResult =
  | { ok: true; orderId: string; status: OrderStatus; summary: string; needsSeal: boolean }
  | { ok: false; reason: string };

export class GameClient {
  private targetId: string | null = null;

  constructor(readonly gameKey: string) {}

  private async target(): Promise<string> {
    if (this.targetId) return this.targetId;
    const svc = await workers.resolveService(REGENCY_PROTOCOL, this.gameKey);
    if (svc.kind !== "durable-object") throw new Error("The Regency service is not a Durable Object service.");
    this.targetId = svc.targetId;
    return svc.targetId;
  }

  async call<T>(method: string, ...args: unknown[]): Promise<T> {
    return rpc.call<T>(await this.target(), method, args);
  }

  getGame(): Promise<GameView> {
    return this.call<GameView>("getGame");
  }

  getSnapshot(season: number): Promise<GameState | null> {
    return this.call("getSnapshot", { season });
  }

  newGame(input: { seed: string; realmName: string; rivals: number; regencySeasons?: number; scenario: "long" | "winter"; regentName?: string }): Promise<{ title: string }> {
    return this.call("newGame", input);
  }

  submitOrder(input: { realm: RealmId; actor: string; order: Order; rationale?: string }): Promise<SubmitOrderResult> {
    return this.call("submitOrder", input);
  }

  sealOrder(orderId: string, decision: "seal" | "veto", note?: string): Promise<{ ok: boolean; reason?: string }> {
    return this.call("sealOrder", { orderId, decision, note });
  }

  decideCrisis(crisisId: string, optionId: string, note?: string): Promise<{ ok: boolean; reason?: string; crisis?: Crisis }> {
    return this.call("decideCrisis", { crisisId, optionId, note });
  }

  forecast(input: { orders?: Order[]; includeOrderIds?: string[] }): Promise<Forecast> {
    return this.call("forecast", input);
  }

  setMandate(role: string, level: MandateLevel): Promise<Record<string, MandateLevel>> {
    return this.call("setMandate", { role, level });
  }

  closeSeason(): Promise<{ resolved: boolean; waitingFor: RealmId[]; season: string }> {
    return this.call("closeSeason");
  }

  proceedWithoutPending(): Promise<{ resolved: boolean; stewarded: RealmId[]; season: string }> {
    return this.call("proceedWithoutPending");
  }

  redeliverBriefings(): Promise<{ delivered: number; failed: number }> {
    return this.call("redeliverBriefings");
  }

  registerParticipant(p: Participant): Promise<Participant[]> {
    return this.call("registerParticipant", p);
  }

  openCourt(): Promise<{ delivered: number; failed: number }> {
    return this.call("openCourt");
  }

  appointProtector(input: { mandate: string; seasons: number; limits: Partial<ProtectorLimits> }): Promise<Protectorate> {
    return this.call("appointProtector", input);
  }

  dismissProtector(): Promise<Protectorate | null> {
    return this.call("dismissProtector");
  }

  /** The Regent puts a question to the whole council; every seated minister answers on the record. */
  convene(question: string): Promise<{ ok: boolean; reason?: string; debateId?: string; asked?: string[] }> {
    return this.call("convene", { actor: "regent", question });
  }

  closeDebate(debateId: string): Promise<{ ok: boolean; reason?: string }> {
    return this.call("closeDebate", { debateId });
  }

  settlePromise(promiseId: string, status: "kept" | "broken"): Promise<{ ok: boolean; reason?: string }> {
    return this.call("settlePromise", { promiseId, status });
  }

  clearIntent(actor: string, intentId?: string): Promise<{ ok: boolean; cleared: number }> {
    return this.call("clearIntent", { actor, ...(intentId ? { intentId } : {}) });
  }

  renameArmy(army: string, name: string): Promise<{ ok: boolean; reason?: string; name?: string }> {
    return this.call("renameArmy", { actor: "regent", army, name });
  }

  report(input: { kind: "realm" | "province" | "map" | "chronicle" | "rules"; realm?: string; province?: string }): Promise<string> {
    return this.call("report", input);
  }
}
