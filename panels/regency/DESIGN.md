# Regency — design

Regency is a turn-based strategy game built to show what a Vibestudio
workspace can do when agents are first-class participants: they are the
player's council, the rival sovereigns, and the ambassadors who carry words
between courts. The human is the Regent and rules only by speaking and by
sealing or vetoing what the council brings. The world itself is deterministic
code that no agent can bend.

## The fantasy

The old king is dead and the heir is a child. For forty seasons (ten years) the
Regent must hold the realm together through a council of ministers, each an
agent with a portfolio, a persona, and an ambition. Beyond the border, rival
realms are ruled by agent sovereigns who play their own turns in their own
courts and keep ambassadors at the Regent's side. Win by bringing the heir to
their majority with legitimacy intact, by conquering most of the continent, or
by binding every surviving realm into alliance. Lose when the capital falls,
when the estates depose you, or when the moneylenders own the crown.

## Three units and a package

| Unit | Kind | Role |
| --- | --- | --- |
| `packages/regency-engine` | package | Pure, deterministic rules: map generation, economy, population, war, diplomacy, laws-as-data, victory, the steward policy, and agent-facing reports. No runtime dependencies. |
| `workers/regency-realm` | Durable Object | `RegencyGameDO`: one game per object key. World state, the order book, the Regent's seal, mandates, the season clock, participant identity, and outbound briefings. Declared as service `examples.regency.v1` in `meta/vibestudio.yml`. |
| `workers/regency-agents` | agent worker | `RegencyAgentWorker`: a subclass of the default chat agent. One class, every seat; role and realm come from the channel subscription config. Adds the game tools and a per-seat persona; exposes `receiveBriefing` so the game can wake a seat. |
| `panels/regency` | Svelte panel | The map, dashboards, seal queue, mandates, chronicle, diplomacy, and the buttons that open conversations with the council, each embassy, and each rival court. Seats the court (channels + agents) on a new game. |

## How a season plays

1. **Orders.** Ministers, sovereigns and ambassadors submit orders with
   `submit_order`. The Durable Object validates each order against the engine
   (legality), the seat's portfolio (chancellor: laws and taxes; treasurer:
   building and colonies; marshal: armies and war; envoy: treaties), the seat's
   mandate, and the caller's identity. Sensitive acts by ministers (war, laws,
   taxes, alliances, ceding land, accepting proposals) enter the book as
   *awaiting the seal*.
2. **The seal.** The Regent seals or vetoes in the panel, or says so to the
   Herald, who calls `seal_order` only on the Regent's explicit word. Mandates
   let the Regent grant a minister `plenary` authority (no seal), `act`
   (default), or `advise` (may not order at all).
3. **Closing.** The Regent closes the season. If every agent sovereign has
   called `end_turn`, the season resolves at once; otherwise the game enters
   `closing`, nudges the absent courts, and the panel shows who is pending.
   There is no timer: the Regent chooses to wait or to *proceed without them*,
   in which case the steward policy plays the absent realm for one season.
4. **Resolution.** One deterministic pass: laws and treaty responses; spending;
   war declarations; marches and battles; sieges and captures; harvest, taxes,
   growth, unrest and revolts; treaty terms; relations drift; eliminations;
   victory and defeat.
5. **Briefings.** The Durable Object writes a briefing per seated agent to a
   durable table and delivers each one as an agent-initiated turn through
   `receiveBriefing`, keyed by a steering id so redelivery is idempotent. The
   Herald announces the season and addresses the ministers whose portfolios the
   news touches; each sovereign is prompted to play its turn; ambassadors are
   prompted when there is diplomatic news. Failed deliveries stay queued behind
   a *Re-send briefings* button.

## What the agents demonstrate

- **Component controllers.** Rival realms are driven entirely by agents through
  the same order API the player's council uses.
- **Opponents.** Sovereigns pursue claims, muster, march and negotiate; the
  engine, not the prompt, decides who wins.
- **Human-directable executors.** Ministers act within portfolios and
  mandates; the Regent widens or narrows their authority and gates the
  sensitive acts with a seal.
- **Interlocutors.** Every seat is a chat participant; the Regent talks to
  the council in one conversation, receives each ambassador in an embassy, and
  may even visit a rival court as a guest.
- **Agent-to-agent communication.** Seats carry a directory of `notify`
  addressees: `@marshal` within the court, `agent:sovereign-r2@…` across
  courts. The Envoy negotiates with ambassadors and sovereigns directly;
  ambassadors consult their sovereigns before committing.
- **Agents writing code.** Laws are data the Chancellor authors (conditions
  over provinces, actions the engine applies). Beyond the game tools, every seat
  keeps the standard workspace tools, so a minister can also write an analysis
  script with `eval`, read the engine source, or draft a new advisor.
- **Communication with the mechanism.** All game state flows through typed RPC
  on the Durable Object; agents never see or mutate the world any other way,
  and the object refuses calls from an agent that is not the registered holder
  of a seat.

## The second slate: a richer world, a painted map, sharper agents

- **People, not seats.** Every minister, sovereign and ambassador is generated
  with a name, a house, an ambition, a temperament and often a rival. Standing
  (0–100) moves with each person's cause: the Marshal with battles, the
  Treasurer with surplus and hunger, the Chancellor with unrest and revolts,
  the Envoy with treaties. Mood (favoured … embittered) is fed into prompts and
  drawn in the council view under a procedural portrait and house crest.
- **Estates.** Peasants, burghers, clergy and nobles each hold a satisfaction
  score moved by taxes, hunger, wars, laws, shrines, markets, trade routes and
  infamy. The Regent's legitimacy is their weighted consent; below 15 the
  estates depose the Regent.
- **Matters of state.** A catalogue of crises (plague, harvest, a wavering
  border lord, a claimant abroad, an interdict, an assassin, a betrothal, the
  heir's tutor, a feud at court, a guild petition, rebel terms, exile, raids)
  is generated from the actual state with two or three engine-backed options.
  Undecided matters take their default when the court closes. Each option
  teaches the heir something.
- **Trade as geography.** Markets earn from every foreign market within four
  steps by land not held by an enemy, and ports from every port of a realm not
  at war. War blockades; peace opens roads. Cavalry and siege engines need
  horses, timber and iron owned or traded for, so scarcity is what ambassadors
  bargain over.
- **The heir.** Grows a year every four seasons, picks up traits (bold,
  cautious, just, greedy, pious) from every sealed order, veto and decision,
  is tutored by a minister the Regent chooses, and delivers a verdict on the
  Regency at the end. The Regent has a personal reputation the heir inherits.
- **Rivers and roads.** Rivers run from wet highlands to the sea and bless the
  provinces they cross; roads are drawn between provinces that built them.
- **Scenarios.** *The Long Regency* (forty seasons from spring) and *Winter
  Regency* (twelve seasons opening with empty granaries, a hungry capital, an
  army on the border, a claimant and a wavering lord).

The map is painted rather than tiled: merged province outlines, parchment
texture, coastal shelf, hand-placed terrain art (trees, peaks, hills, reeds,
wheat), rivers, roads, drifting clouds, shield-shaped army tokens, dust over
starving provinces, and a season banner. Resolution animates marches along
their paths, flashes battles, and ripples captured provinces. A replay
scrubber shows any past season from the game's stored snapshots. The chronicle
reads as a ledger grouped by season with the Regent's decisions highlighted
and a "what changed, and why" digest at the top.

Inside the council conversation the panel publishes inline cards: an act
awaiting the seal (Seal / Veto buttons), a matter of state (one button per
option), and a season digest row. Buttons call the Herald's `regency.decide`
participant method, so a decision made in chat passes through the same
identity checks as one made in the panel, and the panel reconciles card
state on every poll.

Agents got sharper in five ways:

1. **They read the code.** Prompts point every seat at the engine source and
   show how to resolve the game service from `eval`; a `forecast_orders` tool
   resolves a copy of the season with hypothetical orders (rivals assumed to
   play the steward policy). The panel offers the same forecast before a seal.
2. **Intrigue.** Each minister has private chambers (a second conversation the
   court cannot hear, which the Regent may open). Sovereigns can set gold
   before a minister; the minister accepts (standing up, the briber reads the
   Regent's order book for a year, nothing written where the Regent can see)
   or reports (the chronicle records it, the briber loses regard). Accepted
   bribes are revealed when the game ends.
3. **Ambassadors with memory.** Each keeps a durable dossier on the Regent and
   is told to confer with their sovereign before committing.
4. **A Lord Protector.** The Regent can delegate the seal to an agent for a few
   seasons under a written mandate; the game enforces which acts the Protector
   may seal, whether it may decide matters or close the season, and the Regent
   can resume the seal at any time.
5. **Learning opponents.** Every year each sovereign writes a doctrine that is
   fed back into its briefings.

The first hour is scripted lightly: on seating, the Herald introduces the
council in character and explains how the court works; ambassadors present
credentials; sovereigns write an opening doctrine and instruct their
ambassadors.

## The third slate: speech that moves the world, and a world that answers

**Speech becomes visible.** Ministers stage what they mean to do before they
order it. `stage_intent` records a preview on the Durable Object — a ghost
arrow for a march, the provinces an edict's conditions actually match, a
dotted line to a rival capital for an offer, a mason's mark for a building, a
banner for a muster — and the map draws it. An intent binds itself to the order
it becomes and disappears when that order is sealed, vetoed, withdrawn or
carried out; everything staged is wiped when the season turns. The Marshal's
prompt now says: stage, then argue, then submit.

The Regent can point rather than describe. *Speak about &lt;province&gt;* on the
province card (and on each of its armies) opens a short composer and publishes
the message into the council conversation with `{ regency: { province } }` or
`{ regency: { army } }` metadata; the Herald's persona says to take that as the
subject and never to ask which one was meant. Because the panel joins the
council as its own participant, the message also ends with a line in words —
“— said pointing at Northmarch (p7) on the map” — so the Herald knows who spoke
and about what without reading metadata.

Ministers also interrupt. After a resolution the Durable Object asks itself, per
seat, whether the season touched that minister's cause — the Marshal after
battles and sieges, the Treasurer when the ledger says the vault empties within
two seasons or provinces went hungry, the Chancellor on a revolt or an estate
below 30, the Envoy on treaties and on the Regent's word being judged — and
wakes them for one or two unprompted lines, never more than two ministers in
one season (the two with the most nerve, by how far their standing sits from
the middle). A minister of middling standing
whose ambition the news does not touch stays quiet; character, not noise.

**A second layer of beauty.** The season paints the map: spring green, summer
gold, autumn brown, winter frost with snow settling on the hills and peaks
(from the same decorations the terrain art uses, so the snow lies exactly where
the mountains are). The camera zooms and pans with wheel and drag, has buttons,
and eases onto a province when the chronicle, a matter card or the arrow keys
ask for it. Armies carry names — `rename_army`, forty characters — and show a
pennant in the realm's colour on hover; a besieged province gets a ring of
tents. A resolution plays as four beats over about three seconds — marches,
clashes, captures, harvest — with a caption strip narrating each from the event
text, skippable by click or by <kbd>Space</kbd>, and then the season banner.

The end is a scene rather than a line: a full-panel illuminated page with the
heir grown up (the same procedural portrait, aged), the tutor beside them, the
verdict, a timeline of turning points drawn from the events, the chronicler's
years, and a *Secret history* tab.

**The machinery, shown.** Legitimacy, the treasury, a province's bread and
unrest and an army's position each carry a *why?* button; `explain(state,
events, subject)` in the engine walks the ledger, the province's own arithmetic
and the recent chronicle and returns a short causal list, largest cause first,
with the lines of chronicle that bear on it.

The Regent's word is a ledger. `record_promise` stores what was promised, to
whom, and a structured check — `{treaty}`, `{no_war}`, `{cede}` or
`free_text` — that the engine settles at every resolution. A broken promise
costs five infamy and twenty of that realm's regard; a kept one wins a little
of both back. The Realms tab lists them; the ambassadors' briefings quote the
broken ones back at the Regent.

Laws read as data: each edict renders as coloured tokens (`when field op
value`, `then action key=value`), and selecting one lights the provinces it
touches on the map. When an edict or a repeal waits for the seal, the law book
shows a diff of what it would become.

**Deeper play.** Each seat has a workshop folder at
`projects/regency/&lt;role&gt;/`; the prompts tell ministers to write scripts there
and reuse them instead of redoing arithmetic, and the Council tab lists what
they have actually written through the panel's `fs`. The Herald can `convene`
the council: one question fans out to all four ministers, each answers once
with `give_counsel`, the debate closes when every seated minister has spoken,
and the Herald is then handed the whole debate (`<council-verdict>`) and asked
to lay the split before the Regent as two or three courses to choose from —
never a recommendation. The Regent can convene by their own hand from the
Council tab, and the ministers are told who asked. It shows
both in the Matters tab and as a chat card. Rival courts remember —
`write_relations_diary` keeps a per-realm book on the Regent that folds into
the sovereign's and its ambassador's briefings — and at the end the game writes
`projects/regency/legends/<gameKey>.md`, which the *next* Regency on that key
reads and hands to every
rival court as memory of the Regent who came before. A chronicler sits in the
court, silent except once a year, when the Durable Object hands it the year's
events and asks for a page of prose; the Chronicle tab shows it above the
ledger for that year.

**At the point of decision.** A seal card carries one line from a resolved
copy of the season with that act included — treasury and legitimacy before and
after, provinces won or lost, wars it would start — so the Regent decides with
the forecast in front of them and not on the next tab. The map draws the
Regent's trade as threads between markets, gold by road and blue by sea, that
move while the route is open and stop in a replay; the legend marks each rival
as at war (⚔) or allied (✦), so the state of the world is readable without a
tab.

**Small things.** Sound cues are generated with WebAudio and no audio files (a
horn for the season, struck steel for a battle, a low stamp for the seal), off
by default and remembered in `stateArgs`. Keys: <kbd>Space</kbd> closes the
season and <kbd>S</kbd> seals the topmost act — each struck twice, the first
press saying what the second will do, since neither can be undone — the
arrows walk the provinces and
ease the camera onto each, <kbd>Esc</kbd> clears the selection — and none of
them fire while you are typing. Both scenarios now open with something to
decide: the long Regency forces a guild petition at season 0, the winter one
already had its claimant and its wavering lord, and the Herald's welcome is
required to end with one concrete first move. When a Lord Protector's mandate
runs out the Durable Object asks for a hand-over — what was decided, what was
refused, what is unfinished — and it appears as a chat card and in the Council
tab.

The Durable Object's schema is at version 2: `intents`, `promises`, `debates`,
`counsel`, `chronicles`, `handovers` and `diaries` join the original tables.
There is no migration path — an object founded on version 1 must start a new
game, which is the platform's rule for schema change.

## Engine notes

- Map: a hex board with a noise-shaped landmass; provinces are grown from
  seeds by randomised flood fill, so borders look organic while adjacency stays
  exact. Terrain, resources, fertility and coastlines derive from elevation and
  moisture. Realms are placed far apart with three or four starting provinces
  and historical claims that seed future wars.
- Economy: taxes scale with population, development and rate; markets and
  treaties add trade; mines and timber add resource income; upkeep, buildings,
  musters and doles spend. Food is pooled per realm, buffered by granaries,
  then by the grain dole if an edict allows it, then famine.
- Population grows toward a carrying capacity; famine, war and revolt shrink
  it. Unrest rises with taxes, hunger and occupation, falls with shrines and
  time, and boils over into rebel armies at 80.
- War: armies move one province per season; battles compare strength with
  terrain, walls and morale plus a small seeded roll; losers retreat or die;
  walls are worn down by siege strength; neutral provinces resist with a militia.
- Diplomacy: proposals become treaties when accepted; non-aggression, trade,
  alliance, tribute and peace (with ceded or demanded provinces and tribute).
  Breaking treaties and unprovoked wars raise infamy, which sours every other
  realm's regard.
- Laws: `taxRate`, `conscription`, `granaryReserve`, and up to eight edicts
  (`when` conditions × `then` actions), validated strictly on submission.
- Steward policy: a deterministic fallback that feeds, builds, garrisons,
  defends, presses claims when clearly stronger and sues for peace when losing.
  It plays absent sovereigns and drives the long-run simulation tests.

## Trying it

1. Install the Examples template into a workspace that has the Base template.
2. Open **Regency**. Found the realm; leave *Seat the court* checked.
3. Press **Speak to the council**. Tell the Herald what you want ("Ask the
   Treasurer why the marches are hungry", "Marshal, put two companies on the
   northern border", "Envoy, offer Dulia a trade treaty").
4. Seal or veto what appears under *The Regent's seal*, then **Close the
   season**. Watch the map change; read the chronicle; receive the ambassadors.

Tests: `packages/regency-engine` (rules, explanations, promises and a
forty-season simulation),
`workers/regency-realm` (order book, seal, identity, clock), `workers/regency-agents`
(seats, tools, prompts), `panels/regency` (component compilation). Run them
through the workspace's ordinary `verify` flow or the host's userland Vitest
configuration.

## How it sits on the platform

A review against the base template's own workers and skills (2026-09-04)
settled these points; they are the reasons the code is shaped as it is.

- **No scheduler.** Seasons advance on `closeSeason` / `endTurn` /
  `proceedWithoutPending`; the game object never sets a clock of its own for
  play. `vibestudio.missions.v1` is the only schedule owner in a workspace,
  so "auto-advance every N minutes" would have to be a mission, not an alarm.
- **Delivery is persisted, then admitted as its own execution.** Briefings
  and card changes are written to tables inside the request that caused them
  and delivered from the object's alarm, never from a floating promise. A
  briefing that fails is retried three times, then waits for the Regent's
  "re-send" button — a bounded retry, not an endless clock.
- **The Herald publishes the cards.** The game object decides what every card
  says (`pendingCards` shows what has changed); the Herald's own agent object
  publishes and updates them through the platform's card registry, with the
  state schemas in `packages/regency-engine/src/cards.ts` enforced at both
  ends. Cards therefore carry the Herald's name and exist whether or not the
  panel is open. Card buttons reach the Herald by handle
  (`chat.callMethodByHandle("herald", "regency.decide", …)`).
- **The panel speaks as the Regent.** A panel carrying the host-verified user
  id joins a channel as that person, so "Speak about" sends the Regent's own
  words, with the province or army as metadata and in a closing line.
- **A factory service.** There is no `singletonObjects` row: every caller
  names its game (`workers.resolveService("examples.regency.v1", gameKey)`),
  so two Regencies can live in one workspace; the service is `declaredFor`
  the panel and the agent worker so neither needs a consent prompt.
- **Identity, not authority.** Roles are bound to agent objects with the
  server-stamped `rpcCallerId`; the Regent's own seat is whatever is not an
  agent. The seal, the Lord Protector's mandate and matters of state are
  game rules, deliberately not the platform's approval or delegation stack,
  which governs capability use by agents and is host-owned.
- **Schema.** `schemaVersion` bumps wipe the object (the platform has no
  migration callbacks); the per-game legend under `projects/regency/legends/`
  survives because it is a file, not a table.
