---
description: Assess a known habitat and resident against stated public needs.
args:
  check: HabitatCheck
  current: GardenReadback
returns: ExampleReview
---
1. Find the requested habitat and resident by exact id. If either is absent, return not-observed. Use habitat-comfort for meets-needs, chosen-home for is-home and settled-resident for settled.
2. For meets-needs, look up each need by key in the habitat measurements and check that every available value is at least the resident minimum. Missing measurement means not-observed unless a known value already contradicts the claim. An empty needs list has no unmet need.
3. For is-home require resident.home to equal the requested habitat. For settled require that home match and resident.settled be positive. Return supported if the criterion holds and contradicted if observations rule it out. Extra shelter does not reduce comfort.
4. Cite exactly current.id.
