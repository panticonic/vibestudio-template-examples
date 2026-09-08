import { AdventurePanel } from "@workspace/adventure-ui";
import { missingCountry, campaigns } from "@workspace/adventure-campaigns";
import cover from "./assets/cover.png";

export default function Adventure() {
  return (
    <AdventurePanel
      campaign={missingCountry}
      theme="embassy"
      cover={cover}
      campaigns={campaigns.map(({ id, title }) => ({ id, title, source: `panels/${id}` }))}
    />
  );
}
