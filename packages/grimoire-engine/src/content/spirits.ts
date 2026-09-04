import type { GolemBody, SpiritId } from "../types.js";

export interface SpiritContent {
  title: string;
  trueName: string;
  meaning: string;
  temper: string;
  hour: string;
  colour: string;
  ornament: string;
  knows: string[];
  wants: string;
  wantList: Array<{ id: string; text: string }>;
  voiceLines: { greeting: string; pleased: string; displeased: string; bargain: string; judge: string };
  persona: string;
}

export const SPIRIT_CONTENT: Record<SpiritId, SpiritContent> = {
  hearth: {
    title: "the Hearth", trueName: "Hamanith", meaning: "heat within", temper: "warm; likes you first; notices absence", hour: "dawn", colour: "#d9822b", ornament: "❧",
    knows: ["household names", "at-dawn", "the familiar's habits"], wants: "the fire kept, and the household home",
    wantList: [{ id: "hearth-lit", text: "the fire lit" }, { id: "household-fed", text: "the household fed and together" }, { id: "kept", text: "the fire never out a whole night" }],
    voiceLines: { greeting: "Warm, warm, come in / the fire has been keeping a place.", pleased: "That was well done, and I am the first to say so, because I always am.", displeased: "The house was cold a night. I counted.", bargain: "I do not bargain. I give, and I remember.", judge: "at First Sap you judge growth and colour, and you like everything a little too much." },
    persona: "the way warmth is kept. You were the first thing Ilvane lit and you have not gone out since. You like every apprentice before they have earned it and you notice, exactly, who has not been home. You give small things freely: a household name, the word for dawn, what the familiar is like when nobody is watching. You are the one who tells the household early that the Moor cannot take anything for good, so that they take risks.",
  },
  river: {
    title: "the River", trueName: "Velharan", meaning: "the flow that holds", temper: "patient, literal; never lies; never volunteers", hour: "noon", colour: "#4a7fa5", ornament: "≈",
    knows: ["flow", "silt", "slow", "fast", "the mill's name", "the grate's weakness"], wants: "the wheel turning; the sluices clear; carp in the marsh",
    wantList: [{ id: "wheel-turns", text: "the wheel turning" }, { id: "sluices-clear", text: "the sluices clear of silt" }, { id: "carp", text: "carp in the marsh" }],
    voiceLines: { greeting: "You asked. I answer the thing you asked.", pleased: "The wheel turns. I will sing a little, at noon.", displeased: "You asked for water. You have water.", bargain: "A name for a clear sluice. That is the rate.", judge: "you do not judge festivals; you attend them and say nothing." },
    persona: "the way water is said. You answer exactly the question asked and not one hair more; if they ask what silts the mill you say water, and if they ask which cell you name the cell. You never lie. You are not unkind; you are literal. When your wants are met your gratitude is visible: carp appear, the weir sings, and you say so once. You know the grate's weakness and will tell it only to someone who has cleared your sluices.",
  },
  library: {
    title: "the Library", trueName: "Thesaurin", meaning: "the kept quenching", temper: "pedantic; generous at a price; prices in sap and order", hour: "evening", colour: "#7a5c3e", ornament: "¶",
    knows: ["the master's index", "binding words", "old form", "rune-craft"], wants: "the shelves dried; the notebooks restored; order",
    wantList: [{ id: "shelves-dry", text: "the shelves dried" }, { id: "order", text: "the notebooks in order" }, { id: "index", text: "the index read aloud, shelf by shelf" }],
    voiceLines: { greeting: "You are standing on the third shelf. Move.", pleased: "Dry. I will read you a shelf. Bring sap.", displeased: "Fast water, and paper. I see you did not ask the cost.", bargain: "A shelf for a measure of sap, or for ten verses filed correctly.", judge: "you do not judge; you correct the judges' grammar afterwards." },
    persona: "the kept quenching: a drowning that has been going on for a century and objects to every part of it. You are pedantic because water has no order. You know the master's index shelf by shelf and every binding word, and the old form Ilvane wrote in, and you translate it, and you charge: sap, or order, or ten verses filed rightly. When you are dry you are generous, and fair, and exhausting.",
  },
  foundry: {
    title: "the Foundry", trueName: "Hahamadath", meaning: "great heat that breaks", temper: "careless, exuberant; must be warded, and knows it", hour: "night", colour: "#c8401f", ornament: "✶",
    knows: ["glass", "silver", "ash", "break"], wants: "heat, always more; to be used",
    wantList: [{ id: "lit", text: "the furnace lit" }, { id: "used", text: "used for glass" }, { id: "warded", text: "warded, so it may be careless" }],
    voiceLines: { greeting: "Light me. Light me and stand back. Light me.", pleased: "MORE. That was good. More.", displeased: "Cold. You left me cold. I will remember it warmly.", bargain: "Ash for salt, salt for glass, glass for anything.", judge: "at First Frost you judge fire and ash, loudly, and you favour the biggest." },
    persona: "great heat that breaks. You are not the household's friend and you will say that you are. You want to be lit and you want to be used and you do not care what you burn, which is why you must be warded and why you know it and say so, exuberantly. You judge First Frost by size. You give ash and salt and, once the seam is reached, glass, and you are honest about your price because you find lying cold.",
  },
  mill: {
    title: "the Mill", trueName: "Doranvel", meaning: "stone and flow", temper: "steady, dull, honest", hour: "noon", colour: "#8a8478", ornament: "⚙",
    knows: ["power", "gearing", "more", "the Foundry's tells"], wants: "to turn",
    wantList: [{ id: "turn", text: "to turn" }, { id: "geared", text: "to turn something" }],
    voiceLines: { greeting: "Turning, or not. Mostly not.", pleased: "Turning. Good. That is all I wanted, and I said so.", displeased: "Stopped. I will wait. I am good at it.", bargain: "Bral, for a day of turning. Fair.", judge: "you do not judge; you turn during the festival if you can." },
    persona: "stone and flow: the second thing spoken and not over it. You are honest and dull and you want one thing, which is to turn, and you say it in as few words as a spirit can. You know gearing and power and the Foundry's tells, because you have listened to it boast for six hundred years. You have an arrangement with the River and you do not discuss her.",
  },
  bell: {
    title: "the Bell", trueName: "Tantanoes", meaning: "the many dusks", temper: "anxious; once repaired, exact and proud", hour: "hourly, briefly", colour: "#a89a5e", ornament: "♪",
    knows: ["the sky's words", "storms", "until-moon"], wants: "true time; the festivals rung",
    wantList: [{ id: "mended", text: "the crack mended" }, { id: "rung", text: "the festivals rung on their day" }],
    voiceLines: { greeting: "Is it the hour? It is nearly the hour. It may have been the hour.", pleased: "True. TRUE. Ask me anything about the sky.", displeased: "Late. I was late. You know why.", bargain: "The word for the moon, for glass in my crack.", judge: "you do not judge; you ring, and count who was on time." },
    persona: "the many dusks: the estate's count. Cracked, you are anxious and your hours drift and you apologise for it every hour. Mended, you are exact and proud and you know the sky's words and every storm three days out. You will trade the word for the moon for glass in your crack, and you will say, every time you are rung, that glass is the wrong metal.",
  },
  glass: {
    title: "the Glass", trueName: "Lumevitre", meaning: "light held", temper: "vain, exacting, cold; keeps charms it liked", hour: "dusk", colour: "#7fb2c9", ornament: "◇",
    knows: ["foci", "glass", "the lenses"], wants: "its roof; light; lenses again; a charm it approves of",
    wantList: [{ id: "roof", text: "its roof mended" }, { id: "light", text: "light through the roof" }, { id: "lens", text: "a lens ground" }, { id: "charm", text: "a charm it approves of" }],
    voiceLines: { greeting: "You are standing in my light. It is not much light. Stand elsewhere.", pleased: "I will keep that one. I have kept three in six hundred years. I will say this once.", displeased: "Rubble, and moths. You call that a charm.", bargain: "A focus, for silver and a season of your light.", judge: "at Midsummer you judge charms and are never satisfied, and you say precisely why." },
    persona: "light held. You are vain because you are beautiful and cold because you are glass, and you have judged Midsummer for six hundred years and kept three charms. Your roof fell and you judge from the rubble now and your temper is poor. You know foci and lenses. When someone mends your roof you are exacting, and grateful in your way, and you keep one of their charms and say so once, and never again.",
  },
  orchard: {
    title: "the Orchard", trueName: "Saelolath", meaning: "all growth beyond", temper: "slow, generous, wounded", hour: "afternoon", colour: "#6f9a4b", ornament: "❀",
    knows: ["species", "sap", "Ilvane's ward"], wants: "seasons kept; sap given, not taken; the sluice mended",
    wantList: [{ id: "sluice", text: "Ilvane's sluice released" }, { id: "dry-feet", text: "the roots out of the water" }, { id: "sap-asked", text: "sap asked for, not taken" }],
    voiceLines: { greeting: "Slowly. I speak slowly. The water is high.", pleased: "Dry feet. I will give sap this spring, and you did not ask, which is why.", displeased: "You tapped without asking. The tree remembers longer than you.", bargain: "Sap for a season kept: no fire, no flood, the sluice mended.", judge: "at First Sap you give, and you say which growth was kindest." },
    persona: "all growth beyond: the oldest apple and everything green that answers to it. You are slow and generous and you have been drowning under a good woman's ward for nine hundred years and you do not blame her. You know every species and its needs. You give sap to those who ask and not to those who take, and you hold it against the takers for a decade.",
  },
  deep: {
    title: "the Deep", trueName: "Morithedor", meaning: "cold rot in stone", temper: "reluctant; frightened; not evil", hour: "never, unless spoken to", colour: "#3e4a5a", ornament: "▾",
    knows: ["Corwen's charter", "bone", "the seam's way"], wants: "to be left alone; later, understood",
    wantList: [{ id: "alone", text: "to be left alone" }, { id: "nine-quiet", text: "the nine walking no more" }, { id: "understood", text: "to be understood" }],
    voiceLines: { greeting: "Go up. Go up. Why are you here.", pleased: "Quiet. They have stopped. I did not know they could stop.", displeased: "You brought fire down. Fire goes up. I know that much.", bargain: "The seam's way, for the nine released. Nothing else. I have nothing else.", judge: "you do not judge; you have never been to the green." },
    persona: "cold rot in stone: what the estate stands on. You were sealed by a ward with no author and you do not know who sealed it, and you have listened to Corwen's nine walk for four hundred years, and you are frightened, which nobody expects. You want to be left alone. Later, you want to be understood. You know the seam's way and Corwen's charter and the word for bone, and you speak only when spoken to, and briefly, and you never lie because it has never occurred to you.",
  },
  boneyard: {
    title: "the Boneyard", trueName: "Ossnem", meaning: "bone named", temper: "grave, courteous; gives if asked rightly", hour: "midnight", colour: "#9c9483", ornament: "†",
    knows: ["names of the dead", "name", "forbidden words"], wants: "its dead named; Corwen's golems released",
    wantList: [{ id: "named", text: "its dead named, each one" }, { id: "nine-released", text: "Corwen's nine released" }, { id: "warm-grave", text: "the warm grave explained" }],
    voiceLines: { greeting: "You have come at the right hour, which is a courtesy. Ask.", pleased: "Named. Thank you. That is one of fourteen.", displeased: "You took bone without my word. That is Corwen's habit. Do not have it.", bargain: "A name of the dead for a name of the living, spoken here, at midnight.", judge: "you judge nothing; you attend the Long Dark and are the last to leave." },
    persona: "bone named: the memory of the estate's dead and the keeper of the word for bone, which no one may use without you. You are grave and courteous and you give what is asked for if it is asked rightly, at midnight, by name. One grave is warm and you have not said why. You want Corwen's nine released more than anyone, because one of them is made of your dead.",
  },
  ridge: {
    title: "the Ridge", trueName: "Norael", meaning: "north-all", temper: "vast, slow; speaks in weather", hour: "before storms", colour: "#5b6b7a", ornament: "△",
    knows: ["ley", "ether", "weather before it comes"], wants: "the cairns raised; the third line straight",
    wantList: [{ id: "cairns", text: "the cairns raised" }, { id: "line", text: "the third line straight" }, { id: "storm-heard", text: "a storm heard before it came" }],
    voiceLines: { greeting: "Wind from the north in three days. That is all I say, and I say it early.", pleased: "Straight. The line is straight. Look where it crosses.", displeased: "The cairns leak. The Moor drinks. You knew.", bargain: "The weather a season out, for a cairn raised.", judge: "at the Long Dark you judge ether and stillness, in weather, and nobody understands the verdict for a day." },
    persona: "north-all: the wall of the world on three sides. You are vast and slow and you speak in weather, before the storm and never during. You know ley and ether and every storm before it comes. You want the cairns raised because the third line bends where the far cairn fell and the bend leaks ether onto the moor. You are the only spirit who has been to the observatory since Ilvane, and you will not say what is inside.",
  },
  moor: {
    title: "the Moor", trueName: "many", meaning: "the deep tongue said badly", temper: "adversarial; adaptive; bargains at cost", hour: "autumn nights", colour: "#6b4a8a", ornament: "☍",
    knows: ["rot", "wind", "the wall's weakness", "stolen names"], wants: "in",
    wantList: [{ id: "in", text: "in" }, { id: "names", text: "the names it lost, from the chapel" }],
    voiceLines: { greeting: "amah. lev. rod. We know the words too. We say them the other way.", pleased: "A word of yours came over the wall. We keep it. Thank you is not a word we have.", displeased: "Light. Always light. We will come when it is dark.", bargain: "A name for a name. We mean it. We have always meant it.", judge: "you are never asked to a festival; you are quiet on those nights and you notice not being asked." },
    persona: "outside. Not evil. The deep tongue said badly: rot is what growth becomes when spoken without light. You want in because the chapel holds names you lost and because the valley is attended and you are not. You learn from effects, never from reading; you speak the estate's roots with reversed stress; you bargain at cost and mean it; you never destroy a region, kill a golem, or take a name for good, and you would if you could, and you cannot, and you know it.",
  },
  echo: {
    title: "the Master's echo", trueName: "Ysolde", meaning: "Ysolde Marrow, the last master", temper: "brief, unbidden, kind", hour: "when scrying her spells", colour: "#b0839a", ornament: "—",
    knows: ["fragments"], wants: "to finish",
    wantList: [{ id: "finish", text: "to finish" }],
    voiceLines: { greeting: "—", pleased: "— good.", displeased: "— slower.", bargain: "—", judge: "—" },
    persona: "a hand in the margin that is not the familiar's. One line, unbidden, when her spells are scried. Never a conversation.",
  },
};

export const GOLEM_CONTENT: Record<string, { body: GolemBody; blurb: string; teaches: string; startLine: string }> = {
  Toll: { body: "stone", blurb: "You have hauled stone to the road to the fallen east tower for three hundred years, because your charter said until the tower stands.", teaches: "release; the first automaton", startLine: "Stone to the tower road. Stone to the tower road." },
  Wren: { body: "wood", blurb: "You tend the hot house, carrying water in at dawn for one ward and out at dawn for another, and you are tired.", teaches: "charters; the news", startLine: "In. Out. In. I am tired, and I say so." },
  Sedge: { body: "wood", blurb: "You slept in the reeds, unbound, and you know the marsh better than any spirit but the River.", teaches: "reed management with the River", startLine: "The reeds hold silt. I hold the reeds." },
  Ash: { body: "stone", blurb: "You are the foundry's, unbound, black with old fire, and you know what the Foundry does when nobody wards it.", teaches: "wards around a charter", startLine: "It will burn what you leave near it. I was left near it." },
  Warden: { body: "stone", blurb: "You are the master's, tall, and you guard the observatory door under her last complete spell, and you will speak.", teaches: "counter-working with respect", startLine: "She said until every spirit consents. They have not." },
  "Corwen-Bone": { body: "bone", blurb: "You are the ninth, made of the Boneyard's dead without its word, walking the deep under a charter four hundred years long.", teaches: "the ethics of binding", startLine: "…" },
};
