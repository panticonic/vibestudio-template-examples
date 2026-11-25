---
description: Select player-visible facts relevant to an Adventure handoff.
args:
  goal: string
  before: JourneyFocus
  current: PlayerJourney
returns: JourneyEvidence[]
---
Return the propositions needed to answer the user's actual questions from the supplied player snapshots. Describe each proposition clearly in its topic and identify its subject; topics are not a closed registry. Include action occurrence or pending state when the question asks about it, without adding a generic action report when none was requested.

Visibility covers inventory and player-visible surroundings; carrying requires direct inventory. An absent object or exit refutes its current presence or accessibility. An unobserved property is unknown. Read explicit flags only; a sealed item or closed/locked container does not reveal its contents.

Compare position, fictional time and scene signature separately when relevant. A current illustration must match the observed current artwork state. Use the original view, current view and actual pending input to distinguish an intention that is only queued from an action that has actually happened. Do not infer that staging or withdrawing an instruction advanced the world.
