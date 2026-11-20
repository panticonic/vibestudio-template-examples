---
description: Verify that the intended covering changed the lamp's effective light.
args:
  covering: string
  lamp: string
  observed: AdventureTransitionObservations
returns: ExampleFinding
---
1. Test the exact covering and lamp IDs against the observed physical connection. The effective light must be false.
2. Return supported if both checks hold, not-observed if the light state is unavailable, otherwise contradicted. Use finding lamp-covering and cite observed.current.id followed by the covering relation ID when present.
