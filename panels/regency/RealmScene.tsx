import type { Game } from "@workspace/regency-engine";
import type { Interaction } from "@workspace/living-canvas/interactions";
import { SceneInteraction } from "@workspace/living-canvas/interactions/react";
import { regencyArtwork } from "./artwork.js";
import type { Artworks } from "@workspace/living-canvas";
import { Kingdom } from "./Kingdom.js";

export function RealmScene({ game, busy, onIntent, artworks }: {game: Game; busy: boolean; onIntent: (text: string) => void; artworks?: Artworks}) {
  const place = game.world.places.find(p => p.id === game.world.location)!;
  const plate = regencyArtwork.places[place.id];
  const image = game.turn === 0 && place.id === "council" ? regencyArtwork.opening : plate;
  const people = game.people.filter(p => p.place === place.id);
  return <section className="realm-scene" aria-label={place.name}>
    {place.scene ? <Kingdom key={place.id} scene={place.scene} world={game.world} artworks={artworks} busy={busy} onRepair={error => onIntent("Repair this place's illustration without changing policy or time. Drawing feedback: " + error.slice(0,250))} /> : image && <img className="realm-scene-art" src={image} alt={place.description} />}
    <div className="realm-scene-introduction"><span className="eyebrow">{game.world.time} · {place.name}</span>
      <h1>{game.turn === 0 ? game.title : place.name}</h1><p>{place.description}</p>
    </div>
    <div className="realm-cast">{people.map(person => <button key={person.id} disabled={busy} onClick={() => onIntent(person.name + ", what concerns you most here?")}>
      {regencyArtwork.people[person.id] && <img src={regencyArtwork.people[person.id]} alt="" />}<span>{person.name}<small>{person.role}</small></span>
    </button>)}</div>
    <SceneInteraction key={place.id} document={place.interaction ?? briefing(game)} busy={busy} onIntent={onIntent} />
    <details className="realm-evidence"><summary>Go somewhere · known places and beyond</summary>
      <nav className="realm-travel">{game.world.places.filter(p => p.id !== place.id).map(p => <button key={p.id} disabled={busy} onClick={() => onIntent("Take me to " + p.name + ". I want to meet people there and see the situation for myself.")}>{p.name} ↗</button>)}</nav>
      <p>The known map is not the edge of the world. Describe a place or person you want to seek in the conversation.</p>
    </details>
  </section>;
}
function briefing(game: Game): Interaction {
  const world = game.world, place = world.places.find(p => p.id === world.location)!;
  const region = world.economy.regions.find(r => r.id === place.id);
  if (world.location !== "council") return {
    title: "Here, on the ground",
    sections: [{ id: "encounter", title: "Look past the report", body: region ? region.character : place.description,
      actions:[{label:"Meet someone who lives here", intent:"Introduce me to someone who lives or works here. Let me hear their own concerns, not just a council report."},{label:"Explore this place",intent:"Explore this place beyond what the official report describes."}]},
      {id:"details",title:"Reports and particulars",body:place.facts.join("\n\n"),folded:true}],
  };
  const threatened = [...world.economy.neighbors].sort((a,b)=>b.tension-a.tension)[0];
  const fragile = [...world.economy.regions].sort((a,b)=>a.confidence-b.confidence)[0]!;
  return {title:"The questions before the crown", introduction:"Set direction. Ask your advisors to work out the means. No proposal is enacted until you approve it.",sections:[
    {id:"people",title:"Who can afford to wait?",body:fragile.character,actions:[{label:"Hear the people affected",intent:"Mara, arrange for me to hear people from " + fragile.name + " directly. What matters to them beyond our immediate policy?"}]},
    {id:"independence",title:"What is ours to decide?",body:threatened ? threatened.name + ": " + threatened.demand : "Trade, alliances and obligations can expand the realm's choices or narrow them.",actions:[{label:"Discuss our position",intent:"Sera, what strategic choices preserve our independence without wasting lives? Explain the other side’s interests too."}]},
    {id:"mandate",title:"Give your council a direction",body:"Name the outcome you want and the limits you will not cross. Your advisors can prepare an executable plan and a comparison with doing nothing.",fields:[{id:"priority",label:"Our priority"},{id:"limits",label:"Limits and commitments"}],actions:[{label:"Request a plan · not a decree",intent:"Mara, prepare a proposed plan prioritizing {priority}, respecting these limits: {limits}. Handle operational details and explain strategic tradeoffs. Do not enact it."}]},
    {id:"evidence",title:"Open the ledgers and dispatches",folded:true,body:[...world.ledger.map(x=>`${x.label}: ${x.amount} ${x.unit}. ${x.context}`),...world.economy.forces.map(f=>`${f.name}: ${f.strength} companies, ${f.readiness}% readiness, ${f.posture}.`),...world.economy.factions.map(f=>`${f.name}: support ${f.support}/100. ${f.grievance}`),...world.economy.neighbors.map(n=>`${n.name}: tension ${n.tension}/100, treaty ${n.treaty}. ${n.leverage}`)].join("\n\n").slice(0,1600)},
  ]};
}
