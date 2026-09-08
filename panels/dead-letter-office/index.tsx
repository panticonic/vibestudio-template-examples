import { AdventurePanel } from "@workspace/adventure-ui";
import { deadLetterOffice, campaigns } from "@workspace/adventure-campaigns";
import cover from "./assets/cover.png";

export default function Adventure() {
  return (
    <AdventurePanel
      campaign={deadLetterOffice}
      theme="letters"
      cover={cover}
      campaigns={campaigns.map(({ id, title }) => ({ id, title, source: `panels/${id}` }))}
    />
  );
}
