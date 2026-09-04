/** The first hour, shot by shot (design §3). The world tracks `step`; the familiar's wake carries it. */
export const FIRST_HOUR: Array<{ step: number; title: string; trigger: string; familiarLine: string; gives: string[] }> = [
  { step: 0, title: "The letter", trigger: "the estate is founded", familiarLine: "", gives: [] },
  { step: 1, title: "The hearth lights on any verse", trigger: "the first verse-shaped speech in the circle", familiarLine: "There. The hearth lights for anyone with the shape of a verse in them, and you have it.", gives: ["heat", "water", "stone", "growth", "air", "light", "rot", "ether", "kindle", "quench", "adorn"] },
  { step: 2, title: "The kitchen garden, drawn wrong", trigger: "the first cantrip in the garden works a little; the second misfires into moths", familiarLine: "Well.", gives: [] },
  { step: 3, title: "The first scry", trigger: "after the moths, the familiar suggests a scry once", familiarLine: "Scry it, if you like. The page will show you which word I did not hear.", gives: ["more"] },
  { step: 4, title: "The first ward", trigger: "the sparrow scried; a couplet with a binding word", familiarLine: "That will hold while you are not looking. That is what a ward is.", gives: ["ward", "whenever"] },
  { step: 5, title: "Evening", trigger: "the first bell hour after the ward", familiarLine: "It is the bell hour. Sit. This is a short one.", gives: [] },
];

export const REACTION_GLOSSES: Record<number, string> = {
  1: "Heat on water makes steam. You can see it rise near the hearth.",
  2: "Steam rides the wind and falls as water where it is cold.",
  3: "Green things grow where they have water and light, and seed their neighbours when they are full.",
  4: "Enough heat on growth is fire: it eats the green, gives heat and light, and leaves ash.",
  5: "Fire spreads to a green neighbour when the wind blows that way, faster in a dry season.",
  6: "Wet dark, three ticks running, seeds rot.",
  7: "Rot spreads into wet, dark, green neighbours and eats the green.",
  8: "Strong light kills rot.",
  9: "Rot eats ether where it finds it. That is the Moor's weapon.",
  10: "Thick rot in wind sends spore, which seeds rot where it lands in wet dark.",
  11: "Water runs to the lowest neighbour; slow water carries silt, fast water scours.",
  12: "Slow water over stone leaves silt; enough silt becomes stone.",
  13: "Fast water carries silt away.",
  14: "Cold on water is frost; it blocks flow and thaws with heat.",
  15: "Silver in stone, under great heat with ether, becomes glass.",
  16: "Glass passes light and gathers ether under the moon.",
  17: "Ether gathers along the ley lines up to what the line can hold, and pools spread slowly.",
  18: "Under a moon past half, open sky gains ether.",
  19: "A toppled cairn leaks its node's ether toward the moor.",
  20: "Reeds in slow water trap silt.",
  21: "Heat evens out between neighbours, a little each tick.",
  22: "Light spreads from its sources, stopped by stone and halved by dense growth.",
};
