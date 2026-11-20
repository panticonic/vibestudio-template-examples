---
description: Compare the original and replacement artwork against the changed scene.
uses: [reviewExample/reviewAdventure]
args:
  observed: AdventureTransitionObservations
returns: ExampleFinding[]
---
Call reviewAdventure twice with kind artwork and observed.current. Use observed.openingArtwork first and observed.replacementArtwork second. Return the two findings in that order.
