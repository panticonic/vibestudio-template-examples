import { AdventurePanel } from "@workspace/adventure-ui";
import { missingCountry, campaigns } from "@workspace/adventure-campaigns";
import { artwork } from "./artwork.js";

export default function Adventure() {
  return (
    <AdventurePanel
      campaign={missingCountry}
      theme="embassy"
      cover={artwork.opening}
      artwork={artwork}
      campaigns={campaigns.map(({ id, title }) => ({ id, title, source: `panels/${id}` }))}
    />
  );
}
