---
description: Review evidence from an Examples workspace game.
args:
  request: ExampleReviewRequest
returns: ExampleReview
---
1. Select the function for request.kind. Adventure uses reviewAdventure, garden uses reviewGarden, and realm uses reviewRealm.
2. For a single review call that function with request.review and return the report. Use the goal as context and stay within the supplied readbacks.
3. For a composed review, process each supplied item in request.work order. Call the corresponding game function for every item, then pass all resulting reports to combineFindings. Preserve that final report.
