---
description: Build one bounded Grimoire review from the live observations.
uses: [reviewExample/reviewGarden]
args:
  claim: LiveGardenClaim
  observed: GardenObservations
returns: ExampleReview
---
For a habitat claim, call reviewGarden with its criterion and the current observation. For a transition claim call reviewGarden with its criterion, the before observation, and the current observation as after. Keep the returned evidence IDs and judgment.
