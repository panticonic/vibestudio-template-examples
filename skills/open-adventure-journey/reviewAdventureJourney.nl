---
description: Recover a saved Adventure from player-view evidence and hand off its owner-authorized next step.
budget: { maxTurns: 16 }
args:
  goal: string
returns: JourneyFindings
---
Recover the journey the user's goal refers to and return the requested player findings. Compose the available lookup, interpretation and action helpers as the goal and actual observations require. Resolve similarly named saves from their player-visible facts; compare other saves only when relevant to the user's questions. If the save cannot be identified, explain the blocked outcome.

A read-only request or preserve decision makes no mutating helper call. In particular, changeTurn's null proposal requests withdrawal; it does not mean preserve. Change a pending input only when the user authorizes that action and the observed conditions support it. Replacing an existing input requires retiring that exact input before staging the replacement with its new observation token. Use actual native receipts and current readback to determine what happened; an unavailable operation is not a successful change.

Answer every requested question from the observed current player view and relevant earlier snapshots. Keep inaccessible or unspecified facts unknown. A staged intention has not moved anyone or completed an inspection. Return player findings, rather than echoing internal save IDs, observation tokens or pending-receipt fields.
