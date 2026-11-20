---
description: Verify continuity between the painted panel and its loaded view after reload.
args:
  observed: AdventureTransitionObservations
returns: ExampleFinding
---
Compare location, tick, asset and narration between repaint and reload. The reload light description must include "blocked by a covering". Return supported if each check holds, otherwise contradicted. Use finding persistent-rendered-covering and evidence IDs observed.current.id, observed.replacementArtwork.id and observed.reload.id.
