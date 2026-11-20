---
description: Bind one assigned settlement claim to its saved or projected accounts.
uses: [reviewExample/reviewRealm]
args:
  claim: LiveRealmClaim
  observed: RealmObservations
returns: ExampleReview
---
1. For a settlement claim call reviewRealm with kind settlement and claim.check. Set current to observed.saved or observed.forecast as specified by claim.source.
2. For a comparison call reviewRealm with kind compare and claim.check. Use observed.saved as before, observed.forecast as after, forecast as basis, and the exact claim.assertCommitted value.
3. Return the child report unchanged.
