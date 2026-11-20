---
description: Decide whether the assigned live demos meet their specific acceptance criteria.
uses: [reviewExample/combineFindings]
args:
  garden: ExampleReview
  realm: ExampleReview
  criteria: DemoCriteria
returns: ExampleReview
---
1. Process criteria in order. For each entry take component claimIndex from the matching game's report, using zero-based indices.
2. Call combineFindings with those components. Keep its decision, finding, evidence IDs and components.
3. Include both original reports under demos, with the keys garden and realm. Return the complete readiness report.
