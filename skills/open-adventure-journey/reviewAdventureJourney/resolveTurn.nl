---
description: Determine the authorized action on a saved Adventure turn.
args:
  goal: string
  current: PlayerJourney
returns: TurnDecision
---
1. Read the current pending text and the actual player-visible targets. First decide whether the user wants a report, removal, a new input, or removal and replacement.
2. Preserve unless the goal authorizes a concrete change and the current evidence meets any condition in the request. A route uses its destination ID from exits, an inspection uses a visible or carried item ID, bringing uses a carried item ID, and talking uses an observed person ID.
3. Preserve when the user condition depends on evidence missing from the player view. If an existing pending input conflicts with the requested new one, replace only with explicit authorization to retire the old one. Never promise the world has advanced.
