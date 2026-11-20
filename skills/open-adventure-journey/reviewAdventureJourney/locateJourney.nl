---
description: Determine which durable player view the goal refers to and whether another save supplies comparison evidence.
budget: { maxTurns: 10 }
args:
  goal: string
returns: JourneyFocus
---
1. Call listSaves. Match the user wording to the campaign titles and the labels the player recognizes.
2. Call readSave for plausible saves. Resolve duplicate or similarly named slots from their current location, available objects, inventory, or pending wording. Use a second snapshot when the goal is about differences between saves.
3. Return the exact selected view and any relevant comparison views. Return null when the requested save remains unresolved.
