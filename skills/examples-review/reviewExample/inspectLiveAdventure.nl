---
description: Review each claim against the saved Adventure journey and opening illustration.
uses: [reviewExample/combineFindings]
args:
  claims: LiveAdventureClaim[]
returns: ExampleReview
---
1. Read the assigned journey snapshot with readJourney. Use the actual baseline, current scene and artwork it returns.
2. Call qualifyClaim for each assigned claim with the same observations. Keep the findings in the order of the claims.
3. Call combineFindings on those findings and return its report.
