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

Tests: `packages/regency-engine` (rules and a forty-season simulation),
`workers/regency-realm` (order book, seal, identity, clock), `workers/regency-agents`
(seats, tools, prompts), `panels/regency` (component compilation). Run them
through the workspace's ordinary `verify` flow or the host's userland Vitest
configuration.
