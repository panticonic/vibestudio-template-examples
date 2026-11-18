import { fileURLToPath } from "node:url";
import { workspaceProgramFailures } from "@workspace/natlang/testing";
import { expect, it } from "vitest";

it("checks the Examples Natlang hierarchy and compiled callable signatures", async () => {
  const workspace = fileURLToPath(new URL("../..", import.meta.url));
  expect(await workspaceProgramFailures(workspace)).toEqual([]);
});
