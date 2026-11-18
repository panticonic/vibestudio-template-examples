---
description: Judge an Adventure availability claim from one actor-scoped observation.
args:
  check: AdventureAccessCheck
  current: AdventureView
returns: ExampleReview
---
1. For visible, look for check.target among current.entities and use the finding visible-object. For carried, look in current.inventory and use carried-object. For exit, look in current.exits and use available-exit. These lists are complete at this viewpoint, so presence supports the claim and absence contradicts it.
2. For open or unsealed, locate the exact entity in current.entities. Use finding container-open or document-unsealed. With the pertinent flag present, open is supported by open true and unsealed by sealed false. The other boolean contradicts the claim. An absent entity or null flag means not-observed. Do not infer an entity's real state from its absence in an actor's view.
3. Cite exactly current.id as evidence.
