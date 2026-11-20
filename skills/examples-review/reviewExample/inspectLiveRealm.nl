---
description: Review saved realm accounts and a bounded forecast from the same realm.
uses: [reviewExample/combineFindings]
args:
  months: number
  claims: LiveRealmClaim[]
returns: ExampleReview
---
1. Call readSettlement with months. Use the two returned sources as supplied.
2. Call qualifyClaim once per assigned claim using those same sources. Keep each finding in order.
3. Call combineFindings with the ordered findings and return its report.
