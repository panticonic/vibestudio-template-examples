---
description: Review readiness across two installed Examples games using current observations.
uses: [reviewExample/inspectLiveGarden, reviewExample/inspectLiveRealm]
args:
  request: LivePortfolioRequest
returns: ExampleReview
---
1. Call inspectLiveGarden with request.garden.claims. Keep the full report.
2. Call inspectLiveRealm with request.realm.months and request.realm.claims. Keep the full report.
3. Call decideReadiness with both reports and request.criteria. Return its report.
