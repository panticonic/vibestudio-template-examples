---
description: Produce an evidence handoff from the scoped player snapshots and exact native result.
args:
  goal: string
  before: JourneyFocus
  current: PlayerJourney
  disposition: '"preserved" | "withdrawn" | "staged" | "replaced"'
returns: JourneyOutcome
---
1. Use classifyEvidence to distinguish relevant confirmed, refuted, and unknown facts. Use the subject ID from a view for evidenced entities, places and exits. When a requested object or route is missing everywhere the player looked, use the user's common name. For same-place, same-time or same-scene, use the comparison save ID as subject. For scene use the current place ID.
2. Return the current save ID, the relevant comparison save IDs, the exact current observation, the verified disposition, the evidence, and the current pending input unchanged. Keep an 'unknown' result where a component is unspecified or the contents are inaccessible.
