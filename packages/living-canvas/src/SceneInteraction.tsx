import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { InteractionSchema, interactionIntent, type Interaction } from "./interactions.js";
import "./interactions.css";

export function SceneInteraction({ document, busy, onIntent }: {
  document: Interaction; busy: boolean; onIntent: (text: string) => void;
}) {
  const parsed = InteractionSchema.safeParse(document);
  if (!parsed.success) return <p role="status">This scene’s controls need repair. You can still describe your action below.</p>;
  return <section className="scene-interaction" aria-label={document.title}>
    <h2>{document.title}</h2>
    {document.introduction && <ReactMarkdown skipHtml>{document.introduction}</ReactMarkdown>}
    <div className="scene-interaction-sections">{parsed.data.sections.map(section =>
      <InteractionSection key={JSON.stringify(section)} section={section} busy={busy} onIntent={onIntent} />
    )}</div>
  </section>;
}
function InteractionSection({ section, busy, onIntent }: {
  section: Interaction["sections"][number]; busy: boolean; onIntent: (text: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const body = <>
    <ReactMarkdown skipHtml>{section.body}</ReactMarkdown>
    {section.fields?.map(field => <label key={field.id}>{field.label}
      {field.options ? <select value={values[field.id] ?? ""} onChange={e => setValues({ ...values, [field.id]: e.target.value })}>
        <option value="">Choose…</option>{field.options.map(option => <option key={option}>{option}</option>)}
      </select> : <input maxLength={160} value={values[field.id] ?? ""} onChange={e => setValues({ ...values, [field.id]: e.target.value })} />}
    </label>)}
    <div className="scene-interaction-actions">{section.actions?.map((action, index) => <button key={index} disabled={busy} onClick={() => {
      try { const text = interactionIntent(section, index, values); setError(""); onIntent(text); }
      catch (error) { setError(String(error instanceof Error ? error.message : error)); }
    }}>{action.label} ↗</button>)}</div>
    {error && <p role="alert">{error}</p>}
  </>;
  return section.folded ? <details><summary>{section.title}</summary>{body}</details>
    : <article><h3>{section.title}</h3>{body}</article>;
}
