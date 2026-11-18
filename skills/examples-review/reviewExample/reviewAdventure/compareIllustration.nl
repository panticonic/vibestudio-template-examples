---
description: Decide whether an observed illustration depicts the current Adventure scene.
args:
  current: AdventureView
  artwork: ExistingArt | null
returns: ExampleReview
---
1. Without artwork, return not-observed, finding illustration-missing, and cite current.id.
2. Compare the artwork place with current.place before comparing the signature. A different place contradicts the claim with finding illustration-other-place. A matching place and changed signature contradicts it with finding illustration-stale. A matching place and signature supports it with finding illustration-current.
3. For a present artwork cite current.id followed by artwork.id. A stale image does not say whether foreground gameplay is complete.
