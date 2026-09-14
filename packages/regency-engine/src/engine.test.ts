import { describe, it, expect } from "vitest";
import {
  initialGame,
  finishTurn,
  validateWorld,
  validatePeople,
} from "./index.js";
const narration = {
  scene: null,
  title: "By the water",
  response: "Nell loosens the rope.",
  suggestions: ["Tell me more."],
};
describe("open conversational kingdom", () => {
  it("answers a question without spending resources, moving the player or advancing a season", () => {
    const g = initialGame(),
      cast = {
        people: g.people,
        dialogue: [
          { speaker: "Mara", text: "I’ve always wanted to see the sea." },
        ],
      };
    const next = finishTurn(
      g,
      "q",
      "What do you dream about?",
      narration,
      g.world,
      cast,
    );
    expect(next.world).toEqual(g.world);
    expect(next.scene).toBe(g.scene);
    expect(next.dialogue[0]?.text).toContain("sea");
    expect(next.history[0]?.wish).toContain("dream");
  });
  it("supports an invented location and person without adding an action enum or renderer feature", () => {
    const g = initialGame(),
      world = {
        ...g.world,
        location: "glasshouse",
        places: [
          ...g.world.places,
          {
            id: "glasshouse",
            name: "The glassmaker’s observatory",
            description: "Telescopes made of sea glass.",
            facts: ["A visitor studies migrating stars."],
          },
        ],
      };
    const people = [
      ...g.people,
      {
        id: "glassmaker",
        name: "Elian",
        role: "A wandering lens maker",
        place: "glasshouse",
        desire: "Find a lost constellation.",
        memory: ["The ruler asked to see the stars."],
      },
    ];
    const next = finishTurn(
      g,
      "go",
      "Visit a glassmaker",
      {
        ...narration,
        scene: {
          code: "ctx.fillStyle='#163c53';ctx.fillRect(0,0,1200,760);art.ellipse(600,400,150,150,'#8fbda5');",
          description: "A sea-glass observatory.",
        },
      },
      world,
      {
        people,
        dialogue: [{ speaker: "Elian", text: "Look through this one." }],
      },
    );
    expect(next.world.location).toBe("glasshouse");
    expect(next.world.places.find(p => p.id === "glasshouse")?.scene?.description).toBe("A sea-glass observatory.");
    expect(next.scene).toBe(g.scene);
    expect(g.world.places.some(p => p.scene)).toBe(false);
    expect(next.people.at(-1)?.id).toBe("glassmaker");
    expect(g.people).toHaveLength(3);
  });
  it("keeps references coherent while allowing arbitrary new facts", () => {
    const g = initialGame();
    expect(() => validateWorld({ ...g.world, location: "missing" })).toThrow();
    expect(() =>
      validatePeople(
        { people: g.people, dialogue: [{ speaker: "Nobody", text: "Hello" }] },
        g.world,
      ),
    ).toThrow();
  });
});
