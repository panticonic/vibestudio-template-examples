---
description: Compare two committed Adventure observations for continuity.
args:
  check: AdventureContinuityCheck
  before: AdventureView
  after: AdventureView
returns: ExampleReview
---
1. For time-advanced compare ticks and use finding journey-time. For same-place compare place identities and use same-location. For moved-to compare the actual after place with the requested target and require the before place to be different. Use finding destination-reached.
2. For still-carried require check.target in both complete inventory lists. Use finding retained-inventory.
3. Return supported when the criterion holds, otherwise contradicted. Cite before.id followed by after.id.
