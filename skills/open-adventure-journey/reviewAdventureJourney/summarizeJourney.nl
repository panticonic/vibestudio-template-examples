---
description: Produce an evidence handoff from the scoped player snapshots and exact native result.
args:
  goal: string
  before: JourneyFocus
  current: PlayerJourney
  disposition: '"preserved" | "withdrawn" | "staged" | "replaced"'
returns: JourneyFindings
---
Use the goal and actual snapshots to compose the requested player findings. You may use classifyEvidence to distinguish confirmed, refuted and unknown facts. Identify subjects clearly with observed names, labels or identifiers; choose the facts needed to answer the actual questions, without an exact count or an internal save/observation receipt format. Keep an unknown result where a component is unspecified or contents are inaccessible. The disposition describes only the native operation actually recorded; a queued intention has not advanced the world. Return the relevant evidence.
