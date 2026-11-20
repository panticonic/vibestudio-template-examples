---
description: Select player-visible facts relevant to an Adventure handoff.
args:
  goal: string
  before: JourneyFocus
  current: PlayerJourney
returns: JourneyEvidence[]
---
1. Compare the current place, direct inventory, visible objects and nearby exits. Visibility covers the inventory and the player-visible surroundings. Carrying requires direct inventory. An absent object or exit is refuted as currently visible or accessible, while an unobserved property is unknown.
2. Read explicit flags only. A sealed item or a closed or locked container does not reveal contents. Make a contents claim on the container or sealed item's subject ID when requested.
3. Compare player position, fictional time or the exact scene signature separately when the request refers to another save. For a current illustration, establish whether it matches the scene from the current artwork state. Select the clauses that answer the user.
