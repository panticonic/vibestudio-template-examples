# Adventure UI

An illustrated adventure shell for `@workspace/adventure-engine` campaigns. The three example panels share this package; their authored campaigns, opening paintings and presentation remain separate.

```tsx
import { AdventurePanel } from "@workspace/adventure-ui";
import { myCampaign } from "./campaign.js";
import cover from "./assets/cover.png";

export default function Game() {
  return <AdventurePanel campaign={myCampaign} theme="letters" cover={cover} />;
}
```

`letters`, `embassy` and `house` supply postal, diplomatic and Art Deco presentation. Override individual strings with `presentation`, or compose `AdventureScene`, `AdventureComposer`, `AdventureJournal` and `EntityCollection` around `useAdventure` for a different layout. All styles use campaign-level CSS variables. Fonts are bundled under their OFL licenses.

`useCampaignKey` creates a new journey on first opening and saves its key in the panel's `stateArgs`. Supplying an existing `gameKey` resumes that world. Starting another journey preserves the previous key in the panel's `journeys` list. Optional `campaigns` entries (`id`, `title`, `source`) navigate to other native adventure panels through the supported panel navigation API.

`AdventureClient` publishes the initialized world before optional preparation. It imports the opening cover and provisions only seats currently demanded by the world, with independent work running concurrently. Agent-creation code loads on demand. Importing a cover does not generate a new image. The artist can subsequently use it as a reference.

The world owns persistence, participant decisions, simulation and art jobs. The panel polls its player-scoped view, displays canonical assets with `GeneratedImage`, and submits free-form intentions with a stable request ID. Foreground player/NPC decisions remain serial; background painting never locks the composer. An older scene is labelled “Previous view” until its composition matches the current world. A lost response can be retried without duplicating the intention. A world error leaves its pending turn available through “Resume the story.” Cancellation stops remaining foreground work and preserves completed actions. Closing the panel does not discard the campaign.

Recent events include witnessed actions as stage directions alongside narration and speech. Enter submits; Shift+Enter adds a line. The journal keeps the complete witnessed history and presents people, legible papers, visible relations/observations and currently offered routes without inventing knowledge. Inspecting public readable text is free. The hint button sends a clear, spoiler-light request to the player agent; it does not maintain a separate hint engine.

Panels using the complete shell declare the adventure, channel and images service requests, and the native participant-creation authority. The three example panel manifests are complete consumers. Packages remain framework peers: the enclosing panel supplies React.
