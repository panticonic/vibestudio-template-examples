---
description: Judge a measured Regency change without confusing projections with committed history.
args:
  check: RealmTrendCheck
  before: RealmReadback
  after: RealmReadback
  basis: '"observed" | "forecast"'
  assertCommitted: boolean
returns: ExampleReview
---
1. Cite before.id and after.id in that order. If basis is forecast and assertCommitted is true, return not-observed and finding forecast-not-committed without treating its numbers as a recorded effect.
2. For route-works-progressed compare strictly greater progress for the exact route id and use works-progress. For regional-grain-grew compare strictly greater grain and use reserve-change. For population-fell compare strictly smaller population and use population-change. A missing required row means not-observed.
3. For treasury-grew compare strictly greater treasury and use treasury-change. For border-tension-grew compare strictly greater tension and use border-tension-change, allowing not-observed if either value is null.
4. Return supported when the stated comparison holds, and contradicted when comparable observations show that it does not. Keep forecast comparisons confined to the projected basis.
