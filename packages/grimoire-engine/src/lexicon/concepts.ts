/**
 * The concept index. Not a grammar: a list of things the estate can hear,
 * each with an optional root (the estate's own word), cues in several
 * languages, and what hearing it unlocks in the binding.
 */
import type { Capability, Concept, ConceptFamily } from "../types.js";

function c(id: string, family: ConceptFamily, root: string | null, gloss: string, cues: string[], unlocks: Capability[]): Concept {
  return { id, family, root, gloss, cues, unlocks };
}

const ELEMENT: Capability[] = ["transmute", "push", "spawn"];
const QUALITY: Capability[] = ["transmute", "push"];
const BINDING: Capability[] = ["ward", "time"];
const REAGENT: Capability[] = ["craft", "transfer"];

export const CONCEPTS: Concept[] = [
  // ── elements (the hearth, first hour) ──
  c("heat", "element", "hama", "heat: warmth above the ambient; it conducts and rises", ["heat", "warm", "warmth", "hot", "fire", "flame", "ember", "hearth", "burning", "wärme", "warm", "heiß", "hitze", "feuer", "flamme", "glut", "chaleur", "chaud", "feu", "flamme", "braise", "calor", "caliente", "fuego", "llama", "brasa", "calore", "caldo", "fuoco", "warmte", "vuur", "calor", "ignis"], ELEMENT),
  c("water", "element", "vel", "water and flow: it runs downhill and carries silt", ["water", "flow", "flowing", "river", "stream", "rain", "wet", "flood", "tide", "current", "wasser", "fluss", "strom", "regen", "nass", "fließen", "flut", "eau", "fleuve", "rivière", "pluie", "mouillé", "couler", "agua", "río", "lluvia", "mojado", "fluir", "corriente", "acqua", "fiume", "pioggia", "water", "rivier", "aqua", "flumen"], ELEMENT),
  c("stone", "element", "dor", "stone: mass; mostly still; loose stone may be pushed", ["stone", "rock", "earth", "silt", "sand", "gravel", "boulder", "ground", "stein", "fels", "erde", "schlamm", "kies", "pierre", "roche", "terre", "limon", "piedra", "roca", "tierra", "limo", "pietra", "roccia", "terra", "steen", "rots", "lapis", "terra"], ELEMENT),
  c("growth", "element", "sael", "growth: green things, seeds, roots and leaves", ["growth", "grow", "growing", "green", "leaf", "leaves", "root", "roots", "bloom", "blossom", "plant", "plants", "grass", "herb", "herbs", "tree", "trees", "sprout", "wachsen", "wachstum", "grün", "blatt", "wurzel", "blüte", "pflanze", "gras", "baum", "croître", "croissance", "vert", "feuille", "racine", "fleur", "plante", "herbe", "arbre", "crecer", "verde", "hoja", "raíz", "flor", "planta", "hierba", "árbol", "crescere", "verde", "foglia", "radice", "fiore", "pianta", "groei", "groen", "blad", "wortel", "viridis"], ELEMENT),
  c("air", "element", "ru", "air and wind: the carrier of heat, steam, seed and spore", ["air", "wind", "breeze", "breath", "gust", "gale", "storm", "sky", "luft", "wind", "atem", "sturm", "himmel", "brise", "vent", "souffle", "tempête", "ciel", "aire", "viento", "brisa", "aliento", "tormenta", "cielo", "aria", "vento", "lucht", "wind", "ventus", "aer"], ELEMENT),
  c("light", "element", "lume", "light: sun by day, moon by night, fire and glass; stone blocks it", ["light", "bright", "shine", "shining", "glow", "glowing", "lamp", "lantern", "sun", "sunlight", "moon", "moonlight", "beam", "ray", "licht", "hell", "leuchten", "schein", "lampe", "laterne", "sonne", "mond", "strahl", "lumière", "clair", "briller", "lueur", "lampe", "lanterne", "soleil", "lune", "rayon", "luz", "brillar", "brillo", "lámpara", "farol", "sol", "luna", "rayo", "luce", "lucente", "lampada", "sole", "licht", "helder", "lamp", "zon", "maan", "lux", "lumen"], ELEMENT),
  c("rot", "element", "mor", "rot: what growth becomes in wet darkness; the Moor's element", ["rot", "rotting", "decay", "mould", "mold", "blight", "spore", "spores", "mildew", "corruption", "putrid", "fäulnis", "faul", "verfall", "schimmel", "moder", "pourriture", "pourrir", "moisissure", "putréfaction", "podredumbre", "podrido", "moho", "marchito", "marciume", "muffa", "rot", "verrotting", "schimmel", "putor", "tabes"], ELEMENT),
  c("ether", "element", "aethe", "ether: the world's attention; it pools on ley lines and under the moon and pays for everything", ["ether", "aether", "attention", "mana", "essence", "spirit", "pooled", "ley", "äther", "aufmerksamkeit", "wesen", "éther", "essence", "attention", "éter", "esencia", "atención", "etere", "essenza", "ether", "aandacht", "anima"], ELEMENT),

  // ── qualities (the kitchen garden) ──
  c("cold", "quality", "ithe", "cold, less: the quieting of a thing", ["cold", "cool", "chill", "chilled", "less", "lower", "lessen", "reduce", "weaker", "frost", "freeze", "frozen", "ice", "kalt", "kühl", "kühlen", "weniger", "senken", "frost", "eis", "gefrieren", "froid", "frais", "moins", "baisser", "gel", "glace", "geler", "frío", "fresco", "menos", "bajar", "hielo", "helada", "congelar", "freddo", "fresco", "meno", "gelo", "ghiaccio", "koud", "koel", "minder", "vorst", "ijs", "frigus", "gelu"], QUALITY),
  c("more", "quality", "bral", "strong, more: the increase of a thing", ["more", "strong", "stronger", "greater", "raise", "increase", "grow", "much", "mighty", "greatly", "mehr", "stark", "stärker", "größer", "erhöhen", "mächtig", "plus", "fort", "forte", "davantage", "grand", "augmenter", "puissant", "más", "fuerte", "mayor", "aumentar", "poderoso", "più", "forte", "maggiore", "meer", "sterk", "sterker", "groter", "magis", "fortis"], QUALITY),
  c("one", "quantity", "tan", "one: a single thing", ["one", "single", "alone", "only", "eins", "ein", "einzeln", "allein", "einzig", "un", "une", "seul", "seule", "unique", "uno", "una", "solo", "único", "sola", "één", "enkel", "unus"], QUALITY),
  c("few", "quantity", "tanta", "few: a handful", ["few", "some", "handful", "couple", "several", "wenige", "einige", "paar", "peu", "quelques", "pocos", "pocas", "algunos", "pochi", "alcuni", "weinig", "enkele", "pauci"], QUALITY),
  c("many", "quantity", "tantan", "many: a great number", ["many", "lots", "crowd", "swarm", "numbers", "multitude", "hundred", "thousand", "viele", "menge", "schwarm", "hundert", "tausend", "beaucoup", "nombreux", "foule", "essaim", "cent", "mille", "muchos", "muchas", "multitud", "enjambre", "cien", "mil", "molti", "sciame", "cento", "mille", "veel", "zwerm", "multi"], QUALITY),
  c("all", "quantity", "ol", "all, whole: the entire thing", ["all", "whole", "every", "entire", "everything", "everywhere", "each", "alle", "alles", "ganz", "jeder", "jede", "überall", "tout", "toute", "tous", "toutes", "entier", "chaque", "partout", "todo", "toda", "todos", "todas", "entero", "cada", "tutto", "tutti", "ogni", "intero", "alles", "geheel", "elke", "omnis", "totus"], QUALITY),
  c("slow", "quality", "sen", "slow: patient; slow water drops silt", ["slow", "slowly", "gentle", "gently", "patient", "still", "quiet", "calm", "langsam", "sanft", "geduldig", "ruhig", "still", "lent", "lente", "lentement", "doux", "douce", "calme", "tranquille", "lento", "lenta", "despacio", "suave", "tranquilo", "calmo", "lento", "piano", "langzaam", "zacht", "rustig", "lentus", "tardus"], QUALITY),
  c("fast", "quality", "kir", "fast: quick; fast water scours", ["fast", "quick", "quickly", "swift", "swiftly", "rush", "rushing", "hurry", "sudden", "schnell", "rasch", "eilig", "plötzlich", "vite", "rapide", "rapidement", "soudain", "rápido", "rápida", "veloz", "prisa", "repentino", "veloce", "rapido", "presto", "snel", "vlug", "celer", "velox"], QUALITY),
  c("up", "direction", "nor", "north, up: the ridge's way", ["up", "upward", "upwards", "north", "northward", "rise", "rising", "above", "high", "higher", "top", "climb", "auf", "hinauf", "aufwärts", "nord", "norden", "oben", "hoch", "steigen", "haut", "en haut", "nord", "monter", "au-dessus", "arriba", "norte", "alto", "subir", "encima", "su", "sopra", "nord", "salire", "omhoog", "noord", "boven", "sursum"], QUALITY),
  c("down", "direction", "sud", "south, down: the marsh's way; water's way", ["down", "downward", "downwards", "south", "southward", "fall", "falling", "below", "low", "lower", "bottom", "sink", "descend", "ab", "hinab", "abwärts", "süd", "süden", "unten", "tief", "sinken", "fallen", "bas", "en bas", "sud", "descendre", "tomber", "au-dessous", "abajo", "sur", "bajo", "caer", "descender", "giù", "sotto", "sud", "scendere", "cadere", "omlaag", "zuid", "beneden", "deorsum"], QUALITY),
  c("east", "direction", "est", "east, dawn: where light begins", ["east", "eastward", "dawn", "sunrise", "morning", "daybreak", "ost", "osten", "morgengrauen", "morgen", "sonnenaufgang", "est", "aube", "aurore", "matin", "lever", "este", "oriente", "amanecer", "alba", "mañana", "est", "alba", "aurora", "mattino", "oost", "dageraad", "ochtend", "oriens"], QUALITY),
  c("west", "direction", "oes", "west, dusk: where light ends", ["west", "westward", "dusk", "sunset", "evening", "twilight", "nightfall", "westen", "abend", "dämmerung", "sonnenuntergang", "ouest", "crépuscule", "soir", "coucher", "oeste", "occidente", "anochecer", "atardecer", "tarde", "ovest", "crepuscolo", "sera", "tramonto", "west", "schemering", "avond", "occidens"], QUALITY),
  c("here", "direction", "nith", "within, here: this cell, this room, this hand", ["here", "within", "inside", "near", "close", "this", "hier", "innen", "innerhalb", "nah", "nahe", "dies", "ici", "dedans", "près", "proche", "ceci", "aquí", "dentro", "cerca", "esto", "qui", "dentro", "vicino", "questo", "hier", "binnen", "dichtbij", "hic", "intus"], QUALITY),
  c("there", "direction", "ath", "beyond, there: far from the hand", ["there", "beyond", "far", "yonder", "away", "distant", "outside", "dort", "jenseits", "fern", "weit", "draußen", "là", "au-delà", "loin", "dehors", "allí", "allá", "más allá", "lejos", "fuera", "lì", "là", "oltre", "lontano", "fuori", "daar", "voorbij", "ver", "buiten", "illic", "ultra"], QUALITY),

  // ── bindings (the orchard; these unlock wards and time) ──
  c("once", "binding", "tanmae", "once: a single time, then done", ["once", "one time", "single time", "einmal", "une fois", "una vez", "una volta", "eenmaal", "semel"], BINDING),
  c("while", "binding", "dael", "while: as long as a thing holds", ["while", "whilst", "as long as", "during", "meanwhile", "während", "solange", "pendant", "tant que", "mientras", "durante", "mentre", "finché", "terwijl", "zolang", "dum"], BINDING),
  c("until", "binding", "daelith", "until: as long as a thing has not yet come", ["until", "till", "up to", "before", "bis", "solange nicht", "jusqu'à", "jusque", "avant", "hasta", "antes", "finché non", "fino a", "tot", "totdat", "donec"], BINDING),
  c("whenever", "binding", "hesk", "whenever: each time a thing is so", ["whenever", "when", "each time", "every time", "if ever", "always when", "should", "wann immer", "wenn", "immer wenn", "jedes mal", "sobald", "chaque fois", "quand", "lorsque", "dès que", "cada vez", "cuando", "siempre que", "ogni volta", "quando", "telkens", "wanneer", "quandocumque", "quotiens"], BINDING),
  c("at-dawn", "binding", "estan", "at dawn: when the sun comes up", ["at dawn", "each dawn", "each morning", "every morning", "at sunrise", "bei morgengrauen", "jeden morgen", "à l'aube", "chaque matin", "al amanecer", "cada mañana", "all'alba", "ogni mattina", "bij dageraad"], BINDING),
  c("at-dusk", "binding", "oesan", "at dusk: when the sun goes down", ["at dusk", "each dusk", "each evening", "every evening", "at sunset", "at nightfall", "bei dämmerung", "jeden abend", "au crépuscule", "chaque soir", "al anochecer", "cada tarde", "al tramonto", "ogni sera", "bij schemering"], BINDING),
  c("until-moon", "binding", "lunae", "until the moon: for a month, or until the full moon", ["until the moon", "till the moon", "till the full moon", "under the moon", "moonrise", "a month", "moonlong", "bis zum mond", "einen monat", "jusqu'à la lune", "un mois", "hasta la luna", "un mes", "fino alla luna", "un mese", "tot de maan", "een maand"], BINDING),
  c("release", "verb", "kaer", "never, release: let a thing go; end a binding; free a golem", ["release", "let go", "free", "unbind", "loose", "loosen", "undo", "cease", "never", "stop", "end", "ending", "no more", "freilassen", "loslassen", "befreien", "lösen", "aufhören", "nie", "niemals", "beenden", "libérer", "lâcher", "délier", "cesser", "jamais", "finir", "liberar", "soltar", "desatar", "cesar", "nunca", "terminar", "liberare", "sciogliere", "cessare", "mai", "finire", "loslaten", "bevrijden", "nooit", "stoppen", "solvere", "liberare", "numquam"], ["against", "ward", "bind"]),

  // ── verbs ──
  c("kindle", "verb", "kel", "kindle, raise: bring a thing up, light a fire", ["kindle", "light", "ignite", "raise", "lift", "spark", "wake", "waken", "rouse", "stir", "warm up", "entzünden", "anzünden", "heben", "erheben", "wecken", "erwachen", "regen", "allumer", "enflammer", "lever", "élever", "éveiller", "réveiller", "encender", "prender", "alzar", "levantar", "despertar", "accendere", "alzare", "sollevare", "svegliare", "ontsteken", "aansteken", "verheffen", "wekken", "accendere", "excitare"], ["transmute", "push"]),
  c("quench", "verb", "thes", "quench, lower: bring a thing down, put a fire out", ["quench", "quenched", "lower", "lessen", "dampen", "damp", "douse", "extinguish", "put out", "still", "cool down", "settle", "calm", "löschen", "auslöschen", "dämpfen", "senken", "beruhigen", "éteindre", "étouffer", "baisser", "apaiser", "calmer", "apagar", "extinguir", "sofocar", "bajar", "calmar", "spegnere", "smorzare", "abbassare", "calmare", "doven", "blussen", "dempen", "verlagen", "extinguere", "sedare"], ["transmute", "push"]),
  c("bind", "verb", "bran", "bind: give work to a body; hold a thing to a task", ["bind", "binding", "bound", "tie", "tether", "yoke", "harness", "charge", "task", "serve", "command", "set to work", "binden", "fesseln", "anbinden", "beauftragen", "dienen", "befehlen", "lier", "attacher", "atteler", "charger", "servir", "commander", "atar", "ligar", "unir", "encargar", "servir", "mandar", "legare", "vincolare", "incaricare", "servire", "comandare", "binden", "vastbinden", "opdragen", "dienen", "ligare", "vincire"], ["bind", "ward"]),
  c("scry", "verb", "mira", "scry, see truly: ask what happened, and why", ["scry", "see truly", "see", "look", "look into", "reveal", "show", "witness", "behold", "read", "trace", "schauen", "sehen", "enthüllen", "zeigen", "lesen", "spuren", "erblicken", "voir", "regarder", "révéler", "montrer", "lire", "tracer", "contempler", "ver", "mirar", "revelar", "mostrar", "leer", "rastrear", "contemplar", "vedere", "guardare", "rivelare", "mostrare", "leggere", "zien", "kijken", "onthullen", "tonen", "lezen", "videre", "cernere"], ["scry-deep"]),
  c("speak", "verb", "ven", "speak: address a spirit or a body by its true name", ["speak", "say", "tell", "talk", "call", "call upon", "ask", "answer", "voice", "utter", "sing", "sprechen", "sagen", "erzählen", "reden", "rufen", "anrufen", "fragen", "antworten", "stimme", "singen", "parler", "dire", "raconter", "appeler", "invoquer", "demander", "répondre", "voix", "chanter", "hablar", "decir", "contar", "llamar", "invocar", "preguntar", "responder", "voz", "cantar", "parlare", "dire", "raccontare", "chiamare", "invocare", "chiedere", "rispondere", "voce", "cantare", "spreken", "zeggen", "vertellen", "roepen", "vragen", "zingen", "loqui", "dicere", "vocare"], ["voice"]),
  c("ward", "verb", "hara", "hold, ward: keep a thing so; guard it; watch it", ["ward", "warded", "hold", "keep", "guard", "watch", "protect", "shield", "fence", "defend", "preserve", "stand", "hold fast", "halten", "bewahren", "hüten", "wachen", "schützen", "schirmen", "verteidigen", "bewachen", "garder", "tenir", "protéger", "veiller", "défendre", "préserver", "abriter", "guardar", "sostener", "proteger", "vigilar", "defender", "preservar", "custodiar", "tenere", "custodire", "proteggere", "vegliare", "difendere", "preservare", "houden", "bewaren", "beschermen", "waken", "verdedigen", "tenere", "custodire", "servare"], ["ward", "against"]),
  c("open", "verb", "sol", "open: unbar, unlock, let through", ["open", "opened", "unbar", "unlock", "unseal", "unclose", "let through", "let in", "admit", "öffnen", "offen", "aufmachen", "entriegeln", "entsiegeln", "einlassen", "ouvrir", "ouvert", "déverrouiller", "desceller", "laisser passer", "abrir", "abierto", "desbloquear", "dejar pasar", "aprire", "aperto", "sbloccare", "openen", "open", "ontgrendelen", "aperire"], ["sluice", "move"]),
  c("name", "verb", "nem", "name: give or learn a true name", ["name", "naming", "named", "call by name", "christen", "title", "nennen", "benennen", "name", "taufen", "nommer", "nom", "baptiser", "nombrar", "nombre", "bautizar", "nominare", "nome", "battezzare", "noemen", "naam", "nomen", "nominare"], ["voice", "bind"]),
  c("break", "verb", "dath", "break: shatter, crack, undo a made thing", ["break", "broken", "shatter", "crack", "smash", "split", "tear", "sunder", "brechen", "zerbrechen", "zerschmettern", "spalten", "reißen", "casser", "briser", "rompre", "fendre", "déchirer", "romper", "quebrar", "partir", "rasgar", "rompere", "spezzare", "spaccare", "breken", "verbrijzelen", "splijten", "frangere", "rumpere"], ["push", "transmute"]),
  c("adorn", "verb", "lil", "adorn, play: light, colour, sound, marks and moths; magic that need not be useful", ["adorn", "play", "playful", "decorate", "pretty", "beautiful", "beauty", "dance", "shimmer", "sparkle", "glitter", "ribbon", "garland", "festoon", "charm", "delight", "colour", "color", "coloured", "colored", "paint", "hue", "tint", "song", "chime", "music", "petal", "petals", "moth", "moths", "schmücken", "spielen", "spiel", "schön", "hübsch", "tanzen", "schimmern", "funkeln", "farbe", "farben", "bunt", "malen", "lied", "klang", "musik", "blütenblatt", "motte", "motten", "orner", "parer", "jouer", "joli", "belle", "beau", "danser", "scintiller", "couleur", "couleurs", "coloré", "peindre", "chanson", "musique", "pétale", "papillon", "adornar", "jugar", "bonito", "bello", "hermoso", "bailar", "brillar", "color", "colores", "pintar", "canción", "música", "pétalo", "polilla", "adornare", "giocare", "bello", "danzare", "scintillare", "colore", "colori", "dipingere", "canzone", "musica", "petalo", "falena", "versieren", "spelen", "mooi", "dansen", "kleur", "kleuren", "lied", "mot", "ornare", "ludere"], ["adorn"]),

  // ── reagents ──
  c("ash", "reagent", "asha", "ash: fire's leavings; wards against rot; fuel for the foundry", ["ash", "ashes", "cinder", "cinders", "soot", "asche", "ruß", "cendre", "cendres", "suie", "ceniza", "cenizas", "hollín", "cenere", "as", "roet", "cinis"], REAGENT),
  c("salt", "reagent", "salu", "salt: preserving; binding words against the Moor", ["salt", "brine", "salted", "salz", "sole", "sel", "saumure", "sal", "salmuera", "sale", "zout", "pekel", "sal"], REAGENT),
  c("sap", "reagent", "sapa", "sap: the orchard's gift in spring; growth's price", ["sap", "resin", "syrup", "saft", "harz", "sève", "résine", "savia", "resina", "linfa", "sap", "hars", "sucus"], REAGENT),
  c("silver", "reagent", "argen", "silver: from the seam; for glass and foci", ["silver", "silbern", "silber", "argent", "argenté", "plata", "plateado", "argento", "zilver", "argentum"], REAGENT),
  c("glass", "reagent", "vitre", "glass: silver under heat with ether; holds light and ether", ["glass", "lens", "lenses", "pane", "mirror", "crystal", "glas", "linse", "scheibe", "spiegel", "kristall", "verre", "lentille", "vitre", "miroir", "cristal", "vidrio", "cristal", "lente", "espejo", "vetro", "lente", "specchio", "cristallo", "glas", "lens", "spiegel", "vitrum"], REAGENT),
  c("moon-ether", "reagent", "lunaethe", "moon-ether: the night house's harvest; great workings only", ["moon-ether", "moon ether", "moonether", "moonlight ether", "moondew", "mondäther", "mondtau", "éther de lune", "rosée de lune", "éter de luna", "rocío de luna", "etere di luna", "maanether"], REAGENT),
  c("bone", "reagent", "oss", "bone: the boneyard's, with the Hearth's consent; Corwen's work; forbidden without the council", ["bone", "bones", "skull", "skeleton", "marrow", "knochen", "gebein", "schädel", "skelett", "os", "ossements", "crâne", "squelette", "hueso", "huesos", "calavera", "esqueleto", "osso", "ossa", "teschio", "scheletro", "bot", "botten", "schedel", "os", "ossa"], REAGENT),

  // ── rootless concepts the index should still hear ──
  c("close", "verb", null, "close: shut, bar, seal", ["close", "shut", "bar", "seal", "sealed", "lock", "locked", "stop up", "schließen", "zumachen", "versiegeln", "sperren", "verriegeln", "fermer", "sceller", "barrer", "verrouiller", "cerrar", "sellar", "bloquear", "chiudere", "sigillare", "sluiten", "verzegelen", "claudere"], ["sluice", "move"]),
  c("seed", "verb", null, "seed: plant, sow, set a species in a cell", ["seed", "seeds", "sow", "sowing", "plant", "planting", "set", "samen", "säen", "pflanzen", "setzen", "graine", "semer", "planter", "semilla", "sembrar", "plantar", "seme", "seminare", "piantare", "zaad", "zaaien", "planten", "semen", "serere"], ["spawn"]),
  c("burn", "verb", null, "burn: fire on growth; makes ash", ["burn", "burning", "scorch", "char", "blaze", "smoulder", "brennen", "verbrennen", "sengen", "lodern", "brûler", "roussir", "flamber", "quemar", "arder", "chamuscar", "bruciare", "ardere", "branden", "verbranden", "urere", "ardere"], ["transmute"]),
  c("freeze", "verb", null, "freeze: frost on water; blocks flow", ["freeze", "frozen", "frost", "ice", "icy", "rime", "hoar", "gefrieren", "einfrieren", "frost", "eis", "eisig", "geler", "gelé", "givre", "glace", "congelar", "helar", "escarcha", "hielo", "gelare", "congelare", "brina", "ghiaccio", "bevriezen", "vorst", "ijs", "gelare"], ["transmute"]),
  c("dry", "verb", null, "dry: take water away; the library's need", ["dry", "dried", "drying", "parch", "wring", "trocken", "trocknen", "dörren", "sec", "sèche", "sécher", "seco", "seca", "secar", "secco", "secca", "asciugare", "droog", "drogen", "siccus", "siccare"], ["transmute"]),
  c("drain", "verb", null, "drain: let water out and down", ["drain", "draining", "empty", "sluice", "bail", "lower the water", "entwässern", "ablassen", "leeren", "drainer", "vider", "écouler", "drenar", "vaciar", "desaguar", "drenare", "svuotare", "scolare", "afvoeren", "leegmaken", "exhaurire"], ["sluice", "push"]),
  c("carry", "verb", null, "carry: bear a thing from here to there", ["carry", "carrying", "bear", "bring", "fetch", "take", "transport", "deliver", "tragen", "bringen", "holen", "schleppen", "liefern", "porter", "apporter", "amener", "chercher", "livrer", "llevar", "traer", "cargar", "portar", "portare", "recare", "dragen", "brengen", "halen", "portare", "ferre"], ["move", "transfer"]),
  c("haul", "verb", null, "haul: heavy carrying; stone and silver from the mine", ["haul", "hauling", "drag", "lug", "tow", "heave", "cart", "hauling", "schleppen", "ziehen", "karren", "traîner", "tirer", "charrier", "arrastrar", "acarrear", "tirar", "trascinare", "tirare", "trainare", "slepen", "trekken", "trahere"], ["move", "transfer"]),
  c("guard", "verb", null, "guard: keep vermin, rot or spore away", ["guard", "guarding", "against", "away", "keep out", "keep off", "drive off", "drive away", "banish", "repel", "bewachen", "abwehren", "fernhalten", "vertreiben", "verbannen", "garder", "chasser", "repousser", "éloigner", "bannir", "guardar", "ahuyentar", "repeler", "alejar", "desterrar", "custodire", "scacciare", "respingere", "allontanare", "bandire", "bewaken", "afweren", "verdrijven", "verbannen", "arcere", "pellere"], ["ward"]),
  c("sound", "verb", null, "sound: a chime, a hum, the bell", ["sound", "chime", "ring", "ringing", "toll", "hum", "bell", "note", "tone", "echo", "klang", "klingen", "läuten", "glocke", "ton", "summen", "echo", "son", "sonner", "tinter", "cloche", "note", "écho", "sonido", "sonar", "campana", "tañer", "eco", "suono", "suonare", "campana", "rintocco", "eco", "geluid", "klinken", "luiden", "bel", "toon", "sonus", "tinnire"], ["adorn"]),
  c("path", "verb", null, "path: a way from one place to another; a road for bodies", ["path", "way", "road", "route", "track", "trail", "corridor", "passage", "bridge", "pfad", "weg", "straße", "route", "gang", "durchgang", "brücke", "chemin", "voie", "route", "sentier", "passage", "pont", "camino", "vía", "ruta", "senda", "pasaje", "puente", "sentiero", "via", "strada", "passaggio", "ponte", "pad", "weg", "route", "doorgang", "brug", "via", "iter"], ["move"]),
  c("turn", "verb", null, "turn: the wheel; power; rotation", ["turn", "turning", "spin", "spinning", "wheel", "revolve", "rotate", "mill", "grind", "drehen", "sich drehen", "rad", "wirbeln", "mühle", "mahlen", "tourner", "roue", "tournoyer", "moulin", "moudre", "girar", "rueda", "molino", "moler", "girare", "ruota", "mulino", "macinare", "draaien", "wiel", "molen", "malen", "vertere", "rota"], ["push", "sluice"]),
  c("clear", "verb", null, "clear: silt from a sluice, rubble from a gallery, weeds from a bed", ["clear", "cleared", "clean", "scour", "sweep", "unclog", "remove", "rid", "purge", "räumen", "reinigen", "säubern", "fegen", "entfernen", "spülen", "dégager", "nettoyer", "récurer", "balayer", "enlever", "purger", "despejar", "limpiar", "barrer", "quitar", "purgar", "sgomberare", "pulire", "spazzare", "togliere", "ruimen", "schoonmaken", "vegen", "verwijderen", "purgare", "mundare"], ["push", "transmute"]),
  c("mend", "verb", null, "mend: repair a made thing; the roof, the bell, the weir", ["mend", "mended", "repair", "fix", "restore", "heal", "patch", "rebuild", "raise again", "flicken", "reparieren", "wiederherstellen", "heilen", "ausbessern", "aufbauen", "réparer", "raccommoder", "restaurer", "guérir", "rebâtir", "reparar", "arreglar", "restaurar", "sanar", "remendar", "reconstruir", "riparare", "aggiustare", "restaurare", "guarire", "ricostruire", "herstellen", "repareren", "genezen", "herbouwen", "reficere", "sanare"], ["transmute", "craft"]),
  c("sleep", "verb", null, "sleep: rest; stillness; a body that waits", ["sleep", "sleeping", "asleep", "rest", "resting", "dream", "slumber", "doze", "lie still", "schlafen", "ruhen", "träumen", "schlummern", "dormir", "sommeil", "reposer", "rêver", "dormir", "descansar", "soñar", "dormire", "riposare", "sognare", "slapen", "rusten", "dromen", "dormire", "quiescere"], ["bind"]),
  c("smoke", "quality", null, "smoke and steam: what fire and water make together", ["smoke", "steam", "vapour", "vapor", "mist", "fog", "haze", "rauch", "dampf", "nebel", "dunst", "fumée", "vapeur", "brume", "brouillard", "humo", "vapor", "niebla", "bruma", "fumo", "vapore", "nebbia", "rook", "stoom", "mist", "damp", "fumus", "vapor", "nebula"], QUALITY),
  c("silt", "quality", null, "silt: what slow water leaves; what fast water carries away", ["silt", "mud", "sludge", "sediment", "muck", "slime", "schlick", "schlamm", "sediment", "ablagerung", "vase", "boue", "sédiment", "limo", "lodo", "barro", "fango", "sedimento", "melma", "limo", "slib", "modder", "limus", "lutum"], QUALITY),
];

export const CONCEPT_BY_ID: Record<string, Concept> = Object.fromEntries(CONCEPTS.map((x) => [x.id, x]));

/** root → concept id */
export const ROOTS: Record<string, string> = Object.fromEntries(CONCEPTS.filter((x) => x.root).map((x) => [x.root!, x.id]));

/** What the hearth gives in the first hour. */
export const STARTER_WORDS: string[] = ["heat", "water", "stone", "growth", "air", "light", "rot", "ether", "kindle", "quench", "adorn"];

const EXPLANATIONS: Record<string, string> = {
  heat: "Hama is heat. It moves toward its neighbours until they agree, and it rises. Put it on water and you get steam; put too much on green and you get fire. She kept the greenhouse with it for thirty years.",
  water: "Vel is water, and the way water goes: down, to the lowest neighbour. Slow water drops what it carries. Fast water takes it. The River is vel said properly.",
  stone: "Dor is stone. Stone does not want anything; that is why it can be built with. Silt becomes stone if it is left alone long enough, which is how the mill went still.",
  growth: "Sael is growth. Every green thing has its own needs: water, light, a season. Grass wants nothing much. Apple wants everything, and gives sap for it.",
  air: "Ru is air, and wind. It carries: heat, steam, seed, spore. The Moor comes over the wall on it. So does the smell of the foundry.",
  light: "Lume is light. The sun by day, the moon by night, fire, and glass that holds it. Rot cannot bear it. Stone stops it. Moths cannot stay away from it.",
  rot: "Mor is rot. Growth spoken without light. It eats green and it eats ether, and it spreads where it is wet and dark. It is not evil. It is outside.",
  ether: "Aethe is ether: the world attending. It pools where the world is most itself, on the ley lines and under the moon and at a lit hearth. Everything I write costs it. Everything.",
  cold: "Ithe is cold, and less. It is the quieting of any thing, not only heat. Say it of a flood and you have said 'less water', if the world hears you.",
  more: "Bral is more, strong. She used it too much in her early notebooks and then, later, almost never. A verse with bral in it costs more and does more. Say it when you mean it.",
  one: "Tan is one. A single cell, a single body, a single time. Most of the mistakes I have carried came from saying more when tan was meant.",
  few: "Tanta is a few: a handful. Enough to matter, not enough to flood.",
  many: "Tantan is many. Be careful with it near water.",
  all: "Ol is all, whole. The entire orchard; the whole marsh. The council will want to know before you say it of anything shared.",
  slow: "Sen is slow. The River likes it. Slow water drops silt, which is why the marsh builds itself if you let it.",
  kir: "",
  fast: "Kir is fast. Fast water scours; it will clear a silted sluice or tear a bank, depending on how much you meant.",
  up: "Nor is up, and north, where the ridge is. Heat goes nor by itself.",
  down: "Sud is down, and south, where the marsh is. Water goes sud by itself; you rarely need to tell it.",
  east: "Est is east, and dawn, where the light begins. Estan, at dawn, is the ward-word that comes from it.",
  west: "Oes is west, and dusk. The Bell's name is made of it: the many dusks.",
  here: "Nith is within, here: the cell under your hand, the room you stand in. The Hearth's name has it: heat within.",
  there: "Ath is beyond, there. The Orchard's name ends in it: all growth beyond. It means the far cells, the ones you cannot see from where you stand.",
  once: "Tanmae is once. Say it and the thing is done a single time and then it is finished. Most of what you want in the first year is tanmae.",
  while: "Dael is while: as long as something holds. A ward with dael in it watches a condition and stops when the condition stops. Ilvane's sluice ward has it, and the condition stopped nine hundred years ago, and the ward did not notice.",
  until: "Daelith is until: the opposite of dael. Do a thing until something comes. The library's drying was daelith, in her hand.",
  whenever: "Hesk is whenever. Each time a thing is so, the ward wakes. It is the word most wards are built on, and the word the vermin will teach you.",
  "at-dawn": "Estan is at dawn. The Hearth's hour. A ward on estan fires once a day, when the light begins.",
  "at-dusk": "Oesan is at dusk. The Glass's hour. Lanterns, if you want them, are oesan.",
  "until-moon": "Lunae is until the moon: the length of a month, or until the moon is full, depending on what you meant and how well I heard you. Great workings begin on it.",
  release: "Kaer is release, and never. It ends a binding. It frees a golem. It is always free to say, and it is the word I would ask you to learn before bran.",
  kindle: "Kel is kindle, raise: bring a thing up. Fire, mostly, but also water in a cistern, or a sleeping body. Her first verse on the estate was a kel.",
  quench: "Thes is quench, lower: bring a thing down. Fire, flood, a quarrel. The Library's name is made of it: the kept quenching.",
  bind: "Bran is bind. To give work to a body. It needs the body's name and a binding word, and it needs reagents, and it should need thought. Corwen's story exists so that you feel this.",
  scry: "Mira is scry: to see truly. To ask a thing what it did, and why, and what it heard. With it you may read other casters' writing, including the Moor's.",
  speak: "Ven is speak. With a true name after it, the world carries your verse to the thing named. Without a name it is only air.",
  ward: "Hara is hold, ward: keep a thing so. The wall was a hara. Most of what keeps the estate alive is hara, said by fourteen hands.",
  open: "Sol is open. Sluices, doors, the grate if you must. Say it with the thing's name.",
  name: "Nem is name. To give one, or to learn one. The Boneyard holds nem for the dead.",
  break: "Dath is break. The Foundry's name ends in it. It is the word for shattering, and for cracking a stale working when kaer will not do.",
  adorn: "Lil is adorn, play. Light, colour, sound, marks, moths. It costs nothing and it is judged at the festivals. Most people's first beautiful spell is a lil.",
  ash: "Asha is ash. Fire's leavings. Rot will not cross a line of it, for a while.",
  salt: "Salu is salt. Made in the foundry from marsh water. It preserves, and the Moor cannot say words with salt in them.",
  sap: "Sapa is sap. The orchard gives it in spring, if it is well. The Library takes it as a price.",
  silver: "Argen is silver. From the seam, through the deep. Glass is made of it.",
  glass: "Vitre is glass: silver under heat with ether. It holds light and it holds ether. Lenses, foci, the observatory.",
  "moon-ether": "Lunaethe is moon-ether: what the moonbloom gives under a full moon in the night house. Great workings begin with it and nothing else.",
  bone: "Oss is bone. The Boneyard's, with the Hearth's consent. Corwen used it without asking anyone, and one of his still walks. The council must seal any working with oss in it.",
};

export function explainWord(conceptId: string): string {
  const known = EXPLANATIONS[conceptId];
  if (known && known.length > 0) return known;
  const cpt = CONCEPT_BY_ID[conceptId];
  if (!cpt) return "I do not know that word. Neither did she.";
  return `${cpt.root ? `${cpt.root[0]!.toUpperCase()}${cpt.root.slice(1)} is ` : "It is "}${cpt.gloss}.`;
}

const FAMILY_HINTS: Record<ConceptFamily, string> = {
  element: "one of the eight; the hearth knows it",
  quality: "a quality: how much, how fast, which way",
  binding: "a binding word: when, and for how long",
  verb: "a verb: something the world can be asked to do",
  reagent: "a reagent: made, not found",
  voice: "a voice",
  direction: "a direction",
  quantity: "a number",
  name: "a true name; found, not learned",
};

export function smudgedHint(conceptId: string): string {
  const cpt = CONCEPT_BY_ID[conceptId];
  if (!cpt) return "a smudge; the ink ran";
  const len = cpt.root ? cpt.root.length : 0;
  const shape = cpt.root ? `${cpt.root[0]}${"·".repeat(Math.max(1, len - 1))}` : "(no root)";
  return `${shape} — ${FAMILY_HINTS[cpt.family]}`;
}

/** The Library's index, shelf by shelf. Opens as the library is dried. */
export const MASTER_INDEX: Array<{ shelf: string; words: string[] }> = [
  { shelf: "The hearth shelf", words: ["heat", "water", "stone", "growth", "air", "light", "rot", "ether"] },
  { shelf: "Qualities", words: ["cold", "more", "slow", "fast", "smoke", "silt"] },
  { shelf: "Counting", words: ["one", "few", "many", "all"] },
  { shelf: "The compass", words: ["up", "down", "east", "west", "here", "there"] },
  { shelf: "Bindings", words: ["once", "while", "until", "whenever", "at-dawn", "at-dusk", "until-moon", "release"] },
  { shelf: "Verbs of the hand", words: ["kindle", "quench", "open", "close", "clear", "mend", "seed", "burn", "freeze", "dry", "drain", "carry", "haul", "guard", "turn", "sleep", "path", "sound", "adorn"] },
  { shelf: "Verbs of the voice", words: ["speak", "name", "scry", "bind", "ward", "break"] },
  { shelf: "Reagents", words: ["ash", "salt", "sap", "silver", "glass", "moon-ether", "bone"] },
];
