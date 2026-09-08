import { AdventurePanel } from "@workspace/adventure-ui";
import { wanderingHouse, campaigns } from "@workspace/adventure-campaigns";
import cover from "./assets/cover.png";

export default function Adventure() {
  return (
    <AdventurePanel
      campaign={wanderingHouse}
      theme="house"
      cover={cover}
      campaigns={campaigns.map(({ id, title }) => ({ id, title, source: `panels/${id}` }))}
    />
  );
}
