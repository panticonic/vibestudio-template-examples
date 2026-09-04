/**
 * The familiar's craft, streamed into the circle's margin stage by stage:
 * spoken, heard, looked, written, rehearsed, cast (or misfired, or not
 * heard). After a cast, scrying is one click away with a teaser of what was
 * heard uncertainly. The world writes the trail; the panel only reads it.
 */
import type { SpellRecord, TrailEntry } from "@workspace/grimoire-engine";
import "./enhancements.css";

const STAGE_GLYPH: Record<TrailEntry["stage"], string> = {
  spoken: "❝",
  heard: "◔",
  looked: "◎",
  written: "✎",
  rehearsed: "◐",
  cast: "✦",
  misfired: "✧",
  rejected: "—",
  sealed: "✟",
  fired: "◆",
  promoted: "❦",
  released: "○",
};
const STAGE_LABEL: Record<TrailEntry["stage"], string> = {
  spoken: "spoken",
  heard: "heard",
  looked: "looked",
  written: "written",
  rehearsed: "rehearsed",
  cast: "cast",
  misfired: "misfired",
  rejected: "not heard",
  sealed: "before the council",
  fired: "fired",
  promoted: "remembered",
  released: "released",
};

export function Trail({
  spell,
  guttering,
}: {
  spell: SpellRecord | null;
  guttering: boolean;
}) {
  const trail = spell?.trail ?? [];
  if (!trail.length && !guttering) return null;
  return (
    <ol className="g-trail" aria-label="the familiar's craft">
      {trail.map((t) => (
        <li key={t.seq} className={`stage-${t.stage}`}>
          <span className="g-trail-glyph">{STAGE_GLYPH[t.stage]}</span>
          <span className="g-trail-stage">{STAGE_LABEL[t.stage]}</span>
          <span className="g-trail-what">{t.text}</span>
        </li>
      ))}
      {guttering && (
        <li className="stage-thinking">
          <span className="g-trail-glyph">·</span>
          <span className="g-trail-stage">carrying</span>
          <span className="g-trail-what">the familiar is writing</span>
        </li>
      )}
    </ol>
  );
}

/** What a scry of this spell would show: the words guessed at, or the words no word was found for. */
export function scryTeaser(spell: SpellRecord): string {
  const unsure = [
    ...new Set([
      ...(spell.intent?.unsure ?? []),
      ...spell.resonance.entries
        .filter((e) => e.confidence < 0.7)
        .map((e) => e.fromWord),
    ]),
  ];
  const unknown = spell.resonance.unknown;
  if (spell.status === "misfired")
    return `see which word was heard wrong${unsure.length ? `: ${unsure.slice(0, 3).join(", ")}` : ""}`;
  if (unknown.length)
    return `no word was found for ${unknown.slice(0, 2).join(", ")}; see what was heard instead`;
  if (unsure.length)
    return `${unsure.slice(0, 3).join(", ")} ${unsure.length === 1 ? "was" : "were"} guessed at`;
  return "read the writing under the words";
}

export function ScryTeaser({
  spell,
  onScry,
  onLook,
}: {
  spell: SpellRecord;
  onScry: (id: string) => void;
  onLook?: (region: string) => void;
}) {
  if (spell.status !== "cast" && spell.status !== "misfired") return null;
  const margin = spell.margin.slice(-3);
  return (
    <div className="g-after">
      <div className="g-after-row">
        <button className="g-scry-now" onClick={() => onScry(spell.id)}>
          scry it
        </button>
        <span className="g-teaser">{scryTeaser(spell)}</span>
        {spell.scope[0] && onLook && (
          <button
            className="g-text-action"
            onClick={() => onLook(spell.scope[0]!)}
          >
            look at {spell.scope[0]}
          </button>
        )}
      </div>
      {margin.length > 0 && (
        <div className="g-margin-lines">
          {margin.map((m, i) => (
            <p key={i} className={`g-m hand-${m.hand}`}>
              {m.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
