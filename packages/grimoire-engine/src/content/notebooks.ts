import type { Notebook, NotebookPage } from "../types.js";

function page(n: number, text: string, verses: NotebookPage["verses"] = [], words: string[] = []): NotebookPage {
  return { n, text, verses, words };
}
const v = (lines: string[], about: string, echoable = true) => ({ lines, about, echoable });

/**
 * The notebooks. Ysolde's three, Ilvane's fragments, Corwen's (locked), and
 * the household's commonplace book. Every early problem has a verse near it
 * to echo: plain speech, a root or two, never more than four lines.
 */
export const NOTEBOOKS: Notebook[] = [
  {
    id: "ysolde-1",
    author: "Ysolde Marrow",
    title: "First notebook: the year I came",
    era: "thirty-one years ago",
    pages: [
      page(1, "The familiar met me at the gate and did not say its name. It said the hearth would light for anyone with the shape of a verse in them, and that most people have it and do not know. I had it. The fire took my first four words and I have not been cold since.", [
        v(["Small fire, wake and warm this room", "hama, come up from the ash"], "kindling the hearth; heat on a few cells"),
      ], ["heat", "kindle"]),
      page(2, "The garden is the school. Every mistake here costs a cabbage. I made the beds too warm and the moths came, hundreds, and the familiar said 'well' in a way I have thought about for thirty years.", [
        v(["Let the beds be cooler by a hand", "ithe, gently, to the herb rows"], "quench heat a little, in the herb beds"),
        v(["Light for the green things, a little more", "and water where the earth is dry"], "a small cantrip for growth"),
      ], ["cold", "more", "light", "water"]),
      page(3, "Vermin eat what grows in the dark. The sparrow does not; it is too honest. I scried the sparrow and read what it does in fourteen lines, and wrote this for the vermin, and it held.", [
        v(["Whenever a grey thing creeps in the dark of the beds,", "let light come down on that cell and hold, hara,", "until it goes"], "the vermin ward: light on any cell where vermin stands"),
      ], ["whenever", "ward", "light", "until"]),
      page(4, "Ilvane's sluice. Read it before you touch it. The ward tests for stone at the wall, and there is stone at the wall; there is stone everywhere she built. She meant standing. I released nothing that year. I was afraid of her.", [
        v(["Old ward at the orchard sluice, kaer,", "let go the water and the word.", "The wall is down. The wall is down."], "releasing a stale ward by name (the sluice ward)"),
      ], ["release", "while"]),
      page(5, "The hot house: Corwen's heat and Marren's quench, both correct, both at dawn, and Wren between them carrying water in and water out for two hundred years. I meant to give Wren a charter of its own and never found the verse.", [
        v(["Wren, wooden and tired, hear your work:", "tend the forcing beds, and rest at dusk,", "and tell the house when you cannot"], "a charter for Wren"),
      ], ["speak", "bind", "at-dusk"]),
    ],
  },
  {
    id: "ysolde-2",
    author: "Ysolde Marrow",
    title: "Second notebook: water, fire, and the Library's price",
    era: "twenty years ago",
    pages: [
      page(1, "Velharan does not lie and does not help. Ask her exactly the thing. 'What silts the mill' gets you 'water'. 'Which cell holds the silt that stops the wheel' gets you a cell.", [
        v(["Velharan, flow that holds, I ask you plainly:", "which cell holds the silt that stops the wheel?"], "speaking to the River by name; a question"),
        v(["Silt at the wheel, go down and south,", "kir, with the water, out to the marsh"], "pushing silt downstream from the wheel"),
      ], ["speak", "silt", "down", "fast"]),
      page(2, "The weir is not a cantrip. It is a working: three phases, and the River watching each. I wrote a checkpoint after every gate and slept between them, which the familiar says is the whole art.", [
        v(["Gate by gate, sen, the weir shall mend:", "first the east, then the middle, then the west,", "and rest between, until the moon"], "a great working in phases with checkpoints"),
      ], ["slow", "until-moon", "mend"]),
      page(3, "The Library must be dry, not drained. Pull the water out fast and the books go with it. Ask the cost before you commit; the familiar can count what you cannot.", [
        v(["Water in the stacks, go slow and low,", "one hand a day, down to the sluice,", "and leave the paper where it lies"], "drying the library slowly"),
      ], ["slow", "down", "dry"]),
      page(4, "Fire near the mill goes to the council. I do not care that you are alone; the council is your own seal and it makes you read the card. The foundry is a compound ward: light it, and ward the neighbours against what it does.", [
        v(["Furnace, kel, and burn what ash allows;", "whenever heat walks past the foundry wall,", "quench it there, hara, and hold"], "a compound ward: kindle the furnace, guard the wall"),
      ], ["kindle", "whenever", "quench", "ward"]),
      page(5, "The bell is cracked and the hours drift. Silver would be right. Glass will do for a season, and the Glass will say so every time it is rung.", [
        v(["Bell, take this glass into your crack, vitre,", "and be true for one season, tanmae"], "patching the bell with glass"),
      ], ["glass", "once", "mend"]),
    ],
  },
  {
    id: "ysolde-3",
    author: "Ysolde Marrow",
    title: "Last notebook",
    era: "the last ten years",
    missingPages: 6,
    pages: [
      page(1, "The night house I released myself. I am not going to write why in a book the next one will read on the first evening. Ask me in the winter. Ask the moonbloom.", [
        v(["Moonbloom, open under the whole moon, lunae,", "and give what you keep to the dark house"], "harvesting moon-ether at full moon"),
      ], ["until-moon", "moon-ether", "open"]),
      page(2, "The valley is one word in a longer sentence. I have believed this for nine years and the familiar has stopped arguing, which is not the same as agreeing. If the estate has a name it is in the chapel, unspoken, under the other names.", [
        v(["Lantern in the orchard for whoever comes next,", "lil, a small gold light, and nothing more"], "a charm: a lantern left for another"),
      ], ["adorn", "light"]),
      page(3, "Corwen's nine are still walking. I went down once with the Boneyard's names in my mouth and came up without using them. Release is always free. It is the asking that costs.", [], ["release", "name"]),
      page(4, "The cairns leak. The third line bends where the far cairn fell. If it were straight it would cross the others at the observatory, and Ilvane knew that, and built the observatory anyway, or because.", [], ["ether", "up"]),
      page(5, "The familiar has a name. I have not heard it. I think Ilvane did.", []),
      page(6, "[the remaining pages are missing; the binding shows where they were cut]", []),
    ],
  },
  {
    id: "ilvane",
    author: "Ilvane",
    title: "Fragments, in old form",
    era: "nine hundred years ago",
    pages: [
      page(1, "The Library translates these. Ilvane wrote in the old form, in which every binding word comes first and the true name last, and she did not rhyme, ever.", [
        v(["Hesk dor-nith, sol vel ath Saelolath", "(whenever the stone is here, open the water beyond, to the Orchard)"], "the sluice ward, as she wrote it", false),
        v(["Hara mor ath, lume nith, ol", "(hold rot beyond; light here; all)"], "the first ward against the moor's rot"),
      ], ["whenever", "ward", "open"]),
      page(2, "On the wall: 'I spoke the wall first, then the mill, then the ward. I did not speak the observatory. I found it.'", []),
    ],
  },
  {
    id: "corwen",
    author: "Corwen",
    title: "Corwen's book",
    era: "four hundred years ago",
    locked: true,
    pages: [page(1, "The book is bound shut with a word the Boneyard holds. The Library will not translate it until the nine are released.", [])],
  },
  {
    id: "household",
    author: "the household",
    title: "The commonplace book",
    era: "now",
    pages: [page(1, "Empty. Verses shelved in the chapel appear here for everyone in the house.", [])],
  },
];

export function notebookById(id: string): Notebook | null {
  return NOTEBOOKS.find((n) => n.id === id) ?? null;
}
