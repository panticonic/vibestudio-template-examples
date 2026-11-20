---
description: Review a committed physical Adventure change, repaint and reload.
uses: [reviewExample/reviewAdventure, reviewExample/combineFindings]
args:
  request: LiveAdventureTransitionRequest
returns: ExampleReview
---
1. Call readTurn. Use the same owned observations throughout.
2. Call reviewAdventure for time-advanced and same-place using the provided before and current views.
3. Call inspectCovering with request.covering, request.lamp and the observations. Call inspectRepaint with the observations. Call inspectReload with the observations.
4. Call combineFindings with the two continuity findings, the covering finding, the two repaint findings and the reload finding, in that order. Preserve the distinct findings. The stale opening illustration normally contradicts the claim that it still depicts the changed scene.
