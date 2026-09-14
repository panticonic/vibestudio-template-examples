import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const FieldSchema = z.object({
  id: text(40).regex(/^[a-z][a-z0-9_]*$/),
  label: text(100),
  options: z.array(text(100)).min(1).max(12).optional(),
}).strict();
/** Generated UI is a document, not authority: submitting expresses an intention. */
export const InteractionSchema = z.object({
  title: text(100),
  introduction: text(600).optional(),
  sections: z.array(z.object({
    id: text(60),
    title: text(100),
    body: text(1600),
    folded: z.boolean().optional(),
    fields: z.array(FieldSchema).max(4).optional(),
    actions: z.array(z.object({
      label: text(100),
      intent: text(400),
    }).strict()).max(6).optional(),
  }).strict()).min(1).max(10),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sections.map(s => s.id)).size !== value.sections.length)
    ctx.addIssue({ code: "custom", message: "Section IDs must be unique" });
  for (const section of value.sections) {
    const fields = section.fields ?? [];
    if (new Set(fields.map(f => f.id)).size !== fields.length)
      ctx.addIssue({ code: "custom", message: "Field IDs must be unique" });
    for (const action of section.actions ?? [])
      for (const match of action.intent.matchAll(/\{([a-z][a-z0-9_]*)\}/g))
        if (!fields.some(f => f.id === match[1]))
          ctx.addIssue({ code: "custom", message: "Every intent placeholder needs a field" });
  }
});
export type Interaction = z.infer<typeof InteractionSchema>;
export function interactionIntent(section: Interaction["sections"][number], index: number, values: Record<string, string>) {
  const action = section.actions?.[index];
  if (!action) throw new Error("Unknown scene action");
  const intent = action.intent.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, id: string) => {
    const field = section.fields?.find(f => f.id === id), value = values[id]?.trim();
    if (!field || !value || value.length > 160 || (field.options && !field.options.includes(value)))
      throw new Error("Complete “" + (field?.label ?? id) + "” first.");
    return value;
  });
  if (intent.length > 500) throw new Error("Keep your response under 500 characters.");
  return intent;
}
export const INTERACTION_GUIDE = `You may author a scene-specific interactive document: {title,introduction?,sections:[{id,title,body,folded?,fields?:[{id,label,options?}],actions?:[{label,intent}]}]}. Compose evidence dossiers, instruments, conversations, petitions, dispatches or negotiating tables suited to this place. Fields without options are free text; an action intent may interpolate {field_id}. All action labels must honestly describe the resulting player intention. Use established public facts only, never secrets or invented outcomes. These controls submit intentions through the normal world engine; they cannot directly award results, change state, execute code or authorize a decree merely by inspection. Fold operational detail; keep the consequential question visible. Free conversation always remains available. Omit controls that are not useful here; do not turn every scene into a questionnaire.`;
