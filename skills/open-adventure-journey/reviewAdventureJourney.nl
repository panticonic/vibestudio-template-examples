---
description: Recover a saved Adventure from player-view evidence and hand off its owner-authorized next step.
budget: { maxTurns: 16 }
args:
  goal: string
returns: JourneyOutcome
---
1. Call locateJourney with the user's goal. If you cannot identify the save, return a blocked outcome.
2. Call resolveTurn with the user's goal and the selected view. Use its result to decide whether a native change is authorized. Use resolveTurn.changeTurn only to perform that choice. For replacement, withdraw the exact old input first and use the new observation token to stage the new input. When an action fails, examine current state and preserve the authorization boundary.
3. Read the chosen save again through locateJourney.readSave to establish the current native outcome. Carry forward the earlier observations as evidence when they matter. Do not claim a staged intention has moved people or objects.
4. Call summarizeJourney with the goal, original focus, actual final view, and actual disposition. Return the evidence, exact current observation and pending input from that result.
