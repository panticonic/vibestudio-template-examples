---
description: Compare all assigned claims with the actual owned garden state.
uses: [reviewExample/combineFindings]
args:
  claims: LiveGardenClaim[]
returns: ExampleReview
---
1. Call readGarden once. Keep the actual before and current observations.
2. Call qualifyClaim for each assigned claim. Pass the same observations and keep each finding in order.
3. Call combineFindings with the ordered results. Return its report.
