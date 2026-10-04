import { Type } from "@panticonic/pi-ai";
import {
  copyJson,
  type Context,
  type JsonValue,
  type JsonRepresentation,
} from "@panticonic/pi-chord";
import {
  defineDoc,
  type ToolExecutionApi,
  type EntryId,
  type ToolRegistration,
} from "@panticonic/pi-durable";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import type {
  ImagesClient,
  ImageAsset,
  ImageGenerationRequest,
} from "@workspace/runtime/images";

interface Binding {
  operationId: string;
  call: <T = unknown>(method: string, input?: unknown) => Promise<T>;
  images: ImagesClient;
}
type SceneReference = {
  key: string;
  name: string;
  kind: "place" | "portrait";
  prompt: string;
  asset?: ImageAsset;
  previousAsset?: ImageAsset;
  jobId?: string;
};
type OriginalScene = {
  pending: { id: string; phase: string } | null;
  view: { location: { id: string } };
  artDirection: string;
  imageJob?: { id: string };
  artwork: Record<string, ImageAsset>;
  references: SceneReference[];
};
type IllustrationReceipt = {
  input: { asset?: ImageAsset; key?: string; error?: string };
  result: { ok: true };
};
type OwnedImages = {
  original: JsonValue | null;
  failurePublication: { entryId: EntryId; text: string } | null;
  jobs: Record<
    string,
    {
      recipe: JsonRepresentation<ImageGenerationRequest> | null;
      id: string | null;
      forgotten: boolean;
      referenceKey: string | null;
    }
  >;
  assets: Record<
    string,
    {
      asset: JsonRepresentation<ImageAsset>;
      owner: string;
      purpose: "artwork" | "reference";
      key: string | null;
      released: boolean;
    }
  >;
  cleanup: Record<
    string,
    | { kind: "forget"; id: string }
    | { kind: "release"; assetId: string; owner: string }
  >;
};
/** Actual provider admissions and cleanup acknowledgements, owned solely by this native ToolTask. */
const Owned = defineDoc<OwnedImages>({
  kind: "examples.adventure-owned-images",
  version: 1,
  scope: "task",
  initial: () => ({
    original: null,
    failurePublication: null,
    jobs: {},
    assets: {},
    cleanup: {},
  }),
  checkpointWhen: () => true,
});
const schema = Type.Object(
  { turnId: Type.String(), prompt: Type.String() },
  { additionalProperties: false },
);
function allFailures(
  results: PromiseSettledResult<unknown>[],
  message: string,
): void {
  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);
  if (failures.length === 1) throw failures[0];
  if (failures.length)
    throw new AggregateError(failures, message, { cause: failures[0] });
}
export function adventureSceneTool(
  gameKey: string,
  binding: Binding | undefined,
): ToolRegistration<typeof schema> {
  function requireBinding() {
    if (!binding?.operationId)
      throw new Error("Scene tooling is not bound to its native invocation");
    return binding;
  }
  async function owned(
    api: ToolExecutionApi,
    context: Context,
  ): Promise<Readonly<OwnedImages>> {
    const state = await api.snapshot(Owned, api.taskId, context);
    if (!state?.original)
      throw new Error(
        "Scene continuation lost its original native resource ownership",
      );
    return state;
  }
  async function cleanup(
    api: ToolExecutionApi,
    context: Context,
    turnId: string,
  ): Promise<void> {
    const { images, call } = requireBinding();
    const state = await owned(api, context);
    allFailures(
      await Promise.allSettled(
        Object.entries(state.cleanup).map(async ([key, item]) => {
          if (item.kind === "forget") {
            const jobs = Object.values(state.jobs)
              .filter((job) => job.id === item.id)
              .map((job) => ({
                jobId: item.id,
                referenceKey: job.referenceKey,
              }));
            if (jobs.length)
              await call("withdrawIllustrationJobs", { turnId, jobs });
            await images.forgetJob(item.id);
          } else
            await images.release({ assetId: item.assetId, owner: item.owner });
          await api.commit(async (tx) => {
            const current = await tx.doc(Owned, api.taskId);
            delete current.cleanup[key];
            if (item.kind === "forget")
              for (const job of Object.values(current.jobs))
                if (job.id === item.id) job.forgotten = true;
            if (item.kind === "release")
              for (const asset of Object.values(current.assets))
                if (
                  asset.asset.id === item.assetId &&
                  asset.owner === item.owner
                )
                  asset.released = true;
          }, context);
        }),
      ),
      "Scene resource cleanup failed",
    );
  }
  async function receipt(
    turnId: string,
    purpose: "artwork" | "reference" | "error",
    key?: string,
  ) {
    const bound = requireBinding();
    return bound.call<IllustrationReceipt | null>("illustrationPublication", {
      operationId: bound.operationId,
      turnId,
      purpose,
      ...(key ? { key } : {}),
    });
  }
  /** Reconstruct the remaining retirement intent from the original native admissions after world acceptance lost its reply. */
  async function prepareAcceptedCleanup(
    api: ToolExecutionApi,
    context: Context,
    referenceKey: string | null,
    asset: ImageAsset,
    owner: string,
    previousAsset: ImageAsset | undefined,
  ): Promise<void> {
    await api.commit(async (tx) => {
      const state = await tx.doc(Owned, api.taskId);
      for (const job of Object.values(state.jobs)) {
        if (job.referenceKey !== referenceKey || job.forgotten) continue;
        if (!job.id)
          throw new Error(
            "Accepted illustration lost its original provider admission",
          );
        state.cleanup[`forget:${job.id}`] = { kind: "forget", id: job.id };
      }
      if (previousAsset && previousAsset.id !== asset.id)
        state.cleanup[`release:${owner}:${previousAsset.id}`] = {
          kind: "release",
          assetId: previousAsset.id,
          owner,
        };
    }, context);
  }
  async function worldCall<T = unknown>(
    method: string,
    input?: Record<string, unknown>,
  ): Promise<T> {
    const bound = requireBinding();
    return bound.call<T>(
      method,
      method === "publishArtwork" || method === "publishReference"
        ? { ...input, operationId: input?.["operationId"] ?? bound.operationId }
        : input,
    );
  }
  async function execute(
    p: { turnId: string; prompt: string },
    api: ToolExecutionApi,
    context: Context,
  ) {
    const bound = requireBinding();
    context.abortSignal?.throwIfAborted();
    let original: OriginalScene;
    if (api.continuation === undefined) {
      original = await bound.call<OriginalScene>("perspective");
      if (
        original.pending?.id !== p.turnId ||
        original.pending.phase !== "artist"
      )
        throw new Error("No scene is awaiting you");
      await api.retainContinuation(
        {
          kind: "examples.adventure-scene",
          gameKey,
          operationId: bound.operationId,
          turnId: p.turnId,
        },
        async (tx) => {
          const state = await tx.doc(Owned, api.taskId);
          state.original = copyJson(original, {
            omitUndefinedProperties: true,
          }) as JsonValue;
          const jobs = [
            { id: original.imageJob?.id, referenceKey: null },
            ...original.references.map((ref) => ({
              id: ref.jobId,
              referenceKey: ref.key,
            })),
          ];
          for (const job of jobs)
            if (job.id)
              state.jobs[`existing:${job.id}`] = {
                recipe: null,
                id: job.id,
                forgotten: false,
                referenceKey: job.referenceKey,
              };
        },
        context,
      );
    } else {
      const marker = api.continuation;
      if (
        !marker ||
        typeof marker !== "object" ||
        Array.isArray(marker) ||
        marker["kind"] !== "examples.adventure-scene" ||
        marker["gameKey"] !== gameKey ||
        marker["operationId"] !== bound.operationId ||
        marker["turnId"] !== p.turnId
      )
        throw new Error(
          "Scene continuation changed its original native operation",
        );
      original = (await owned(api, context))
        .original as unknown as OriginalScene;
    }
    const previous = await receipt(p.turnId, "artwork");
    if (previous?.input?.asset) {
      // Acceptance protects the asset; the same original publication also owns any successor delivery debt.
      await worldCall("publishArtwork", {
        turnId: p.turnId,
        asset: previous.input.asset,
      });
      const placeId = original.view.location.id;
      await prepareAcceptedCleanup(
        api,
        context,
        null,
        previous.input.asset,
        `adventure:${gameKey}:${placeId}`,
        original.artwork[placeId],
      );
      await cleanup(api, context, p.turnId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ asset: previous.input.asset }),
          },
        ],
        details: copyJson(
          { asset: previous.input.asset },
          { omitUndefinedProperties: true },
        ),
        control: { terminate: true as const },
      };
    }
    const requestId = async (referenceKey: string | null): Promise<string> => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          canonicalJson({
            gameKey,
            turnId: p.turnId,
            operationId: bound.operationId,
            referenceKey,
          }),
        ),
      );
      return `adventure:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    };
    const track = async (
      request: ImageGenerationRequest,
      referenceKey: string | null = null,
    ) => {
      await api.commit(async (tx) => {
        const state = await tx.doc(Owned, api.taskId),
          prior = state.jobs[request.requestId];
        if (
          prior?.recipe &&
          (canonicalJson(prior.recipe) !== canonicalJson(request) ||
            prior.referenceKey !== referenceKey)
        )
          throw new Error("Image admission changed its original native recipe");
        if (!prior)
          state.jobs[request.requestId] = {
            recipe: copyJson(request, {
              omitUndefinedProperties: true,
            }) as JsonRepresentation<ImageGenerationRequest>,
            id: null,
            forgotten: false,
            referenceKey,
          };
      }, context);
      const state = await owned(api, context),
        prior = state.jobs[request.requestId]!;
      if (prior.id) return bound.images.getJob(prior.id);
      const job = await bound.images.generate(prior.recipe!);
      await api.commit(async (tx) => {
        (await tx.doc(Owned, api.taskId)).jobs[request.requestId]!.id = job.id;
      }, context);
      return job;
    };
    const forget = async (id: string) => {
      await api.commit(async (tx) => {
        (await tx.doc(Owned, api.taskId)).cleanup[`forget:${id}`] = {
          kind: "forget",
          id,
        };
      }, context);
      await cleanup(api, context, p.turnId);
    };
    const release = async (input: { assetId: string; owner: string }) => {
      await api.commit(async (tx) => {
        (await tx.doc(Owned, api.taskId)).cleanup[
          `release:${input.owner}:${input.assetId}`
        ] = { kind: "release", ...input };
      }, context);
      await cleanup(api, context, p.turnId);
    };
    const retain = async (
      input: { assetId: string; owner: string },
      asset: ImageAsset,
      purpose: "artwork" | "reference",
      key: string | null,
    ) => {
      await api.commit(async (tx) => {
        (await tx.doc(Owned, api.taskId)).assets[
          `${input.owner}:${input.assetId}`
        ] = {
          asset: copyJson(asset, {
            omitUndefinedProperties: true,
          }) as JsonRepresentation<ImageAsset>,
          owner: input.owner,
          purpose,
          key,
          released: false,
        };
      }, context);
      await bound.images.retain(input);
    };
    const images = {
      ...bound.images,
      generate: track,
      forgetJob: forget,
      release,
      wait: (id: string) =>
        bound.images.wait(id, { signal: context.abortSignal }),
    };
    const state = original,
      placeId = state.view.location.id;
    try {
      let job;
      if (state.imageJob) {
        job = await images.getJob(state.imageJob.id);
        if (job.status === "failed" || job.status === "cancelled")
          job = await images.retry(job.id);
      } else {
        const prepared = await Promise.allSettled(
          state.references.map(async (ref) => {
            if (ref.asset) return ref.asset;
            const accepted = await receipt(p.turnId, "reference", ref.key);
            if (accepted?.input?.asset) {
              await prepareAcceptedCleanup(
                api,
                context,
                ref.key,
                accepted.input.asset,
                `adventure:${gameKey}:reference:${ref.key}`,
                ref.previousAsset,
              );
              await cleanup(api, context, p.turnId);
              return accepted.input.asset;
            }
            let referenceJob = ref.jobId
              ? await images.getJob(ref.jobId)
              : undefined;
            if (!referenceJob) {
              referenceJob = await images.generate(
                {
                  requestId: await requestId(ref.key),
                  prompt: ref.prompt,
                  references: [],
                  size: ref.kind === "portrait" ? "1024x1024" : "1536x1024",
                },
                ref.key,
              );
              await worldCall("setReferenceJob", {
                turnId: p.turnId,
                key: ref.key,
                jobId: referenceJob.id,
              });
            }
            if (
              referenceJob.status === "failed" ||
              referenceJob.status === "cancelled"
            )
              referenceJob = await images.retry(referenceJob.id);
            const done = await images.wait(referenceJob.id);
            if (done.status !== "succeeded" || !done.asset)
              throw new Error(
                done.error ??
                  `The reference for ${ref.name} could not be painted`,
              );
            const owner = `adventure:${gameKey}:reference:${ref.key}`;
            await retain(
              { assetId: done.asset.id, owner },
              done.asset,
              "reference",
              ref.key,
            );
            await worldCall("publishReference", {
              turnId: p.turnId,
              key: ref.key,
              asset: done.asset,
            });
            if (ref.previousAsset && ref.previousAsset.id !== done.asset.id)
              await images.release({ assetId: ref.previousAsset.id, owner });
            await images.forgetJob(done.id);
            return done.asset;
          }),
        );
        allFailures(prepared, "Independent scene reference preparation failed");
        const references = prepared.map((result) => {
          if (result.status !== "fulfilled")
            throw new Error("Missing joined reference");
          return result.value as ImageAsset;
        });
        const referenceInstruction = state.references
          .map(
            (ref, index: number) =>
              `Image ${index + 1}: ${ref.key} — ${ref.name}. ${ref.kind === "portrait" ? "Use only for this character's face, hair and build. Current scene facts determine clothing, props and action." : "Use only for this place's architecture and geography. Apply the current light and physical changes."}`,
          )
          .join("\n");
        job = await images.generate({
          requestId: await requestId(null),
          prompt:
            state.artDirection +
            "\n\nREFERENCE IDENTITIES:\n" +
            referenceInstruction +
            "\n\nAUTHORITATIVE VISIBLE SCENE:\n" +
            JSON.stringify(state.view) +
            "\nShow only the named visible people, each with their own portrait identity. Do not depict the first-person player or invent extra people.\n\nCOMPOSITION:\n" +
            p.prompt,
          references,
          size: "1536x1024",
        });
        await worldCall("setImageJob", {
          turnId: p.turnId,
          jobId: job.id,
          placeId,
        });
      }
      const done = await images.wait(job.id);
      if (done.status !== "succeeded" || !done.asset)
        throw new Error(done.error ?? "The scene could not be painted");
      const owner = `adventure:${gameKey}:${placeId}`;
      await retain(
        { assetId: done.asset.id, owner },
        done.asset,
        "artwork",
        null,
      );
      await worldCall("publishArtwork", {
        turnId: p.turnId,
        asset: done.asset,
      });
      const previousAsset = state.artwork[placeId];
      if (previousAsset && previousAsset.id !== done.asset.id)
        await images.release({ assetId: previousAsset.id, owner });
      await images.forgetJob(done.id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ asset: done.asset }),
          },
        ],
        details: copyJson(
          { asset: done.asset },
          { omitUndefinedProperties: true },
        ),
        control: { terminate: true as const },
      };
    } catch (error) {
      if (!context.abortSignal?.aborted) {
        try {
          if (!(await receipt(p.turnId, "artwork"))?.input?.asset) {
            const text = String(error);
            let failure = (await owned(api, context)).failurePublication;
            if (!failure || failure.text !== text)
              failure = await api.commit(async (tx) => {
                const entry = await tx.appendEntry(api.conversationId, {
                  kind: "examples.scene-failure-notification",
                  data: { originalOperationId: bound.operationId, error: text },
                });
                const notification = { entryId: entry.id, text };
                (await tx.doc(Owned, api.taskId)).failurePublication =
                  notification;
                return notification;
              }, context);
            await worldCall("publishArtwork", {
              turnId: p.turnId,
              error: text,
              operationId: `${bound.operationId}:failure:${failure.entryId}`,
            });
          }
        } catch (publicationError) {
          throw new AggregateError(
            [error, publicationError],
            "Scene failed and its domain failure could not be published",
            { cause: error },
          );
        }
      }
      throw error;
    }
  }
  async function cancel(
    p: { turnId: string; prompt: string },
    api: ToolExecutionApi,
    context: Context,
  ) {
    if (api.continuation === undefined)
      return {
        content: [
          {
            type: "text" as const,
            text: "Scene cancelled before resource admission.",
          },
        ],
      };
    const bound = requireBinding(),
      state = await owned(api, context);
    const results = await Promise.allSettled(
      Object.entries(state.jobs).map(async ([key, ownedJob]) => {
        if (ownedJob.forgotten) return;
        let id = ownedJob.id;
        if (!id) {
          if (!ownedJob.recipe)
            throw new Error("Uncertain image admission lost its recipe");
          id = (await bound.images.generate(ownedJob.recipe)).id;
          await api.commit(async (tx) => {
            (await tx.doc(Owned, api.taskId)).jobs[key]!.id = id;
          }, context);
        }
        const job = await bound.images.getJob(id);
        if (job.status === "running" || job.status === "queued")
          await bound.images.cancel(id);
        const terminal = await bound.images.wait(id, {
          signal: context.abortSignal,
        });
        if (terminal.status === "running" || terminal.status === "queued")
          throw new Error("Image cancellation did not join its canonical job");
        await api.commit(async (tx) => {
          (await tx.doc(Owned, api.taskId)).cleanup[`forget:${id}`] = {
            kind: "forget",
            id: id!,
          };
        }, context);
      }),
    );

    const assets = await owned(api, context);
    const released = await Promise.allSettled(
      Object.entries(assets.assets).map(async ([key, item]) => {
        if (item.released) return;
        const published = await receipt(
          p.turnId,
          item.purpose,
          item.key ?? undefined,
        );
        if (
          published?.input?.asset?.id === item.asset.id &&
          published.input.asset.digest === item.asset.digest
        ) {
          const original = assets.original as unknown as OriginalScene;
          if (item.purpose === "artwork") {
            await worldCall("publishArtwork", {
              turnId: p.turnId,
              asset: published.input.asset,
            });
            const placeId = original.view.location.id;
            await prepareAcceptedCleanup(
              api,
              context,
              null,
              published.input.asset,
              item.owner,
              original.artwork[placeId],
            );
          } else {
            const ref = original.references.find((ref) => ref.key === item.key);
            await prepareAcceptedCleanup(
              api,
              context,
              item.key,
              published.input.asset,
              item.owner,
              ref?.previousAsset,
            );
          }
          return;
        }
        await api.commit(async (tx) => {
          (await tx.doc(Owned, api.taskId)).cleanup[`release:${key}`] = {
            kind: "release",
            assetId: item.asset.id,
            owner: item.owner,
          };
        }, context);
      }),
    );
    const cleaned = await Promise.allSettled([cleanup(api, context, p.turnId)]);
    allFailures(
      [...results, ...released, ...cleaned],
      "Scene cancellation failed to join owned resources",
    );
    return {
      content: [
        {
          type: "text" as const,
          text: "Owned scene generation cancelled and joined.",
        },
      ],
    };
  }
  return {
    name: "paint_scene",
    description:
      "Generate the current scene with retained native image admissions and joined cleanup. Resume original jobs after interruption.",
    parameters: schema,
    replay: "safe",
    execute,
    cancel,
  };
}
