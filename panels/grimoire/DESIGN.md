# Grimoire — how it is built

Grimoire is a game built natively on the Vibestudio workspace. You inherit a
dead sorcerer's estate. The magic is still running and nobody turned it off.
You cannot ask for what you want; you can only speak verse in the circle, and
your familiar, a workspace agent, carries the verse down into the deep tongue,
which is code, and the valley does what was written. The full design, with the
world, the lexicon, the campaign and the familiar's craft, is in the host
repository at `docs/grimoire-design.md`.

## Four units

| Unit | Kind | Role |
| --- | --- | --- |
| `packages/grimoire-engine` | package | Pure and deterministic: 27 regions with elevation, flows and ley lines; the 22-rule reaction table; creatures with legible source; the calendar and festivals; the lexicon as a concept index matched fuzzily in any language; the form gate; spell records and capability gating; the world binding shipped as a prelude; effect validation with ceilings, ether and soft stakes; the letter, the undone list, notebooks, stories, stale workings, seed idioms, the voice bible; news and scrying pages. |
| `workers/grimoire-world` | Durable Object | `GrimoireWorldDO`, service `examples.grimoire.v1`, one estate per object key. Owns the regions, the sky, every spell record and its writing, persistent wards, automata, charters and workings, the spell cache, inscriptions, bargains, council cards, festivals, the undone list and the news. Runs the tick, evaluates ward triggers without code generation, wakes the agents, and enforces the spell record at commit. |
| `workers/grimoire-agents` | agent worker | `GrimoireAgentWorker`, a subclass of the default chat agent. One class, every voice: the familiar (two channels, the circle and the study, over one conversation per apprentice), each spirit, the Moor, and chartered golems. The seat comes from the channel subscription config. |
| `panels/grimoire` | Svelte panel | The valley (an SVG map drawn wrong where the estate is wrong, and a canvas per region), the circle, the study, the grimoire, the spellbook, the scrying page, the chapel, the spirits, the news and the green. Seats the agents on first run. |

## The casting loop

1. The player speaks in the circle. The world runs the **form gate**
   (deterministic, cheap: shape, never vocabulary). Prose gets one warm line
   from the familiar's voice bible; three in a row open the study.
2. The first verse-shaped speech lights the hearth, because the Hearth is
   kind; the world does that itself and grants the eight elements and two
   verbs.
3. The **spell cache**: a verse the player has cast before, or a variation
   with one name or number swapped, reuses its writing with no model turn.
   The world runs the stored source in its own sandbox and commits.
4. Otherwise the lexicon **resonates** the verse into concepts, the world
   mints a **spell record** (caster, concepts earned, tier guess, ether
   budget, scope) and wakes the familiar with a verse wake.
5. The familiar stages the turn with typed tools: `hear` (the intent record,
   checked against the record), `look`/`read_cells` (never writes from the
   verse alone), `rehearse` (runs its writing in its own eval sandbox against
   a fork), `cast` (runs it against the live snapshot and submits the batch),
   or `misfire` / `reject` with closed reasons.
6. The world validates every effect at `commit`: capabilities earned by the
   verse, the tier's rehearsal rule and effect ceiling, ether charged per
   receipt, soft stakes. Persistent tiers install their source; the world
   re-runs it on its trigger from then on. Council-required workings become a
   card in the chapel and cast when sealed.
7. The valley changes, the spell joins the spellbook, and the player may scry.

## Execution model

Both the familiar and the world run spell source through the same program:
`composeProgram(source, snapshot)` from the engine wraps the binding prelude
(the `makeWorld` function serialised as text) around the writing, so scrying
shows one kind of record no matter who ran it.

- The familiar runs its writing in **its own** eval sandbox through the
  workspace's eval service, against a `Snapshot` it fetched from the world,
  and submits the resulting effect batch. This is the demo moment: an agent
  writing real code and running it with the same eval every agent has.
- The world runs **unattended** source (ward firings, automata, working
  continuations, spirits' acts, the Moor) through the eval service in its own
  sandbox. Tests inject a local executor.
- Ward cell predicates are evaluated by a tiny expression evaluator, because
  workerd forbids code generation outside the sandbox.

## Time

The world advances by ticks it owns: a cast, a firing, "let the day pass" in
the panel, and, while someone is present, a slow idle cadence driven by the
server's alarm driver. No spell can observe that cadence, and nothing in the
game is a timeout. Wakes to agents are durable rows delivered by RPC with a
steering id, so redelivery is a no-op and failures are retried by
`redeliver`.

## Testing

From the host checkout, with the units copied into the Base checkout:

```
node node_modules/vitest/vitest.mjs run --config vitest.userland.config.ts packages/grimoire-engine workers/grimoire-world workers/grimoire-agents panels/grimoire
node node_modules/tsx/dist/cli.mjs scripts/type-check-userland.ts
```

The engine suite covers generation determinism, the calendar, the orchard's
flood and drain, soft stakes under the Moor, the gate corpus, resonance in
several languages, cache matching, the binding round trip through the shipped
prelude, ceilings and ether at commit, every stale working and seed idiom
running without error, and the milestones. The world suite drives the first
hour, a full hear → rehearse → commit → recast cycle, a ward that fires on its
trigger, releasing Ilvane's ward, seat authentication and the news. The
agent suite checks seats, tools and the cast path through the sandbox. The
panel suite compiles every component and checks the valley layout covers all
27 regions.
