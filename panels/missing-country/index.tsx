import { AdventurePanel } from "@workspace/adventure-ui";
import { missingCountry } from "@workspace/adventure-campaigns";
import cover from "./assets/cover.png";

export default function Adventure() {
  return <AdventurePanel campaign={missingCountry} theme="embassy" cover={cover} />;
}
