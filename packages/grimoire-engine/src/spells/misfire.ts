/**
 * Misfires are spectacle. Every kind has a vivid default (design §13.6) so
 * that even the cheapest misfire is worth scrying for the story.
 */
import type { CellRef, Effect, MisfireKind, SpellRecord } from "../types.js";

export type MisfireReason = "budget" | "ceiling" | "unrehearsed" | "weak" | "wrong-subject" | "stale-echo" | "rot-near" | "light-scope" | "declined";

export function chooseMisfire(_record: SpellRecord, reason: MisfireReason): MisfireKind {
  switch (reason) {
    case "budget": return "over-reach";
    case "ceiling": return "ceiling";
    case "unrehearsed": return "unrehearsed";
    case "weak": return "mis-hearing";
    case "wrong-subject": return "wrong-subject";
    case "stale-echo": return "echo";
    case "rot-near": return "moors-ear";
    case "light-scope": return "moths";
    case "declined": return "silence";
  }
}

const LINES: Record<MisfireKind, string[]> = {
  "over-reach": ["The world stopped attending halfway. There is a scorch.", "It ran out. The sigil flared to say so.", "Not enough ether for the whole of that. It did the first part."],
  "mis-hearing": ["I heard one word wrong. I have written which.", "That was carried as I heard it. Scry it; I was unsure of a word.", "Well. It did what I heard, which was not what you meant."],
  "wrong-subject": ["That name belongs to a different kind of thing. The nearest of that kind answered.", "You named the wrong sort. Something else turned its head.", "Not that one. Something of that kind heard you instead."],
  echo: ["That was close to an old working. It stirred and ran once.", "Something of hers heard you and reran itself. Once.", "An old verse woke on yours. You will want to read it."],
  "moors-ear": ["It cast. And something on the moor said a word back.", "Rot was near. The register slipped. Listen at the wall tonight.", "The Moor heard that. I would not say that word near the grate again."],
  moths: ["Well.", "Moths. That is the usual first one.", "Light is a wide word. The moths think so too."],
  silence: ["I did not know that word, so it was silent. The rest carried.", "One word fell through. The rest is done.", "A word I would not inscribe. The verse went on without it."],
  unrehearsed: ["A ward must be rehearsed before it is kept. It bloomed damp and stopped.", "Unrehearsed. The world would not keep it; it made a mist instead.", "I should have run that first. It fizzled, wetly."],
  ceiling: ["Too wide for a verse of that size. It touched what it could.", "The envelope held. The rest is a damp bloom at the edge.", "That is a working's reach in a cantrip's mouth. It stopped at the ceiling."],
};

const NOTES: Record<MisfireKind, string> = {
  "over-reach": "ether ran out mid-batch; the spell stopped with a scorch and the nearest sigil flared",
  "mis-hearing": "a concept matched weakly and the familiar guessed; the wrong thing was done well",
  "wrong-subject": "a true name used for the wrong kind; the nearest thing of that kind answered",
  echo: "the verse was close to a stale working's; the old working stirred and reran once",
  "moors-ear": "rot near the caster; the register slipped; something on the moor repeated a word",
  moths: "a light or heat spell was mis-scoped; moths, in numbers",
  silence: "a wild word was declined; the word was silent and the rest cast",
  unrehearsed: "a persistent tier committed without rehearsal; the world refused and made a damp bloom",
  ceiling: "the batch exceeded the tier's effect ceiling; the excess was refused",
};

function pick<T>(rng: () => number, xs: T[]): T { return xs[Math.floor(rng() * xs.length) % xs.length]!; }

function around(at: CellRef, rng: () => number, radius: number): CellRef {
  const dx = Math.floor(rng() * (2 * radius + 1)) - radius;
  const dy = Math.floor(rng() * (2 * radius + 1)) - radius;
  return { region: at.region, x: Math.max(0, at.x + dx), y: Math.max(0, at.y + dy) };
}

export function misfirePalette(
  kind: MisfireKind,
  ctx: { record: SpellRecord; at: CellRef; rng: () => number; nearestSigil?: CellRef | null; staleSpell?: string | null },
): { effects: Effect[]; note: string; line: string } {
  const { at, rng } = ctx;
  const effects: Effect[] = [];
  switch (kind) {
    case "moths": {
      const n = 5 + Math.floor(rng() * 8);
      for (let i = 0; i < n; i++) effects.push({ kind: "spawn", what: "moth", at: around(at, rng, 2) });
      effects.push({ kind: "adorn", cell: at, charm: { kind: "moths", intensity: n, label: "moths" } });
      break;
    }
    case "over-reach": {
      effects.push({ kind: "transmute", cell: at, delta: { heat: 2, growth: -1, ash: 1 } });
      effects.push({ kind: "mark", cell: ctx.nearestSigil ?? at, sigil: "flare", glow: "#ffb347" });
      break;
    }
    case "echo": {
      if (ctx.staleSpell) effects.push({ kind: "at", tick: 0, source: `world.invoke(${JSON.stringify(ctx.staleSpell)})`, state: { echoOf: ctx.staleSpell } });
      effects.push({ kind: "adorn", cell: at, charm: { kind: "glow", colour: "#b9a3ff", intensity: 2, label: "an old sigil stirs" } });
      break;
    }
    case "wrong-subject": {
      effects.push({ kind: "mark", cell: at, sigil: "turned-head", glow: "#c9c9c9" });
      break;
    }
    case "moors-ear": {
      effects.push({ kind: "adorn", cell: at, charm: { kind: "mist", colour: "#6b4c8a", intensity: 2, label: "the Moor's ear" } });
      break;
    }
    case "unrehearsed":
    case "ceiling": {
      effects.push({ kind: "transmute", cell: at, delta: { water: 1 } });
      effects.push({ kind: "adorn", cell: at, charm: { kind: "mist", colour: "#9fb8c9", intensity: 1, label: "a damp bloom" } });
      break;
    }
    case "mis-hearing":
    case "silence":
      break;
  }
  return { effects, note: NOTES[kind], line: pick(rng, LINES[kind]) };
}
