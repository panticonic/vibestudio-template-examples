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

`useCampaignKey` creates a new journey on first opening and saves its key in the panel's `stateArgs`. Supplying an existing `gameKey` resumes that world. `AdventureClient` initializes the durable world, imports the opening cover into the shared image service, and provisions the native player, builder, artist and participant seats requested by the world. Importing a cover does not generate a new image. The artist can subsequently edit it as an ordinary reference asset.

The world owns persistence, participant decisions, simulation and art jobs. The panel polls its player-scoped view, displays canonical assets with `GeneratedImage`, and submits free-form intentions with a stable request ID. A lost response can be retried without duplicating the intention. A world error leaves its pending turn available through “Resume the story.” Closing the panel does not discard the campaign.

Panels using the complete shell declare the adventure, channel and images service requests, and the native participant-creation authority. The three example panel manifests are complete consumers. Packages remain framework peers: the enclosing panel supplies React.
