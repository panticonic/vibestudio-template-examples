# Regency — the art of ruling

The player rules Willowmere through conversation with independently agentic advisors.
They decide what kind of realm to build, hear competing arguments, examine a forecast,
enact a decree and let time reveal its consequences. Travel, relationships and local
stories are adventures in their own right, connected to larger material forces.
Questions never advance time
or authorize a hypothetical policy.

The opening has four regions, a flood-damaged crossing, uneven food access, a strained
budget and a neighboring duchy's toll claim. These are starting circumstances, not
an action menu. The interface offers a living realm, three orientation signals, a
council conversation and one time control. Proposals and evidence appear when useful;
full forecasts and administrative detail remain folded.

## Causes before scores

An independent world-builder extends geography, cast, institutions and executable
mechanisms when exploration calls for them. `realm.systems` holds new domain state;
processes keep private state and run on authorized monthly ticks or explicit scene
interactions. Code revisions preserve accumulated state and apply prospectively.
Development is validated on a copy before publication; it cannot silently replace
existing systems. Scene actions have retry receipts, and committed effects survive
conversation cancellation. No dice layer is involved.

The shared economy also models military provisioning and labour, border tension,
treaty grain purchases, debt interest, health, housing pressure, migration and faction
support. These are deliberately legible starting dynamics, not a complete historical
simulation. Generated processes extend them without duplicating core settlement.

The shared economy settles each month: harvests depend on season and available labour;
food travels over routes with real capacity, damage, tolls and subsidies; local people
consume it; prosperity and confidence respond to food, market access and taxation.
Tax receipts depend on the resulting economy. Institutions consume resources, repair
crews earn wages and divert labour from production, and completing work actually
reopens the crossing. A treasury in arrears remains an obligation, not a hidden clamp.

Advisors author JavaScript policy bodies receiving `realm`, persistent private `state`,
`phase`, `months` and `events`. Code can create institutions and routes, change taxes,
allocate workers, make contracts, spend resources, install new processes and interact
with other policies. There is no enumeration of legal player plans. Shared derived
confidence and prosperity cannot simply be awarded by policy code.

`propose_policy` runs the next three months on copies with and without the proposal,
including existing programs. Forecasts are labeled projections. Enact runs once;
tick runs once per month before the shared simulation. Native finite EvalDO scopes
have no external capabilities and are always disposed. Invalid execution leaves
committed state intact.

An amendment names the running program it replaces. Its forecast and enactment remove
the old code; the new enact body explicitly unwinds or preserves public conditions.
This lets a regent revise or repeal policy without competing recurring programs.

The player's enact/time controls commit computed facts before waiting for commentary.
A canceled conversation cannot undo an already enacted decree. Failed time actions
retry the same command. A natural-language instruction can also authorize an advisor
to execute a previously discussed decree or advance time.

## Independent voices, open cast

Mara sees distribution and legitimacy, Ivo fiscal dependence, Sera border security.
Each has a separate agent, private desire, memory and only witnessed conversations.
The addressed advisor answers directly; there is no serial world coordinator or
narrator. Advisors can consult existing colleagues or invite a new independently
agentic specialist or representative. They cannot write another person's voice.

Public replies appear as they arrive. The background artist only runs when a new
visual invention is needed. Its result cannot replace newer world state or block
the next conversation. The existing map reads the live economy each frame, showing
active ferries, repair crews, completed bridges, cargo flow and seasonal change.

## Visual and interaction design

Each place retains a generated Canvas illustration independently of the living
strategic atlas. Scene-specific interaction documents provide fields, choices,
dossiers and actions; they submit intentions through the advisor and world execution
path rather than mutating state from the browser. They are generated compositions
of validated controls, not unrestricted generated React applications.

Bundled portraits, empty architectural references and opening compositions provide
an immediate foundation. See `../../ARTWORK.md` for prompts. This starter set is
bounded: further discoveries remain generated on demand.

The whole realm is an editable Canvas program using the optional living-canvas art
library. Code can go beyond every starter building, route and drawing helper.
Regional inspection gives local food reserves and causal observations. The ledger
summarizes the realm; it does not imply that abundant food is distributed equally.
Monthly accounts explain income, services, works and standing expenses. Mobile
controls occupy their own ledge instead of obscuring the landscape.

Native image generation is integrated for rare landscapes, diplomatic artifacts or
other lasting illustrations, composited with living code. Its current native PNG
save is blocked by the semantic VCS outbox's inline binary payload size; see Grimoire's
image integration scenario. Game artwork itself uses blob references, not large SQLite
values. Ordinary conversation never needs an image generation call.

## Persistence and verification

Schema version 4 uses `living_realm`, separate from retired demo saves. Durable pending
commands, private voices, proposal forecasts, permanent receipts and optimistic
completion checks protect turn ownership and retries. Background paintings are
revision-bound. Initial summary indicators derive from the same regional facts as
later months.

Focused tests cover conservation, fiscal accounting, recurring policy expiry, actual
food movement, labour-constrained repairs, seasons, authority, novel advisors,
retrying a failed command and preserving enacted facts across cancellation.
`testkit:regency-play` drives a real advisor forecast, the direct decree and time
controls, monthly service accounting, council interpretation, rendering and mobile
layout. Long-term balance and enjoyment still require human play beyond these checks.
