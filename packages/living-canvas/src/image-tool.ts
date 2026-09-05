import type { AgentTool } from "@workspace/pi-core";
export function imageTool(
  native: AgentTool,
  call: (method: string, input?: unknown) => Promise<any>,
  game: string,
): AgentTool {
  return {
    name: "make_image",
    label: "Paint a discovery",
    description:
      "Generate a reusable storybook image using the workspace's native imagegen. Use for a memorable place, portrait or artifact, not every reply. Supply existing asset ids as references for continuity. Returns an asset id for scene.assets and art.image.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short lowercase asset name." },
        prompt: { type: "string" },
        references: { type: "array", items: { type: "string" } },
      },
      required: ["name", "prompt"],
      additionalProperties: false,
    } as never,
    execute: async (toolId, raw: any, signal, onUpdate) => {
      if (!/^[a-z0-9-]{1,48}$/.test(raw.name))
        throw new Error("Use a short lowercase asset name.");
      const catalog = await call("artCatalog");
      const refs = (raw.references ?? []).map((id: string) => {
        if (!catalog[id]) throw new Error("Unknown reference image.");
        return catalog[id].path;
      });
      const id = raw.name + "-" + crypto.randomUUID().slice(0, 8),
        path = `panels/${game}/assets/generated/${id}.png`;
      const result = await native.execute(
        toolId,
        {
          prompt: raw.prompt,
          outputPath: path,
          referencePaths: refs,
          size: "1536x1024",
          quality: "medium",
          outputFormat: "png",
          createOnly: true,
        },
        signal,
        onUpdate,
      );
      if (result.isError) return result;
      const image = result.content.find(
        (part: any) => part.type === "image",
      ) as { data: string; mimeType: string } | undefined;
      if (!image) throw new Error("Image generation did not return an image.");
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
