---
description: Apply one player-approved operation to the exact saved observation.
args:
  current: PlayerJourney
  proposal: TurnProposal | null
returns: TurnReceipt
---
For a null proposal, call adventurePlayerTurn.withdraw with current.save.id and current.observation. Otherwise call adventurePlayerTurn.stage with current.save.id, current.observation, and the exact proposal. Return the service result unchanged.
