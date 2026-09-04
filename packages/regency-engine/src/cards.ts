/**
 * The chat cards of the Regency: one contract shared by the game object that
 * decides what a card says, the Herald that publishes it, and the renderers
 * that draw it. Type ids, state shapes and their schemas live here so a drift
 * between the three is a type error or a validation error, never a blank card.
 */
export const CARD_UI_VERSION = 2;
export const CARD_KEY_PREFIX = "regency";
export const CARD_RENDERER_DIR = "panels/regency/renderers";

export const SEAL_CARD = "regency.seal";
export const MATTER_CARD = "regency.matter";
export const SEASON_CARD = "regency.season";
export const DEBATE_CARD = "regency.debate";
export const HANDOVER_CARD = "regency.handover";
export const BRIEFING_CARD = "regency.briefing";
export const FORECAST_CARD = "regency.forecast";
export const READINESS_CARD = "regency.readiness";
export const MANDATE_CARD = "regency.mandate";
export const PROTECTOR_CARD = "regency.protector";
export const DIRECTORY_CARD = "regency.directory";

export type CardTypeId =
  | typeof SEAL_CARD
  | typeof MATTER_CARD
  | typeof SEASON_CARD
  | typeof DEBATE_CARD
  | typeof HANDOVER_CARD
  | typeof BRIEFING_CARD
  | typeof FORECAST_CARD
  | typeof READINESS_CARD
  | typeof MANDATE_CARD
  | typeof PROTECTOR_CARD
  | typeof DIRECTORY_CARD;
export type CardDisplayMode = "inline" | "row";

export interface SealCardState {
  gameKey: string;
  orderId: string;
  actor: string;
  actorName: string;
  summary: string;
  rationale: string;
  status: string;
  reason: string | null;
  season: string;
  /** What a resolved copy of the season says this act would do, if sealed. */
  forecast: string | null;
}

export interface MatterCardState {
  gameKey: string;
  crisisId: string;
  title: string;
  text: string;
  options: Array<{
    id: string;
    label: string;
    text: string;
    effects: string;
    adviser: string | null;
  }>;
  defaultOption: string;
  chosen: string | null;
  decidedBy: string | null;
  season: string;
}

export interface SeasonCardState {
  season: string;
  digest: string;
  highlights: Array<{ kind: string; text: string }>;
  treasury: number;
  legitimacy: number;
  estates: Record<string, number>;
  outcome: {
    kind: string;
    title: string;
    reason: string;
    verdict: string | null;
  } | null;
}

export interface DebateCardState {
  debateId: string;
  question: string;
  status: string;
  season: string;
  lines: Array<{ role: string; name: string; text: string }>;
  waiting: string[];
}

export interface HandoverCardState {
  season: string;
  mandate: string;
  text: string;
}

export interface BriefingCardState {
  gameKey: string;
  season: string;
  realm: string;
  summary: string;
  nextAction: string;
  alternatives: string[];
  treasury: number;
  legitimacy: number;
}

export interface ForecastCardState {
  gameKey: string;
  season: string;
  treasury: { before: number; after: number };
  legitimacy: { before: number; after: number };
  events: string[];
}

export interface ReadinessCardState {
  gameKey: string;
  season: string;
  readiness: import("./presentation.js").SeasonReadiness;
}

export interface MandateCardState {
  gameKey: string;
  mandates: Record<string, string>;
}

export interface ProtectorCardState {
  gameKey: string;
  active: boolean;
  mandate: string | null;
  seasonsLeft: number | null;
}

export interface DirectoryCardState {
  gameKey: string;
  people: Array<{ role: string; name: string; realm: string }>;
}

/** One card the Herald should publish or bring up to date. */
export interface CardOp {
  key: string;
  typeId: CardTypeId;
  displayMode: CardDisplayMode;
  state:
    | SealCardState
    | MatterCardState
    | SeasonCardState
    | DebateCardState
    | HandoverCardState
    | BriefingCardState
    | ForecastCardState
    | ReadinessCardState
    | MandateCardState
    | ProtectorCardState
    | DirectoryCardState;
}

const str = { type: "string" } as const;
const strOrNull = { type: ["string", "null"] } as const;
const num = { type: "number" } as const;

export const CARD_SCHEMAS: Record<CardTypeId, Record<string, unknown>> = {
  [SEAL_CARD]: {
    type: "object",
    required: ["gameKey", "orderId", "actor", "summary", "status"],
    properties: {
      gameKey: str,
      orderId: str,
      actor: str,
      actorName: str,
      summary: str,
      rationale: str,
      status: str,
      reason: strOrNull,
      season: str,
      forecast: strOrNull,
    },
  },
  [MATTER_CARD]: {
    type: "object",
    required: ["gameKey", "crisisId", "title", "options"],
    properties: {
      gameKey: str,
      crisisId: str,
      title: str,
      text: str,
      options: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "label"],
          properties: {
            id: str,
            label: str,
            text: str,
            effects: str,
            adviser: strOrNull,
          },
        },
      },
      defaultOption: str,
      chosen: strOrNull,
      decidedBy: strOrNull,
      season: str,
    },
  },
  [SEASON_CARD]: {
    type: "object",
    required: ["season", "digest"],
    properties: {
      season: str,
      digest: str,
      highlights: {
        type: "array",
        items: { type: "object", properties: { kind: str, text: str } },
      },
      treasury: num,
      legitimacy: num,
      estates: { type: "object", additionalProperties: num },
      outcome: {
        type: ["object", "null"],
        properties: { kind: str, title: str, reason: str, verdict: strOrNull },
      },
    },
  },
  [DEBATE_CARD]: {
    type: "object",
    required: ["debateId", "question", "status"],
    properties: {
      debateId: str,
      question: str,
      status: str,
      season: str,
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: { role: str, name: str, text: str },
        },
      },
      waiting: { type: "array", items: str },
    },
  },
  [HANDOVER_CARD]: {
    type: "object",
    required: ["text"],
    properties: { season: str, mandate: str, text: str },
  },
  [BRIEFING_CARD]: {
    type: "object",
    required: [
      "gameKey",
      "season",
      "realm",
      "summary",
      "nextAction",
      "alternatives",
      "treasury",
      "legitimacy",
    ],
    properties: {
      gameKey: str,
      season: str,
      realm: str,
      summary: str,
      nextAction: str,
      alternatives: { type: "array", items: str },
      treasury: num,
      legitimacy: num,
    },
  },
  [FORECAST_CARD]: {
    type: "object",
    required: ["gameKey", "season", "treasury", "legitimacy", "events"],
    properties: {
      gameKey: str,
      season: str,
      treasury: { type: "object" },
      legitimacy: { type: "object" },
      events: { type: "array", items: str },
    },
  },
  [READINESS_CARD]: {
    type: "object",
    required: ["gameKey", "season", "readiness"],
    properties: {
      gameKey: str,
      season: str,
      readiness: {
        type: "object",
        required: ["state"],
        properties: {
          state: str,
          count: num,
          courts: { type: "array", items: str },
        },
      },
    },
  },
  [MANDATE_CARD]: {
    type: "object",
    required: ["gameKey", "mandates"],
    properties: {
      gameKey: str,
      mandates: { type: "object", additionalProperties: str },
    },
  },
  [PROTECTOR_CARD]: {
    type: "object",
    required: ["gameKey", "active"],
    properties: {
      gameKey: str,
      active: { type: "boolean" },
      mandate: strOrNull,
      seasonsLeft: { type: ["number", "null"] },
    },
  },
  [DIRECTORY_CARD]: {
    type: "object",
    required: ["gameKey", "people"],
    properties: {
      gameKey: str,
      people: {
        type: "array",
        items: {
          type: "object",
          required: ["role", "name", "realm"],
          properties: { role: str, name: str, realm: str },
        },
      },
    },
  },
};

export const CARD_SPECS: Array<{
  typeId: CardTypeId;
  displayMode: CardDisplayMode;
  path: string;
  stateSchema: Record<string, unknown>;
}> = [
  {
    typeId: SEAL_CARD,
    displayMode: "inline",
    path: `${CARD_RENDERER_DIR}/seal-card.tsx`,
    stateSchema: CARD_SCHEMAS[SEAL_CARD],
  },
  {
    typeId: MATTER_CARD,
    displayMode: "inline",
    path: `${CARD_RENDERER_DIR}/matter-card.tsx`,
    stateSchema: CARD_SCHEMAS[MATTER_CARD],
  },
  {
    typeId: SEASON_CARD,
    displayMode: "row",
    path: `${CARD_RENDERER_DIR}/season-card.tsx`,
    stateSchema: CARD_SCHEMAS[SEASON_CARD],
  },
  {
    typeId: DEBATE_CARD,
    displayMode: "inline",
    path: `${CARD_RENDERER_DIR}/debate-card.tsx`,
    stateSchema: CARD_SCHEMAS[DEBATE_CARD],
  },
  {
    typeId: HANDOVER_CARD,
    displayMode: "inline",
    path: `${CARD_RENDERER_DIR}/handover-card.tsx`,
    stateSchema: CARD_SCHEMAS[HANDOVER_CARD],
  },
  {
    typeId: BRIEFING_CARD,
    displayMode: "row",
    path: `${CARD_RENDERER_DIR}/briefing-card.tsx`,
    stateSchema: CARD_SCHEMAS[BRIEFING_CARD],
  },
  {
    typeId: FORECAST_CARD,
    displayMode: "row",
    path: `${CARD_RENDERER_DIR}/forecast-card.tsx`,
    stateSchema: CARD_SCHEMAS[FORECAST_CARD],
  },
  {
    typeId: READINESS_CARD,
    displayMode: "inline",
    path: `${CARD_RENDERER_DIR}/readiness-card.tsx`,
    stateSchema: CARD_SCHEMAS[READINESS_CARD],
  },
  {
    typeId: MANDATE_CARD,
    displayMode: "row",
    path: `${CARD_RENDERER_DIR}/mandate-card.tsx`,
    stateSchema: CARD_SCHEMAS[MANDATE_CARD],
  },
  {
    typeId: PROTECTOR_CARD,
    displayMode: "row",
    path: `${CARD_RENDERER_DIR}/protector-card.tsx`,
    stateSchema: CARD_SCHEMAS[PROTECTOR_CARD],
  },
  {
    typeId: DIRECTORY_CARD,
    displayMode: "row",
    path: `${CARD_RENDERER_DIR}/directory-card.tsx`,
    stateSchema: CARD_SCHEMAS[DIRECTORY_CARD],
  },
];

export const CARD_IMPORTS: Record<string, string> = {
  react: "latest",
  "@radix-ui/themes": "npm:^3.2.1",
  "@radix-ui/react-icons": "npm:^1.3.2",
  "@workspace/runtime": "workspace:*",
};
