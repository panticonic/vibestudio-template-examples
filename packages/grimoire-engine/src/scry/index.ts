import type { Apprentice, Concept, Entity, EstateState, Idiom, Layer, Region, RegionId, ScryPage, Spirit, SpellRecord, Utterance } from "../types.js";

// ───────────────────────────────────────────────────────────────────────────
// The scrying page
// ───────────────────────────────────────────────────────────────────────────

function tokens(verse: string): string[] {
  return verse.split(/\s+/).filter(Boolean);
}
function fold(w: string): string {
  return w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}'-]/gu, "");
}

function beforeAfter(spell: SpellRecord): { before: Partial<Record<Layer, number>>; after: Partial<Record<Layer, number>> } {
  const before: Partial<Record<Layer, number>> = {}, after: Partial<Record<Layer, number>> = {};
  const receipts = spell.receipts.length ? spell.receipts : spell.firings.flatMap((f) => f.receipts);
  for (const r of receipts) {
    if (r.status !== "applied") continue;
    for (const [k, v] of Object.entries(r.before ?? {})) before[k as Layer] = (before[k as Layer] ?? 0) + (v as number);
    for (const [k, v] of Object.entries(r.after ?? {})) after[k as Layer] = (after[k as Layer] ?? 0) + (v as number);
  }
  return { before, after };
}

export function buildScryPage(input: { spell: SpellRecord; casterName: string; hand: ScryPage["hand"]; concepts: Record<string, Concept>; idioms: Idiom[]; spells: Record<string, SpellRecord>; deepLeft: number; echo: string | null }): ScryPage {
  const { spell } = input;
  const byWord = new Map<string, { concept: string; confidence: number; viaRoot: boolean }>();
  for (const e of spell.resonance?.entries ?? []) {
    const k = fold(e.fromWord);
    const prev = byWord.get(k);
    if (!prev || prev.confidence < e.confidence) byWord.set(k, { concept: e.concept, confidence: e.confidence, viaRoot: e.viaRoot });
  }
  const unsure = new Set((spell.intent?.unsure ?? []).map(fold));
  const names = new Set((spell.resonance?.names ?? []).map(fold));
  const words = tokens(spell.verse).map((word) => {
    const k = fold(word);
    const hit = byWord.get(k);
    return { word, concept: hit?.concept ?? null, confidence: hit?.confidence ?? 0, unsure: unsure.has(k) || (!!hit && hit.confidence < 0.7), root: hit?.viaRoot ?? false, name: names.has(k) };
  });
  const ancestry = (spell.ancestry ?? []).map((id) => {
    const idiom = input.idioms.find((i) => i.id === id);
    if (idiom) return { id, name: idiom.name, kind: "idiom" as const };
    if (id.startsWith("rune:")) return { id, name: id.slice(5), kind: "rune" as const };
    const s = input.spells[id];
    return { id, name: s?.name ?? s?.verse.split("\n")[0] ?? id, kind: "spell" as const };
  });
  const link = (id: string) => { const s = input.spells[id]; return { id, name: s?.name ?? null, verse: s?.verse ?? "" }; };
  const { before, after } = beforeAfter(spell);
  const from = spell.etherSpent === 0 ? "nothing: a charm" : spell.tier === "ward" || spell.tier === "working" ? "the cells it touched, and the reserve" : "the caster's reserve";
  return {
    spell,
    casterName: input.casterName,
    hand: input.hand,
    words,
    ancestry,
    before,
    after,
    triggeredBy: spell.triggeredBy ? [link(spell.triggeredBy)] : [],
    triggered: (spell.triggered ?? []).map(link),
    cost: { ether: spell.etherSpent, from },
    deepLeft: input.deepLeft,
    echo: input.echo,
  };
}

export function scryEntity(entity: Entity, behaviourSource: string | null, lines: number): ScryPage["behaviour"] {
  return { name: entity.name, source: behaviourSource ?? "· · ·", lines };
}

// ───────────────────────────────────────────────────────────────────────────
// Briefings for agents
// ───────────────────────────────────────────────────────────────────────────

function pct(n: number): string { return `${Math.round(n * 100)}%`; }

/** "orchard 40×32: water high on 61% of cells, rot on 12%, growth 30%; 2 sluices (orchard-sluice open); ailments: flooded (3)" */
export function regionSummaryText(region: Region): string {
  const n = region.w * region.h || 1;
  const L = region.layers;
  let wet = 0, rot = 0, green = 0, lit = 0, hot = 0, frost = 0, silt = 0, ether = 0;
  for (let i = 0; i < n; i++) {
    if ((L.water[i] ?? 0) >= 3) wet++;
    if ((L.rot[i] ?? 0) > 0) rot++;
    if ((L.growth[i] ?? 0) > 0) green++;
    if ((L.light[i] ?? 0) >= 2) lit++;
    if ((L.heat[i] ?? 0) >= 3) hot++;
    if ((L.frost[i] ?? 0) > 0) frost++;
    if ((L.silt[i] ?? 0) >= 2) silt++;
    ether += L.ether[i] ?? 0;
  }
  const parts = [`water high on ${pct(wet / n)} of cells`, `rot on ${pct(rot / n)}`, `growth ${pct(green / n)}`, `lit ${pct(lit / n)}`];
  if (hot) parts.push(`warm ${pct(hot / n)}`);
  if (frost) parts.push(`frost ${pct(frost / n)}`);
  if (silt) parts.push(`silt ${pct(silt / n)}`);
  parts.push(`ether ${ether}`);
  const sl = region.sluices?.length ? `; ${region.sluices.length} sluice${region.sluices.length > 1 ? "s" : ""} (${region.sluices.map((s) => `${s.name} ${s.state}`).join(", ")})` : "";
  const ail = region.ailments?.length ? `; ailments: ${region.ailments.map((a) => `${a.kind} (${a.severity})`).join(", ")}` : "";
  const places = Object.entries(region.places ?? {}).map(([id, p]) => `${id}@${p.x},${p.y}${p.trueName ? ` [${p.trueName}]` : ""}`).join(" ");
  return `${region.name} (${region.id}) ${region.w}×${region.h}: ${parts.join(", ")}${sl}${ail}${places ? `; places: ${places}` : ""}`;
}

export function familiarBriefing(state: EstateState, apprentice: Apprentice, spell: SpellRecord | null, opts: { regionSummary: (id: RegionId) => string; recentSpells: SpellRecord[]; wants: Array<{ spirit: string; wants: string }>; firstHourStep: number | null; notes?: string[] }): string {
  const sky = state.sky;
  const lines: string[] = [];
  lines.push(`${apprentice.name} (${apprentice.id}) stands in ${apprentice.region} at ${apprentice.x},${apprentice.y}. Reserve ${apprentice.reserve}/${apprentice.reserveMax} ether. Reagents: ${Object.entries(apprentice.reagents ?? {}).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}.`);
  lines.push(`Sky: tick ${sky.tick}, ${sky.season} day ${sky.day + 1} year ${sky.year}, hour ${sky.hour}, moon ${sky.moon}/8, ${sky.weather}, wind ${sky.windDir}${sky.windForce}${sky.festival ? `, festival: ${sky.festival}` : ""}${sky.bellTrue ? "" : ", bell untrue"}.`);
  lines.push(`Words known: ${apprentice.words.join(", ") || "none yet"}. Names: ${apprentice.names.join(", ") || "none"}. Foci: ${apprentice.foci?.map((f) => f.name + (f.broken ? " (broken)" : "")).join(", ") || "none"}.`);
  if (spell) {
    lines.push(`Spell ${spell.id}: tier guess ${spell.tier}; earned ${spell.earned.join(", ") || "nothing beyond adorn"}; budget ${spell.etherBudget}; scope ${spell.scope.join(", ")}; unknown words ${spell.resonance.unknown.join(", ") || "none"}.`);
    for (const r of spell.scope.slice(0, 2)) lines.push(opts.regionSummary(r));
  } else {
    lines.push(opts.regionSummary(apprentice.region));
  }
  const active = (state.activeSpells ?? []).length;
  if (active) lines.push(`Active persistent spells: ${active}.`);
  if (opts.recentSpells.length) lines.push(`Recent: ${opts.recentSpells.slice(0, 3).map((s) => `${s.name ?? s.verse.split("\n")[0]} (${s.status})`).join("; ")}.`);
  if (opts.wants.length) lines.push(`Spirits want: ${opts.wants.slice(0, 4).map((w) => `${w.spirit}: ${w.wants}`).join("; ")}.`);
  if (opts.firstHourStep !== null) lines.push(`First hour, step ${opts.firstHourStep} (0 letter, 1 hearth, 2 garden/moths, 3 first scry, 4 first ward, 5 evening).`);
  if (opts.notes?.length) lines.push(`Your margin: ${opts.notes.slice(-4).join(" | ")}`);
  const undone = (state.undone ?? []).filter((u) => !u.done).slice(0, 3).map((u) => u.text);
  if (undone.length) lines.push(`Undone: ${undone.join(" / ")}`);
  let out = lines.join("\n");
  if (out.length > 1400) out = out.slice(0, 1400) + "…";
  return out;
}

export function spiritBriefing(state: EstateState, spirit: Spirit, opts: { anchorSummary: string; recentUtterances: Utterance[]; recentSpells: SpellRecord[] }): string {
  const sky = state.sky;
  const lines = [
    `${spirit.title} (${spirit.trueName}), anchored at ${spirit.anchor.region} ${spirit.anchor.x},${spirit.anchor.y}. Hour: ${spirit.hour}. Reserve ${spirit.reserve}.`,
    `Sky: ${sky.season} day ${sky.day + 1} year ${sky.year}, hour ${sky.hour}, moon ${sky.moon}/8, ${sky.weather}${sky.festival ? `, festival: ${sky.festival}` : ""}.`,
    `Wants: ${spirit.wantList.map((w) => `${w.text}${w.met ? " (met)" : ""}`).join("; ")}. Now: ${spirit.wants}.`,
    `Regard: ${Object.entries(spirit.regard ?? {}).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ") || "none yet"}.`,
    opts.anchorSummary,
  ];
  if (opts.recentUtterances.length) lines.push(`Said to you lately: ${opts.recentUtterances.slice(-4).map((u) => `${u.by}: ${u.verse.replace(/\n/g, " / ")}`).join(" || ")}`);
  if (opts.recentSpells.length) lines.push(`Spells near your anchor: ${opts.recentSpells.slice(0, 3).map((s) => `${s.name ?? s.verse.split("\n")[0]} by ${s.caster} (${s.status})`).join("; ")}`);
  return lines.join("\n");
}
