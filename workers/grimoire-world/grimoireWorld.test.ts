import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import {
  localExecutor,
  type GrimoireCardOp,
  type Overview,
  type ScryPage,
  type SpeakResult,
  type SpellRecord,
  type Snapshot,
  type RunResult,
  type RegionView,
  type SpellbookView,
} from "@workspace/grimoire-engine";
import { composeProgram } from "@workspace/grimoire-engine";
import { GrimoireWorldDO } from "./index.js";

/** The world runs unattended source through a local executor in tests. */
class TestWorld extends GrimoireWorldDO {
  constructor(
    ctx: ConstructorParameters<typeof GrimoireWorldDO>[0],
    env: unknown,
  ) {
    super(ctx, env as Record<string, unknown>);
    this.sourceExecutor = localExecutor;
    this.idleCadence = false;
  }
}

const FAMILIAR = {
  callerId: "do:workers/grimoire-agents:GrimoireAgentWorker:familiar-circle",
  callerKind: "do" as const,
};

async function founded() {
  const t = await createTestDO(TestWorld);
  await t.call("newEstate", {
    seed: "test",
    apprentice: "ada",
    apprenticeName: "Ada",
  });
  await t.call("registerParticipant", {
    role: "familiar",
    channelId: "ch-circle",
    participantId: "p1",
    targetId: FAMILIAR.callerId,
    handle: "familiar",
    name: "The familiar",
    apprentice: "ada",
    room: "circle",
  });
  return t;
}

/** Run the familiar's side of a cast locally: snapshot → program → result. */
async function familiarRun(
  t: Awaited<ReturnType<typeof founded>>,
  spellId: string,
  source: string,
  fork: boolean,
): Promise<RunResult> {
  const snap = (await t.callAs(FAMILIAR, "snapshot", {
    spellId,
    fork,
  })) as Snapshot;
  return localExecutor(composeProgram(source, snap));
}

describe("GrimoireWorldDO", () => {
  it("founds an estate with the letter, the undone list and the stale workings", async () => {
    const t = await founded();
    const ov = await t.call<Overview>("overview", { apprentice: "ada" });
    expect(ov.regions.length).toBe(27);
    expect(ov.undone.length).toBe(9);
    expect(ov.activeSpells.some((s) => s.id === "stale:ilvane-sluice")).toBe(
      true,
    );
    expect(ov.firstHour.hearthLit).toBe(false);
    const letter = await t.call<{ text: string }>("letter", {});
    expect(letter.text).toContain("The hearth will light for you");
  });

  it("glances at prose, opens the study after three, and lights the hearth on the first verse", async () => {
    const t = await founded();
    for (let i = 0; i < 3; i++) {
      const r = await t.call<SpeakResult>("speak", {
        commandId: crypto.randomUUID(),
        apprentice: "ada",
        verse:
          "please can you make the orchard less flooded because it bothers me and the trees are dying and I would like it dry now thank you",
      });
      expect(r.kind).toBe("gate");
      expect(r.line).toBeTruthy();
      if (i === 2) expect(r.studyOpened).toBe(true);
    }
    const lit = await t.call<SpeakResult>("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room\nhama, come up from the ash",
    });
    expect(lit.kind).toBe("instant");
    expect(lit.receipts?.length).toBe(9);
    const ov = await t.call<Overview>("overview", { apprentice: "ada" });
    expect(ov.firstHour.hearthLit).toBe(true);
    const region = await t.call<RegionView>("region", { id: "manor" });
    const h = region.region.places["hearth"]!;
    expect(
      region.region.layers.heat[h.y * region.region.w + h.x],
    ).toBeGreaterThanOrEqual(4);
    // The familiar was woken (delivery fails in the harness and stays retryable).
    const wakes = t.sql.exec(`SELECT status FROM wakes`).toArray();
    expect(wakes.length).toBe(1);
  });

  it("guides the next move in durable familiar wakes without treating card polling as narration", async () => {
    const t = await founded();
    const cards = await t.call<GrimoireCardOp[]>("pendingCards", {
      apprentice: "ada",
    });
    const composer = cards.find((card) => card.key === "composer")!;
    expect(composer.state["guidance"]).toMatch(/Speak a small wish/);
    expect(composer.state["example"]).toContain("Small fire");
    expect(
      (
        t.sql
          .exec(
            `SELECT COUNT(*) AS n FROM presentation WHERE last_narrated_revision IS NOT NULL`,
          )
          .toArray()[0] as { n: number } | undefined
      )?.n,
    ).toBe(0);

    await t.call<SpeakResult>("speak", {
      commandId: "guided-first-fire",
      apprentice: "ada",
      verse: "Small fire, wake\nHold a little warmth",
    });
    const wake = t.sql
      .exec(`SELECT wake_json FROM wakes ORDER BY created_tick DESC LIMIT 1`)
      .toArray()[0] as { wake_json: string } | undefined;
    expect(wake?.wake_json).toContain("GUIDE NEXT");
    expect(wake?.wake_json).toContain("point at the herb beds");
  });

  it("deduplicates committed apprentice commands at the world boundary", async () => {
    const t = await founded();
    const commandId = "command-first-fire";
    const input = {
      commandId,
      apprentice: "ada",
      verse: "Small fire, wake and warm this room\nhama, come up from the ash",
    };
    const first = await t.call<SpeakResult>("speak", input);
    const replay = await t.call<SpeakResult>("speak", input);
    expect(replay).toEqual(first);
    expect(
      (await t.call<{ spells: SpellRecord[] }>("dump", {})).spells.filter(
        (spell) => spell.id === first.spellId,
      ),
    ).toHaveLength(1);
    await expect(
      t.call("speak", { ...input, verse: `${input.verse}!` }),
    ).rejects.toThrow(/different command/);
  });

  it("binds a familiar-carried command to its registered apprentice", async () => {
    const t = await founded();
    await t.call("joinEstate", { apprentice: "bea", apprenticeName: "Bea" });
    await expect(
      t.callAs(FAMILIAR, "speak", {
        commandId: "foreign-apprentice",
        apprentice: "bea",
        verse: "Small fire, wake and warm this room",
      }),
    ).rejects.toThrow(/not yours/);
  });

  it("carries a verse through hear, rehearse and commit, and then recasts it instantly", async () => {
    const t = await founded();
    await t.call("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room\nhama, come up from the ash",
    });
    const spoken = await t.call<SpeakResult>("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse:
        "Light for the green things, a little more\nand water where the earth is dry",
      focusCell: { region: "garden", x: 8, y: 4 },
    });
    expect(spoken.kind).toBe("deliberating");
    const spellId = spoken.spellId!;
    const heard = await t.callAs<{ ok: boolean; lacking: string[] }>(
      FAMILIAR,
      "hear",
      {
        spellId,
        intent: {
          subject: {
            kind: "cells",
            ref: "the herb beds",
            region: "garden",
            rect: { x: 6, y: 2, w: 5, h: 5 },
          },
          effect: "a little light and water on the herb beds",
          concepts: [
            { concept: "light", confidence: 0.9, fromWord: "Light" },
            { concept: "water", confidence: 0.9, fromWord: "water" },
            { concept: "more", confidence: 0.7, fromWord: "more" },
          ],
          unsure: [],
          tier: "cantrip",
        },
      },
    );
    expect(heard.ok).toBe(true);
    const source = `const beds = read.places("garden")["herb-beds"];\nfor (const c of read.neighbours({ region: "garden", x: beds.x, y: beds.y }, 1)) effect.transmute(c, { light: 1, water: c.water < 2 ? 1 : 0 });`;
    const rehearsal = await familiarRun(t, spellId, source, true);
    const reh = await t.callAs<{ ok: boolean; rehearsal: { summary: string } }>(
      FAMILIAR,
      "rehearse",
      { spellId, source, result: rehearsal },
    );
    expect(reh.ok).toBe(true);
    expect(reh.rehearsal.summary).toMatch(/light|water/);
    const result = await familiarRun(t, spellId, source, false);
    const committed = await t.callAs<{
      ok: boolean;
      status: string;
      receipts: unknown[];
      line: string;
    }>(FAMILIAR, "commit", {
      spellId,
      source,
      result,
      name: "a little light",
      gloss: { "1": "the herb beds" },
      margin: "Small, and correct.",
    });
    expect(committed.ok).toBe(true);
    expect(committed.status).toBe("cast");
    expect(committed.receipts.length).toBeGreaterThan(0);
    // Fast path: the same verse again is instant and a variation of the first.
    const again = await t.call<SpeakResult>("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse:
        "Light for the green things, a little more\nand water where the earth is dry",
    });
    expect(again.kind).toBe("instant");
    const rec = await t.call<SpellRecord>("spell", { id: again.spellId! });
    expect(rec.variantOf).toBe(spellId);
    expect(rec.fromCache).toBe(true);
    const book = await t.call<SpellbookView>("spellbook", {
      apprentice: "ada",
    });
    expect(book.spells.some((s) => s.name === "a little light")).toBe(true);
    // Scrying shows the words heard and the writing.
    const page = await t.call<ScryPage>("scry", {
      apprentice: "ada",
      kind: "spell",
      ref: spellId,
    });
    expect(page.spell.writing).toContain("herb-beds");
    expect(
      page.words.some((w) => w.concept === "light" || w.concept === "kindle"),
    ).toBe(true);
  });

  it("installs a ward that fires on its trigger when the world advances", async () => {
    const t = await founded();
    await t.call("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room",
    });
    // Give the apprentice the binding words the sparrow would teach.
    await t.call("scry", {
      apprentice: "ada",
      kind: "entity",
      ref: Object.keys(
        (
          await t.call<{ entities: Record<string, { sub: string }> }>(
            "dump",
            {},
          )
        ).entities,
      ).find((n) => n.startsWith("sparrow"))!,
    });
    const spoken = await t.call<SpeakResult>("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse:
        "Whenever a grey thing creeps in the dark of the beds,\nlet light come down on that cell and hold, hara",
      focusCell: { region: "garden", x: 8, y: 8 },
    });
    const spellId = spoken.spellId!;
    await t.callAs(FAMILIAR, "hear", {
      spellId,
      intent: {
        subject: {
          kind: "cells",
          ref: "the beds",
          region: "garden",
          rect: { x: 0, y: 0, w: 16, h: 16 },
        },
        effect: "light on any cell where vermin stands",
        binding: { kind: "whenever", condition: "vermin on a dark cell" },
        concepts: [
          { concept: "whenever", confidence: 1, fromWord: "Whenever" },
          { concept: "light", confidence: 0.9, fromWord: "light" },
          { concept: "ward", confidence: 1, fromWord: "hara" },
        ],
        unsure: [],
        tier: "ward",
      },
    });
    const source = `const t = read.trigger();\nconst cells = t && t.payload && t.payload.cells ? t.payload.cells : [];\nfor (const p of cells) effect.transmute({ region: "garden", x: p.x, y: p.y }, { light: 2 });`;
    const rehearsal = await familiarRun(t, spellId, source, true);
    await t.callAs(FAMILIAR, "rehearse", {
      spellId,
      source,
      result: rehearsal,
    });
    const result = await familiarRun(t, spellId, source, false);
    const committed = await t.callAs<{
      ok: boolean;
      status: string;
      line: string;
    }>(FAMILIAR, "commit", {
      spellId,
      source,
      result,
      name: "the vermin ward",
      persistent: {
        kind: "ward",
        trigger: {
          kind: "cell",
          region: "garden",
          predicate: "cell.growth > 0 && cell.light < 6",
          rect: { x: 0, y: 0, w: 16, h: 16 },
        },
      },
    });
    expect(committed.ok).toBe(true);
    const adv = await t.call<{ fired: number; tick: number }>("advance", {
      ticks: 6,
    });
    expect(adv.tick).toBe(6);
    const rec = await t.call<SpellRecord>("spell", { id: spellId });
    expect(rec.persistent?.active).toBe(true);
    expect(rec.firings.length).toBeGreaterThan(0);
    const ov = await t.call<Overview>("overview", { apprentice: "ada" });
    expect(ov.firstHour.firstWard).toBe(true);
  });

  it("lets Ilvane's ward be read, released, and crossed off the undone list", async () => {
    const t = await founded();
    await t.call("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room",
    });
    const page = await t.call<ScryPage>("scry", {
      apprentice: "ada",
      kind: "spell",
      ref: "stale:ilvane-sluice",
    });
    expect(page.spell.writing).toContain("there.stone > 0");
    expect(page.echo).toBeTruthy();
    const refused = await t.call<{ ok: boolean; reason?: string }>("release", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      spellId: "stale:ilvane-sluice",
    });
    expect(refused.ok).toBe(false);
    // Learn kaer from the notebook page by scrying a cast that used it... in the test, grant it through a bargain answer path is heavy; use the direct grant via a spirit seat instead.
    await t.call("registerParticipant", {
      role: "spirit:hearth",
      channelId: "ch-hearth",
      participantId: "p2",
      targetId: "do:x:y:hearth",
      handle: "hearth",
      name: "the Hearth",
      apprentice: null,
      room: null,
    });
    t.sql.exec(
      `UPDATE estate SET state_json = json_set(state_json, '$.apprentices.ada.words', json(?))`,
      JSON.stringify(["heat", "release", "ward"]),
    );
    const fresh = await createTestDO(TestWorld, undefined, { db: t.db });
    const released = await fresh.call<{ ok: boolean }>("release", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      spellId: "stale:ilvane-sluice",
    });
    expect(released.ok).toBe(true);
    const ov = await fresh.call<Overview>("overview", { apprentice: "ada" });
    expect(ov.activeSpells.some((s) => s.id === "stale:ilvane-sluice")).toBe(
      false,
    );
  });

  it("refuses a stranger's hand at the familiar's tools", async () => {
    const t = await founded();
    await t.call("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room",
    });
    const spoken = await t.call<SpeakResult>("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Moths to the lantern, lil,\nand nothing more",
    });
    await expect(
      t.callAs({ callerId: "do:someone:else:x", callerKind: "do" }, "hear", {
        spellId: spoken.spellId,
        intent: {
          subject: { kind: "cells", ref: "x" },
          effect: "x",
          concepts: [],
          unsure: [],
          tier: "charm",
        },
      }),
    ).rejects.toThrow(/not yours/);
  });

  it("charms by hand for free and writes the news as days pass", async () => {
    const t = await founded();
    await t.call("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room",
    });
    const ok = await t.call<{ ok: boolean }>("adorn", {
      apprentice: "ada",
      cell: { region: "orchard", x: 5, y: 5 },
      charm: {
        kind: "lantern",
        colour: "#ffd27a",
        label: "for whoever comes next",
      },
    });
    expect(ok.ok).toBe(true);
    await t.call("advance", { ticks: 48 });
    const news = await t.call<{ pages: unknown[]; unread: number }>("news", {
      apprentice: "ada",
    });
    expect(news.pages.length).toBeGreaterThanOrEqual(1);
    const region = await t.call<RegionView>("region", { id: "orchard" });
    expect(
      Object.values(region.region.adorns).some((a) => a.kind === "lantern"),
    ).toBe(true);
  });

  it("keeps a trail of the craft, scripts the first misfire into moths, and suggests a scry once", async () => {
    const t = await founded();
    await t.call("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room",
    });
    const first = await t.call<SpeakResult>("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse:
        "Light for the green things, a little more\nand water where the earth is dry",
      focusCell: { region: "garden", x: 8, y: 4 },
    });
    const src = `const beds = read.places("garden")["herb-beds"]; for (const c of read.neighbours({ region: "garden", x: beds.x, y: beds.y }, 1)) effect.transmute(c, { light: 1 });`;
    await t.callAs(FAMILIAR, "hear", {
      spellId: first.spellId,
      intent: {
        subject: { kind: "cells", ref: "the beds", region: "garden" },
        effect: "light on the beds",
        concepts: [{ concept: "light", confidence: 0.9, fromWord: "Light" }],
        unsure: ["more"],
        tier: "cantrip",
      },
    });
    const r1 = await familiarRun(t, first.spellId!, src, false);
    const c1 = await t.callAs<{ ok: boolean }>(FAMILIAR, "commit", {
      spellId: first.spellId,
      source: src,
      result: r1,
      name: "a little light",
    });
    expect(c1.ok).toBe(true);
    const rec1 = await t.call<SpellRecord>("spell", { id: first.spellId! });
    expect(rec1.trail.map((x) => x.stage)).toEqual([
      "spoken",
      "heard",
      "looked",
      "written",
      "cast",
    ]);
    // The second cantrip in the garden misfires into moths, whatever was written.
    const second = await t.call<SpeakResult>("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Warm the beds a little, hama,\nand keep the frost from the rows",
      focusCell: { region: "garden", x: 8, y: 4 },
    });
    expect(second.kind).toBe("deliberating");
    const r2 = await familiarRun(t, second.spellId!, src, false);
    const c2 = await t.callAs<{ ok: boolean; misfire?: { kind: string } }>(
      FAMILIAR,
      "commit",
      { spellId: second.spellId, source: src, result: r2, name: "warm beds" },
    );
    expect(c2.ok).toBe(false);
    expect(c2.misfire?.kind).toBe("moths");
    const rec2 = await t.call<SpellRecord>("spell", { id: second.spellId! });
    expect(rec2.receipts.some((r) => r.effect.kind === "spawn")).toBe(true);
    expect(rec2.margin.some((m) => m.text === "Well.")).toBe(true);
    expect(rec2.margin.some((m) => /Scry it/.test(m.text))).toBe(true);
    const ov = await t.call<Overview>("overview", { apprentice: "ada" });
    expect(ov.firstHour.firstMisfire).toBe(true);
    expect(ov.firstHour.scrySuggested).toBe(true);
    expect(ov.regions.find((r) => r.id === "garden")?.thumb.w).toBeGreaterThan(
      0,
    );
    expect(ov.golems.some((g) => g.name === "Toll" && g.mode === "stale")).toBe(
      true,
    );
  });

  it("convenes awake spirits in a hall and wakes each with the others' refs", async () => {
    const t = await founded();
    await t.call("speak", {
      commandId: crypto.randomUUID(),
      apprentice: "ada",
      verse: "Small fire, wake and warm this room",
    });
    t.sql.exec(
      `UPDATE estate SET state_json = json_set(state_json, '$.spirits.river.awake', json('true'))`,
    );
    const fresh = await createTestDO(TestWorld, undefined, { db: t.db });
    await fresh.call("registerParticipant", {
      role: "spirit:hearth",
      channelId: "hall-1",
      participantId: "p3",
      targetId: "do:x:y:hearth",
      handle: "hearth",
      name: "the Hearth",
      apprentice: null,
      room: null,
    });
    await fresh.call("registerParticipant", {
      role: "spirit:river",
      channelId: "hall-1",
      participantId: "p4",
      targetId: "do:x:y:river",
      handle: "river",
      name: "the River",
      apprentice: null,
      room: null,
    });
    const asleep = await fresh.call<{ ok: boolean; reason?: string }>(
      "convene",
      {
        apprentice: "ada",
        spirits: ["hearth", "library"],
        topic: "the books",
        channelId: "hall-2",
      },
    );
    expect(asleep.ok).toBe(false);
    const ok = await fresh.call<{ ok: boolean; key: string }>("convene", {
      apprentice: "ada",
      spirits: ["hearth", "river"],
      topic: "the wheel",
      channelId: "hall-1",
    });
    expect(ok.ok).toBe(true);
    const wakes = fresh.sql
      .exec(`SELECT wake_json FROM wakes WHERE channel_id = 'hall-1'`)
      .toArray() as Array<{ wake_json: string }>;
    expect(wakes.length).toBe(2);
    const w = JSON.parse(wakes[0]!.wake_json) as {
      hall?: { with: Array<{ ref: string }> };
    };
    expect(w.hall?.with[0]?.ref).toMatch(/^agent:(hearth|river)@hall-1$/);
    const ov = await fresh.call<Overview>("overview", { apprentice: "ada" });
    expect(ov.halls[0]?.topic).toBe("the wheel");
  });
});
