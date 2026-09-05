# Grimoire — some things grow when we talk

The player befriends a small world through conversation with Moth. They can invent
anything, but delight comes from what persists: a hesitant lantern snail chooses a
home the player made, familiar creatures recognise a returning hand, and an ordinary
patch of ground becomes a place with shared memories. There is no spell grammar,
inventory, quest queue, offline decay or punishment for absence.

Talk to Moth, touch a creature, or linger. These are the whole opening interface.
Sol wants a damp, sheltered place beside the stream. The player can care for him,
ask about his world, or go somewhere completely different. The opening situation
is an invitation, not a required task.

## Public life and private perspectives

The garden persists habitats, residents, preferences, weather, discoveries and
executable enchantments. Resident forms and traits are open vocabulary. Needs are
minimum comforts; extra shelter is welcome. Shared ecological time handles gentle
water and flower growth, choosing comfortable homes, settling and recognition.
Repeated tapping does not accumulate affection within the same day.

Moth handles the foreground conversation and can acknowledge the player immediately.
`weave` executes ordinary JavaScript against the pending garden in a finite native
EvalDO without external capabilities. A creation can add a habitat or inhabitant,
change existing relationships and resources, or install a recurring rule receiving
`garden`, its private `state`, and `events`. Linger runs those rules before shared
life. Validation and revision checks precede a durable commit.

The wild is a separate background agent, with private desires and memories for
inhabitants and unresolved mysteries. It observes the committed world and gives
Moth a manifestation, rather than exposing private thoughts. It cannot overwrite
public changes or block a conversation. Stale background results are discarded.

## A world made of code

The entire opening illustration is ordinary editable Canvas code. Agents author
`paint(ctx, art, time, pointer, memory)` in a 1200 by 760 coordinate space.
`art.world` is the current public garden on every frame; updating life does not
reload the drawing. The library supplies optional shapes, plants, lighting, texture,
randomness and motion. It is not an entity registry. Ladybugs can have their own
wing cases, spots, legs and behaviour, rather than becoming a substitute effect.

Code executes in a dedicated worker inside an opaque-origin, networkless iframe.
Only pixels return; a watchdog stops stalled rendering and offers repair. Reduced
motion freezes animation while preserving interaction. Resident inspection is a
transparent target, so controls do not cover the creature's face. Discoveries
remain available as keepsakes, including older ones.

The native painter is exposed for occasional memorable places or keepsakes. Reuse
images and compose motion over them; do not regenerate art for ordinary conversation.
Game artwork bytes use the host blob store; SQLite stores only references.

## Persistence and evidence

Schema version 4 starts the `living_garden` format separately from retired demo
saves. Pending enchantments commit with Moth's completed turn. Linger is an atomic,
idempotent player action; background interpretation comes afterward. Roles are
authenticated, retries keep command identity, and canceled work cannot commit later.

Focused tests cover ecology, recognition, arbitrary forms, generated code, ownership,
idempotency and background supersession. The real `testkit:grimoire-play` scenario
asks for a shelter and ladybugs, lingers, checks Sol's discovery and verifies mobile
layout. A successful renderer alone is not evidence that the creation is delightful;
inspect the resulting inhabitants and picture too.

Live image generation remains integration-blocked: the native service generates a
PNG, but its canonical `vcs.edit` save encounters `SQLITE_TOOBIG` because the semantic
materialization outbox stores binary bytes inline in `gad_effect_intents.payload_json`.
The failing `testkit:grimoire-art` scenario is retained. This needs a repair at the
native content persistence boundary; game-side images already use blob references.
