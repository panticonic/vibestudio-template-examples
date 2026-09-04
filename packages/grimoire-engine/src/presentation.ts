import type {
  FirstHourState,
  Overview,
  RegionId,
  SpellRecord,
} from "./types.js";

export const GRIMOIRE_CARD_UI_VERSION = 1;
export const GRIMOIRE_CARD_KEY_PREFIX = "grimoire";
export const GRIMOIRE_CARD_RENDERER_DIR = "panels/grimoire/renderers";

export type GrimoireSurface = "valley" | "codex" | "journal";
export type GrimoireSubject =
  | { kind: "region"; id: RegionId }
  | { kind: "cell"; id: string; region: RegionId; x: number; y: number }
  | { kind: "spell" | "spirit" | "working"; id: string };

export interface GrimoireProjectionLink {
  version: 1;
  game: "grimoire";
  instance: { estateKey: string; apprentice?: string };
  surface: GrimoireSurface;
  subject?: GrimoireSubject;
}

export interface AttentionItem {
  key: string;
  urgency: "quiet" | "notice" | "urgent";
  title: string;
  explanation: string;
  /** The single concrete move the familiar should recommend next. */
  nextAction: string;
  /** At most two viable alternatives, so guidance never becomes a checklist. */
  alternatives?: string[];
  projection?: GrimoireProjectionLink;
  cardKey?: string;
}

export function deriveGrimoireAttention(
  overview: Pick<
    Overview,
    "firstHour" | "deliberating" | "council" | "news" | "undone" | "moor"
  >,
  estateKey: string,
  apprentice: string,
): AttentionItem[] {
  const link = (
    surface: GrimoireSurface,
    subject?: GrimoireSubject,
  ): GrimoireProjectionLink => ({
    version: 1,
    game: "grimoire",
    instance: { estateKey, apprentice },
    surface,
    ...(subject ? { subject } : {}),
  });
  const items: AttentionItem[] = [];
  const first = firstHourAttention(overview.firstHour, link);
  if (first) items.push(first);
  if (overview.deliberating.length) {
    const spell = overview.deliberating[0]!;
    items.push({
      key: `spell:${spell.id}:deliberating`,
      urgency: "notice",
      title: "The familiar is reading your verse",
      explanation: spell.verse.split("\n")[0] ?? "A spell waits in the margin.",
      nextAction:
        "Stay in the conversation; the familiar will return with what the estate heard.",
      projection: link("codex", { kind: "spell", id: spell.id }),
      cardKey: `spell:${spell.id}`,
    });
  }
  if (overview.council > 0)
    items.push({
      key: "chapel:open",
      urgency: "urgent",
      title: "A working needs seals",
      explanation: `${overview.council} matter${overview.council === 1 ? "" : "s"} wait in the Chapel.`,
      nextAction:
        "Ask the familiar to explain the disputed working, then choose which seals it may carry.",
      projection: link("journal"),
    });
  if (overview.news.unread > 0)
    items.push({
      key: `news:${overview.news.latest?.id ?? "unread"}`,
      urgency: "notice",
      title: "The household has written",
      explanation: `${overview.news.unread} unread page${overview.news.unread === 1 ? "" : "s"} in the Journal.`,
      nextAction:
        "Open the Journal and ask the familiar which page changes what you should do next.",
      projection: link("journal"),
    });
  if (overview.moor.pressure >= 60)
    items.push({
      key: `moor:${Math.floor(overview.moor.pressure / 10)}`,
      urgency: "urgent",
      title: "The Moor is pressing at the wall",
      explanation:
        "Ask the familiar what the valley needs before night deepens.",
      nextAction:
        "Ask: “What is the Moor pressing on, and what can I safely protect first?”",
      projection: link("valley", { kind: "spirit", id: "moor" }),
    });
  const undone = overview.undone.find((item) => !item.done);
  if (undone)
    items.push({
      key: `undone:${undone.id}`,
      urgency: "quiet",
      title: "One unfinished thing",
      explanation: undone.text,
      nextAction:
        "Ask the familiar what this unfinished work needs and why it matters now.",
      projection: link(
        undone.region ? "valley" : "journal",
        undone.region ? { kind: "region", id: undone.region } : undefined,
      ),
    });
  return items.slice(0, 5);
}

function firstHourAttention(
  state: FirstHourState,
  link: (
    surface: GrimoireSurface,
    subject?: GrimoireSubject,
  ) => GrimoireProjectionLink,
): AttentionItem | null {
  if (!state.hearthLit)
    return {
      key: "first-hour:hearth",
      urgency: "notice",
      title: "The hearth is listening",
      explanation:
        "Open the familiar and speak two short lines. Exact words matter.",
      nextAction:
        "Speak a small wish as two lines; the first fire is forgiving.",
      alternatives: ["Ask the familiar what makes words sound like verse."],
      projection: link("valley"),
      cardKey: "composer",
    };
  if (!state.firstMisfire)
    return {
      key: "first-hour:garden",
      urgency: "quiet",
      title: "Try a small kindness in the garden",
      explanation:
        "Point at the herb beds, then bring the thought to the familiar.",
      nextAction:
        "Open the garden, point at the herb beds, then speak one small change you want there.",
      alternatives: [
        "Ask the familiar to read a nearby garden verse from the notebooks.",
      ],
      projection: link("valley", { kind: "region", id: "garden" }),
      cardKey: "composer",
    };
  if (!state.firstScry)
    return {
      key: "first-hour:scry",
      urgency: "notice",
      title: "Read beneath the misfire",
      explanation: "The Codex can show what the familiar heard and wrote.",
      nextAction:
        "Open the Codex, read the misfire, then ask which word was heard differently.",
      alternatives: ["Ask the familiar to scry the spell with you."],
      projection: link("codex"),
    };
  return null;
}

export const VERSE_CARD = "grimoire.verse";
export const SPELL_CARD = "grimoire.spell";
export const SCRY_CARD = "grimoire.scry";
export const READING_CARD = "grimoire.reading";
export const HALL_CARD = "grimoire.hall";
export const CHAPEL_CARD = "grimoire.chapel";
export const FESTIVAL_CARD = "grimoire.festival";

export type GrimoireCardTypeId =
  | typeof VERSE_CARD
  | typeof SPELL_CARD
  | typeof SCRY_CARD
  | typeof READING_CARD
  | typeof HALL_CARD
  | typeof CHAPEL_CARD
  | typeof FESTIVAL_CARD;

export interface GrimoireCardOp {
  key: string;
  typeId: GrimoireCardTypeId;
  displayMode: "inline" | "row";
  state: Record<string, unknown>;
}

const str = { type: "string" } as const;
const bool = { type: "boolean" } as const;
const linkSchema = {
  type: "object",
  required: ["version", "game", "instance", "surface"],
  additionalProperties: true,
} as const;
export const GRIMOIRE_CARD_SCHEMAS: Record<
  GrimoireCardTypeId,
  Record<string, unknown>
> = {
  [VERSE_CARD]: {
    type: "object",
    required: ["estateKey", "apprentice", "title"],
    properties: {
      estateKey: str,
      apprentice: str,
      title: str,
      prompt: str,
      guidance: str,
      exampleLabel: str,
      example: str,
      alternatives: { type: "array", items: str },
      focus: linkSchema,
    },
  },
  [SPELL_CARD]: {
    type: "object",
    required: ["spellId", "verse", "status"],
    properties: {
      spellId: str,
      verse: str,
      name: str,
      status: str,
      tier: str,
      line: str,
      persistent: bool,
      projection: linkSchema,
    },
  },
  [SCRY_CARD]: {
    type: "object",
    required: ["title", "summary", "projection"],
    properties: { title: str, summary: str, projection: linkSchema },
  },
  [READING_CARD]: {
    type: "object",
    required: ["title", "summary", "projection"],
    properties: { title: str, summary: str, projection: linkSchema },
  },
  [HALL_CARD]: {
    type: "object",
    required: ["title", "topic", "channelId"],
    properties: {
      title: str,
      topic: str,
      channelId: str,
      projection: linkSchema,
    },
  },
  [CHAPEL_CARD]: {
    type: "object",
    required: ["title", "summary", "projection"],
    properties: { title: str, summary: str, projection: linkSchema },
  },
  [FESTIVAL_CARD]: {
    type: "object",
    required: ["title", "summary", "projection"],
    properties: { title: str, summary: str, projection: linkSchema },
  },
};

export const GRIMOIRE_CARD_SPECS = (
  Object.entries({
    [VERSE_CARD]: "verse-card.tsx",
    [SPELL_CARD]: "spell-card.tsx",
    [SCRY_CARD]: "scry-card.tsx",
    [READING_CARD]: "reading-card.tsx",
    [HALL_CARD]: "hall-card.tsx",
    [CHAPEL_CARD]: "chapel-card.tsx",
    [FESTIVAL_CARD]: "festival-card.tsx",
  }) as Array<[GrimoireCardTypeId, string]>
).map(([typeId, file]) => ({
  typeId,
  displayMode: typeId === READING_CARD ? ("row" as const) : ("inline" as const),
  path: `${GRIMOIRE_CARD_RENDERER_DIR}/${file}`,
  stateSchema: GRIMOIRE_CARD_SCHEMAS[typeId],
}));

export const GRIMOIRE_CARD_IMPORTS: Record<string, string> = {
  react: "latest",
  "@workspace/runtime": "workspace:*",
};

export function spellCardState(
  spell: SpellRecord,
  projection: GrimoireProjectionLink,
): Record<string, unknown> {
  return {
    spellId: spell.id,
    verse: spell.verse,
    name: spell.name ?? "An unnamed spell",
    status: spell.status,
    tier: spell.tier,
    line: spell.margin.at(-1)?.text ?? "The margin is quiet.",
    persistent: Boolean(spell.persistent?.active),
    projection,
  };
}
