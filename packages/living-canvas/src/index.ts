import { z } from "zod";
import { parse } from "acorn";
export { ART_LIBRARY, ART_GUIDE } from "./art.js";
export { sceneDocument } from "./runtime.js";
export const SceneSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(40000)
      .describe(
        "Complete JavaScript body of paint(ctx, art, time, pointer, memory). Drawing coordinates are 1200 by 760.",
      ),
    annotations: z
      .array(
        z
          .object({
            label: z.string().min(1).max(80),
            detail: z.string().min(1).max(400),
            x: z.number().min(0).max(1200),
            y: z.number().min(0).max(760),
            kind: z.enum(["observed", "planned"]),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    assets: z.array(z.string().min(1).max(100)).max(6).optional(),
    description: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe(
        "Accessible description of what is drawn and its pointer interactions.",
      ),
  })
  .strict();
export type Scene = z.infer<typeof SceneSchema>;
export function validateScene(input: unknown): Scene {
  const scene = SceneSchema.parse(input);
  const ast = parse(
    `function paint(ctx, art, time, pointer, memory) {\n${scene.code}\n}`,
    { ecmaVersion: 2022 },
  );
  if (ast.body.length !== 1 || ast.body[0]?.type !== "FunctionDeclaration")
    throw new Error("Return only the body of the paint function.");
  return scene;
}

export type Artwork = { mimeType: "image/png"; data: string; path: string };
export type Artworks = Record<string, Artwork>;
