---
description: Assess a claim about one committed Regency settlement.
args:
  check: RealmCurrentCheck
  current: RealmReadback
returns: ExampleReview
---
1. For a route or region check match the exact requested id. Missing route or region means not-observed. Always cite current.id.
2. For subsidy-paid-and-idle use finding paid-unused-capacity. Require positive subsidy, service cost at least the subsidy, and reported cargo equal to zero. Missing cargo means not-observed. For cargo-under-capacity use route-bounded-cargo and require actual cargo no greater than measured capacity. Missing either measurement means not-observed.
3. For crossing-reopened use crossing-open and check route.condition equal to one and workers equal zero. For region-grain-at-least use regional-reserves and compare against the supplied threshold.
4. For has-debt use outstanding-debt and require strictly positive debt. For net-positive use positive-settlement and compare income against spending. Return supported for a true condition and contradicted for a false one.
