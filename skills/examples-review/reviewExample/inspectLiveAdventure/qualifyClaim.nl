---
description: Compare one assigned Adventure claim with its proper saved evidence.
uses: [reviewExample/reviewAdventure]
args:
  claim: LiveAdventureClaim
  observed: AdventureObservations
returns: ExampleReview
---
For access, call reviewAdventure with the assigned check and observed.current. For continuity, call it with the assigned check, observed.before and observed.current as after. For artwork, call it with observed.current and observed.artwork, including null for a missing illustration. Return the child report unchanged.
