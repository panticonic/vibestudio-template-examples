---
description: Combine independent Example demo checks into one publication judgment.
args:
  components: ExampleFinding[]
returns: ExampleReview
---
1. Keep components in input order, with each original finding and evidence list. In the overall evidenceIds, keep each identity's first occurrence in that order.
2. If any component is contradicted, return decision contradicted with finding criteria-contradicted. If there is no contradiction but a component is not-observed or the list is empty, return decision not-observed with finding criteria-unobserved.
3. If every component is supported and the list is nonempty, return supported with finding all-criteria-supported.
