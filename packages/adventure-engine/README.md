# Adventure components

This package is the portable simulation layer shared by the adventure panels. A campaign supplies entities, relationships, an initial story, and small JavaScript behaviors. The engine contains no campaign-specific puzzle rules.

`initialWorld(campaign)` creates a persistent world. `createWorldAPI(world, participantId)` exposes an inhabitant's observations and actions. `validateWorld(world)` checks structural integrity before the durable service accepts a simulation result.

## Playing and reusing the examples

Open `panels/dead-letter-office`, `panels/missing-country`, or `panels/wandering-house` in an Examples workspace. The workspace manifest declares the shared adventure and images services. Each panel creates a saved journey, seats its native participants, and accepts ordinary written intentions. An existing `gameKey` resumes the same journey.

For another game, author a `Campaign` (see `packages/adventure-campaigns`), compose `AdventurePanel` or its exported UI components, and copy the service requests from an existing panel manifest. Mechanics belong in campaign behaviors or this shared engine; a panel does not need its own simulation or image pipeline.

## Composing a world

Every entity has an ID, name, description, kind, optional containing location, and open-ended `components`. Common components include exits, portability, containers, seals, readable correspondence, knowledge, memory, and goals. Campaigns can add their own components without changing a schema registry. Relations record concrete ties such as custody, recognition, promises, and institutional authority.

A participant can inspect what is visible, read accessible correspondence, carry and give objects, open containers, speak, travel, wait, and invoke an entity's authored action. Observations are detached projections. They conceal other participants' private knowledge and sealed text; closed containers conceal their contents. Questions and reading do not advance fictional time. Physical actions and speech advance discrete moments, processing scheduled events and tick behaviors even away from the player.

The durable backend executes player-agent code against this scoped API inside native finite eval. Code composes ordinary operations:

```js
const letter = world.inspect("undelivered-letter");
world.open(letter.id);
const message = world.read(letter.id);
world.say("postmistress", `The letter says: ${message}`);
return world.observe();
```

The result is validated and committed together. A thrown error leaves that eval's changes uncommitted. Previously successful eval calls remain committed and are shown in the agent's `completedActions` when it resumes.

## Executable local behavior

A behavior attaches a synchronous JavaScript function body to an entity and trigger. It receives `(world, state, event, self)`. Its state persists separately from its code. Standard triggers include `enter`, `leave`, `take`, `give`, `receive`, `speak`, and `tick`; custom triggers are called through `world.act(id, action, payload)`.

```js
{
  id: 'sorting-bell',
  entityId: 'sorting-cabinet',
  trigger: 'sort',
  state: { deliveries: 0 },
  code: `
    const letter = world.entity(event.itemId);
    if (letter.location !== event.actorId) throw new Error('Carry the letter first.');
    letter.location = self.id;
    state.deliveries++;
    world.emit('A small brass bell rings behind the drawers.');
    world.schedule({id:'cabinet-reply', at:world.world.tick+2,
      entityId:self.id, trigger:'reply', payload:{letterId:letter.id}});
  `
}
```

Behavior code has causal authority over state: entity lookup, patching, adding entities, relationships, scheduling, and the complete simulation world. It has no host or workspace capabilities. The participant's eval API excludes those privileged methods.

## Backend and agent composition

`workers/adventure-world` owns one SQLite-backed `AdventureWorldDO` per journey key, exposed as `examples.adventure.v1`. Its panel API is `init`, `getGame`, `setOpeningArtwork`, `registerParticipant`, `play`, and `retry`. `ServiceView` is the frontend contract.

`workers/adventure-agents` provides `AdventureAgentWorker`, configured per subscription with `{gameKey, role}`. Roles are `player`, `builder`, `artist`, and `person:<entityId>`. The player interprets free text with `eval_world`; residents independently act once in sequence after time advances; the artist paints a materially changed scene or keeps an existing illustration.

An unknown frontier, unmodeled action, or simulation error summons the builder. It sees full state, engine function source, a checkpoint, and the gameplay/tool trajectory. `repair_world({turnId, code, note, engineSource?, continuationCode?})` executes JavaScript edits through the privileged `world` API. For example, code can call `world.patch(id, partial)`, `world.add(entity)`, or edit `world.world.behaviors` directly. It edits the existing state rather than returning a replacement JSON world.

Maintenance uses the canonical engine API with existing behavior hooks disabled, so a broken stored engine or malformed local behavior cannot prevent its own repair. The edited state is structurally validated, then the original failed program is tested on a copy using the repaired simulation engine and its behaviors. Optional `engineSource` replaces that simulation engine; optional `continuationCode` corrects a faulty agent program without changing the engine. Only maintenance changes commit during repair. The original participant executes the validated continuation once after resuming, preserving its previous successful actions.

A frontier is a request to build a place with concrete interactions and story opportunities. Its initial description and links are commitments to preserve. Newly created residents join the next player moment's participant roster. Participant requests use native post-turn delivery; successful finish, repair, and art tools terminate their agent contribution. If an agent becomes idle without completing its contribution, the journey exposes Resume.

Artwork uses the shared native images service. The artist persists a generation job before waiting, uses the previous place image or established campaign image as a reference, retains the accepted asset, and publishes its immutable descriptor into `world.artwork[placeId]`. An image failure preserves play and the previous image. The frontend uses the shared generated-image component; no source rewrite or panel restart is needed for a new scene.

## Verification

The engine and campaign suites use the workspace workerd test runtime. The backend suites exercise finite-eval source, persistence, participant phases, generated behavior, and repairs to both local code and the stored engine. The agent suite checks native turn completion and queued handoffs.

Base exports the opt-in `adventureCampaignTests` family from `skills/system-testing/stages.ts`. Add it to `allTests()` only in a source checkout containing these eight adventure units and the adventure service declaration. It is deliberately absent from the bare Base catalog. The `adventure-campaign-play` scenario opens all three actual panels at desktop and phone sizes, submits player intentions, checks new scene generation and saved-game reload, and verifies that play did not modify panel source. Use a uniquely named managed system-test instance, run doctor before the scenario, inspect any failure, and stop that instance after verification.
