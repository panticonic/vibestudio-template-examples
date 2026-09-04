import type { EstateState, NewsItem, NewsPage, RegionId, SpellRecord, SpiritId } from "../types.js";

export interface NewsInput {
  events: Array<{ kind: string; text: string; region?: RegionId; entity?: string; spell?: string; rung?: "quiet" | "inbox" | "urgent"; by?: string; hand?: NewsItem["hand"] }>;
  spells: SpellRecord[];
  pageId: string;
  tick: number;
}

const URGENT = new Set(["fire-near-mill", "moor-at-grate", "flood-library", "golem-stuck", "storm"]);
const NOISE = new Set(["tick", "creature-moves", "heat-conducts", "light-spreads"]);

/** The familiar's phrasing for common event kinds. */
export function newsLine(kind: string, ctx: Record<string, unknown>): string {
  const r = typeof ctx["region"] === "string" ? ` in ${ctx["region"]}` : "";
  switch (kind) {
    case "ward-fired": return `${ctx["name"] ?? "a ward"} fired${r}.`;
    case "ward-misfired": return `${ctx["name"] ?? "a ward"} misfired${r}: ${ctx["note"] ?? ""}`.trim();
    case "working-resumed": return `${ctx["name"] ?? "a working"} went on to its next phase${r}.`;
    case "golem-acted": return `${ctx["golem"] ?? "a golem"} ${ctx["text"] ?? "worked"}${r}.`;
    case "spirit-spoke": return `${ctx["spirit"] ?? "a spirit"} said: ${ctx["text"] ?? ""}`;
    case "festival": return `${ctx["text"] ?? "a festival"} — the green is open.`;
    case "moor": return `Beyond the wall: ${ctx["text"] ?? "something moved"}.`;
    case "restored": return `${ctx["region"] ?? "a region"} is drawn right again.`;
    case "undone-done": return `Crossed out: ${ctx["text"] ?? ""}`;
    default: return String(ctx["text"] ?? kind);
  }
}

function worstAilment(state: EstateState): { region: RegionId; note: string } | null {
  let best: { region: RegionId; note: string; sev: number } | null = null;
  for (const r of Object.values(state.regions ?? {})) {
    for (const a of r.ailments ?? []) if (!best || a.severity > best.sev) best = { region: r.id, note: a.note, sev: a.severity };
  }
  return best ? { region: best.region, note: best.note } : null;
}

/** Choose the one small thing the page ends with: an undone item in the worst region, else a spirit want, else nothing. */
export function oneThing(state: EstateState): NewsPage["oneThing"] {
  const worst = worstAilment(state);
  const undone = (state.undone ?? []).filter((u) => !u.done);
  if (worst) {
    const u = undone.find((x) => x.region === worst.region);
    if (u) return { text: `${worst.note}. In her hand: "${u.text}".`, undoneId: u.id, region: worst.region };
  }
  const first = undone[0];
  if (first) return { text: `In her hand: "${first.text}".`, undoneId: first.id, region: first.region };
  const wants = Object.values(state.spirits ?? {}).filter((s) => s.awake && s.wantList?.some((w) => !w.met));
  if (wants.length) { const s = wants[0]!; return { text: `${s.title} wants ${s.wantList.find((w) => !w.met)!.text}.`, undoneId: null, region: s.anchor.region }; }
  return worst ? { text: worst.note, undoneId: null, region: worst.region } : null;
}

/** Group a day's events into a page in the familiar's hand, with the spirits' notes in their colours. */
export function writeNewsPage(state: EstateState, input: NewsInput): NewsPage | null {
  const items: NewsItem[] = [];
  let n = 0;
  for (const e of input.events) {
    if (NOISE.has(e.kind)) continue;
    const rung: NewsItem["rung"] = e.rung ?? (URGENT.has(e.kind) ? "urgent" : "quiet");
    const hand: NewsItem["hand"] = e.hand ?? (e.kind === "moor" ? "moor" : e.kind.startsWith("spirit") && e.by ? (e.by as SpiritId) : e.kind.startsWith("golem") ? "golem" : "familiar");
    items.push({ id: `${input.pageId}:${n++}`, tick: input.tick, by: e.by ?? (hand === "familiar" ? "the familiar" : String(hand)), hand, text: e.text, rung, region: e.region ?? null, spellId: e.spell ?? null, read: false });
  }
  // Collapse repeats: the same text more than three times becomes "…and again, N times".
  const seen = new Map<string, number>();
  const collapsed: NewsItem[] = [];
  for (const it of items) {
    const k = it.text;
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    if (c <= 2) collapsed.push(it);
    else if (c === 3) collapsed.push({ ...it, text: `${it.text} (and again, and again)` });
  }
  if (!collapsed.length) return null;
  const sky = state.sky;
  return { id: input.pageId, day: sky?.day ?? 0, season: sky?.season ?? "spring", year: sky?.year ?? 1, items: collapsed.slice(0, 40), oneThing: oneThing(state), read: false };
}
