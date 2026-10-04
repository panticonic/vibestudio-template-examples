import { Type } from "@panticonic/pi-ai";
import type { ToolRegistration } from "@panticonic/pi-durable";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";

const schema = Type.Object(
  {
    name: Type.String({
      pattern: "^[a-z0-9-]{1,48}$",
      description: "Short lowercase asset name.",
    }),
    prompt: Type.String(),
    references: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);
/** The caller binds the world and invocation once; retries retain the same artifact identity. */
export function imageTool(
  native: ToolRegistration,
  call: (method: string, input?: unknown) => Promise<any>,
  game: string,
  commandId: () => string,
): ToolRegistration<typeof schema> {
  return {
    name: "make_image",
    description:
      "Generate a reusable storybook image using the workspace's native imagegen. Use for a memorable place, portrait or artifact, not every reply. Supply existing asset ids as references for continuity. Returns an asset id for scene.assets and art.image.",
    parameters: schema,
    execute: async (raw, api, context) => {
      context.abortSignal?.throwIfAborted();
      if (!/^[a-z0-9-]{1,48}$/.test(raw.name))
        throw new Error("Use a short lowercase asset name.");
      const originalCommand = commandId();
      if (!originalCommand)
        throw new Error(
          "Artwork requires its actual native invocation identity",
        );
      const catalog = await call("artCatalog");
      const refs = (raw.references ?? []).map((id) => {
        if (!catalog[id]) throw new Error("Unknown reference image.");
        return catalog[id].path;
      });
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          canonicalJson({ game, commandId: originalCommand }),
        ),
      );
      const suffix = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      )
        .join("")
        .slice(0, 16);
      const id = `${raw.name}-${suffix}`,
        path = `panels/${game}/assets/generated/${id}.png`;
      const result = await native.execute(
        {
          prompt: raw.prompt,
          outputPath: path,
          referencePaths: refs,
          size: "1536x1024",
          quality: "medium",
          outputFormat: "png",
          createOnly: true,
        },
        api,
        context,
      );
      if ("wait" in result || result.isError) return result;
      const image = result.content?.find((part) => part.type === "image");
      if (!image || image.type !== "image")
        throw new Error("Image generation did not return an image.");
      await call("storeArt", {
        id,
        path,
        data: image.data,
        mimeType: image.mimeType,
      });
      return {
        content: [
          {
            type: "text",
            text: `Saved artwork ${id}. Include it in scene.assets and draw with art.image(${JSON.stringify(id)},x,y,width,height).`,
          },
          { type: "image", data: image.data, mimeType: image.mimeType },
        ],
        details: { id, path },
      };
    },
  };
}
