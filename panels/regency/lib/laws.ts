/**
 * Reading laws. An edict is data, so it can be shown as data: coloured by
 * what each token means, and diffed against the law that stands today when
 * one is waiting for the seal.
 */
import { provinceMatches, type Edict, type EdictCondition, type GameState, type Order } from "@workspace/regency-engine";

export type TokenKind = "field" | "op" | "value" | "action" | "punct" | "key" | "plain";

export interface Token {
  text: string;
  kind: TokenKind;
}

/** One condition or action rendered as coloured tokens. */
export function conditionTokens(c: EdictCondition): Token[] {
  return [
    { text: c.field, kind: "field" },
    { text: " ", kind: "plain" },
    { text: c.op, kind: "op" },
    { text: " ", kind: "plain" },
    { text: typeof c.value === "string" ? `“${c.value}”` : String(c.value), kind: "value" },
  ];
}

export function actionTokens(a: Edict["then"][number]): Token[] {
  const out: Token[] = [{ text: a.kind, kind: "action" }];
  for (const [key, value] of Object.entries(a)) {
    if (key === "kind") continue;
    out.push({ text: " ", kind: "plain" }, { text: key, kind: "key" }, { text: "=", kind: "punct" }, { text: String(value), kind: "value" });
  }
  return out;
}

export interface EdictLine {
  lead: string;
  tokens: Token[];
}

/** The whole edict as lines of tokens: `when …` then `then …`. */
export function edictLines(edict: Pick<Edict, "when" | "then">): EdictLine[] {
  const lines: EdictLine[] = [];
  edict.when.forEach((c, i) => lines.push({ lead: i === 0 ? "when" : "and", tokens: conditionTokens(c) }));
  edict.then.forEach((a, i) => lines.push({ lead: i === 0 ? "then" : "and", tokens: actionTokens(a) }));
  return lines;
}

/** Provinces an edict would touch right now. */
export function matchingProvinces(state: GameState, edict: Pick<Edict, "when">, realm?: string): string[] {
  const owner = realm ?? state.playerRealm;
  const full = { id: "preview", title: "preview", when: edict.when, then: [], enacted: state.season, author: "preview" } as unknown as Edict;
  return Object.values(state.provinces)
    .filter((p) => p.owner === owner && provinceMatches(state, p, full))
    .map((p) => p.id);
}

export type DiffRow = { kind: "same" | "added" | "removed"; title: string; id: string };

/**
 * What the law book would look like if the acts awaiting the seal were sealed:
 * one row per edict, marked as it stands, added or repealed.
 */
export function edictDiff(current: Edict[], proposed: Order[]): DiffRow[] {
  const repealed = new Set(proposed.filter((o) => o.kind === "repeal_edict").map((o) => o.edictId));
  const rows: DiffRow[] = current.map((e) => ({ kind: repealed.has(e.id) ? ("removed" as const) : ("same" as const), title: e.title, id: e.id }));
  for (const o of proposed) {
    if (o.kind !== "enact_edict") continue;
    rows.push({ kind: "added", title: o.edict.title, id: o.edict.id || "new" });
  }
  return rows;
}
