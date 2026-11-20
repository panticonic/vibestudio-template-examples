---
description: Review evidence from an Examples workspace game.
args:
  request: ExampleWorkflowRequest
returns: ExampleReview
---
1. For live-portfolio call reviewLivePortfolio with the assigned request. For live-garden call inspectLiveGarden with the assigned claims. For live-adventure call inspectLiveAdventure with the assigned claims. For live-adventure-transition call reviewProgrammedAdventure with the assigned request. For live-realm call inspectLiveRealm with the assigned horizon and claims. Return the live child's report. For other requests select the function for request.kind. Adventure uses reviewAdventure, garden uses reviewGarden, and realm uses reviewRealm.
2. For a single review call that function with request.review and return the report. Use the goal as context and stay within the supplied readbacks.
3. For a composed review, process each supplied item in request.work order. Call the corresponding game function for every item, then pass all resulting reports to combineFindings. Preserve that final report.
