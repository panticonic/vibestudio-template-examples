import { AdventurePanel } from "@workspace/adventure-ui";
import { wanderingHouse } from "@workspace/adventure-campaigns";
import cover from "./assets/cover.png";

export default function Adventure() {
  return <AdventurePanel campaign={wanderingHouse} theme="house" cover={cover} />;
}
