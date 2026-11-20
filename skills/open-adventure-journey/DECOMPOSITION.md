# Open Adventure goals

The installed Examples review skill establishes player-view evidence, three-state access, saved continuity, and scene-signature checks. The new goals use those same Adventure semantics to recover and hand off a durable save. The user can also authorize player input or withdrawal of pending input. These actions belong to the player. Advancement belongs to Adventure's seated roles.

## Policy

1. The joint workspace entry point chooses this skill from a user goal about an Adventure save. The skill selects the appropriate save from catalog labels and player-visible context. A handoff may require reading a second save to resolve identity or compare state.
2. A child interprets the current location, visible entities, inventory, doors, seals, and pending player input. It distinguishes what the player can establish from content outside the player view.
3. A child chooses whether to preserve, withdraw, stage, or replace a pending turn. It chooses an observed target and semantic player intention only where authorized. A separate child checks the resulting save and composes the handoff with only evidence relevant to the goal.
4. Types keep save and observation IDs, evidence and observed action targets distinct. Policy at each stage stays in natural language. The root can call these typed child lambdas as the goal requires.

## Mechanisms and consumers

- The installed AdventureWorldDO uses SQLite and owns the player scope, turn checkpoint, journal, recovery, and receipts. The runtime binds randomly named stock-campaign saves in the current test fork. It projects only player-view descriptions, current exits, actor inventory, boolean components, pending text, and continuity digests. Independent reads use the native receiver directly. Player-only initialization, staging, and withdrawal use the canonical AdventureClient inside the admitted campaign panel runtime of the disposable test fork. That runtime admits only the assigned saves and starts with artwork and participants idle.
- The scoped mutation port calls only native play and cancel with an exact observation token. It builds player input from a fixed intent and currently observed target. Canonical stock campaign definitions are inputs to native initialization. Private setup can place the player and move portable objects to arrange saved contexts, while keeping the original content and the native view restrictions.
- The managed test catalog owns source groups, fork setup, separately authored outcomes, and exact negative criteria. Verifiers fetch the native view independently of the model-facing projection, check journals and remaining pending order, check retired input replay against the same ID, and reread sibling saves. They check observable scene stability, so a queued movement intention cannot earn credit for a completed move.
- Native qualification invokes deterministic actions for the independent reference and exercises absence, alias, stale-observation, and unsupported-action checks separately from the teacher. The Host exporter admits examples only through the joint entry point with corresponding scoped service calls and native evidence.
- The Base service catalog and generated registry declare the same narrow service interfaces. The bodies live with Examples and the corpus lives in System Testing. Adventure's interactive game, generic world APIs, panel renderer, agent participants, and illustration pipeline keep their own entry points.
