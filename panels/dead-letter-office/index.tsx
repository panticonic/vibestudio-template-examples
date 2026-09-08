import { AdventurePanel } from "@workspace/adventure-ui";
import { deadLetterOffice } from "@workspace/adventure-campaigns";
import cover from "./assets/cover.png";

export default function Adventure() {
  return <AdventurePanel campaign={deadLetterOffice} theme="letters" cover={cover} />;
}
