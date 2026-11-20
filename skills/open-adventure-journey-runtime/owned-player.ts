import type { Campaign, ServiceView } from "@workspace/adventure-engine";
import { contextId as currentContextId, openPanel, vcs } from "@workspace/runtime";

type TurnInput = { id: string; text: string };
type OwnedJourney = { id: string; campaign: Campaign };

export function adventurePlayerFixture(journeys: OwnedJourney[]) {
  return `import { AdventureClient } from "@workspace/adventure-ui";
const clients = new Map(${JSON.stringify(journeys)}.map(({id, campaign}) => [id, new AdventureClient(id, campaign)]));
const player = (id) => {
  const client = clients.get(id);
  if (!client) throw new Error("Adventure journey belongs to another player fixture");
  return client;
};
Object.defineProperty(window, "__ownedAdventurePlayer", { value: Object.freeze({
  start: (id) => player(id).get(),
  play: (id, input) => player(id).play(input.id, input.text),
  cancel: (id) => player(id).cancel(),
}) });
export default function OwnedAdventurePlayer() {
  return <main data-owned-adventure-player="ready" />;
}
`;
}

/** The browser runtime supplies the same authenticated player identity as an installed Adventure panel. */
export async function openOwnedAdventurePlayer(contextId: string, campaign: string, journeys: OwnedJourney[]) {
  if (!contextId || contextId !== currentContextId || !["dead-letter-office", "missing-country", "wandering-house"].includes(campaign) ||
      !journeys.length || journeys.some(({ id, campaign: seed }) => !/^natlang-adventure-[0-9a-f-]{36}$/u.test(id) || seed.id !== campaign))
    throw new Error("Select an owned campaign panel and assigned journeys");
  const source = "panels/" + campaign;
  const { workingHead } = await vcs.status({ contextId });
  const repository = await vcs.resolveRepository({ state: workingHead, repoPath: source });
  if (!repository) throw new Error("The assigned Adventure player panel is unavailable");
  const entry = await vcs.readFile({
    state: workingHead, repositoryId: repository.repositoryId, file: { kind: "path", path: "index.tsx" },
  });
  if (entry?.content.kind !== "text") throw new Error("Expected the installed Adventure player entry");
  const changed = await vcs.edit({
    contextId, expectedWorkingHead: workingHead, commandId: crypto.randomUUID(),
    intentSummary: "Open the isolated Adventure player fixture",
    changes: [{
      kind: "text-edit", repositoryId: repository.repositoryId, fileId: entry.fileId,
      edits: [{ start: 0, end: entry.content.text.length, text: adventurePlayerFixture(journeys) }],
    }],
  });
  if (!changed.changeIds.length) throw new Error("The owned campaign entry did not change");
  const panel = await openPanel(source, { contextId, ref: `ctx:${contextId}`, focus: false, parentId: null });
  let session: Awaited<ReturnType<typeof panel.cdp.session>> | undefined;
  async function close() {
    try { await session?.page.close(); }
    finally { await panel.archive(); }
  }
  try {
    const identity = await panel.observe();
    if (identity.contextId !== contextId || identity.source !== source || identity.requestedRef !== `ctx:${contextId}`)
      throw new Error("The player runtime belongs to another context or campaign");
    session = await panel.cdp.session();
    await session.page.waitForSelector('[data-owned-adventure-player="ready"]');
    const { page, receipt } = session;
    const ready = await panel.observe();
    if (!receipt || receipt.generation.panelId !== panel.id ||
        receipt.generation.attemptId !== ready.attemptId || receipt.generation.buildKey !== ready.buildKey)
      throw new Error("The player runtime has an unexpected panel generation");
    const allowed = new Set(journeys.map(({ id }) => id));
    async function perform(method: "start" | "play" | "cancel", id: string, input?: TurnInput) {
      if (!allowed.has(id)) throw new Error("Adventure journey is outside the assigned player runtime");
      const args = input ? [id, input] : [id];
      return page.evaluate<ServiceView>(`window.__ownedAdventurePlayer[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
    }
    return {
      start: (id: string) => perform("start", id),
      play: (id: string, input: TurnInput) => perform("play", id, input),
      cancel: (id: string) => perform("cancel", id),
      close,
    };
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Adventure player startup and cleanup failed"); }
    throw error;
  }
}
