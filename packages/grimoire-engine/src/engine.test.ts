import { describe, it, expect } from "vitest";
import { initialGame, finishTurn } from "./index.js";
const answer = (scene: unknown) => ({
  scene,
  title: "A new friend",
  response: "A spotted visitor lands.",
  suggestions: ["Who is she?", "Let’s follow her"],
});
describe("code-authored conversation", () => {
  it("accepts a newly invented creature and keeps it through a follow-up question", () => {
    const game = initialGame(),
      code =
        game.scene.code +
        "\nart.ellipse(600,500,20,28,'#c94339');art.ellipse(594,490,4,4,'black');";
    const next = finishTurn(
      game,
      "one",
      "Make a ladybug",
      answer({ code, description: "A red ladybug with black spots." }),
    );
    expect(next.scene.code).toBe(code);
    expect(game.scene.code).not.toBe(code);
    const chat = finishTurn(next, "two", "What is her name?", {
      ...answer(null),
      response: "I think she is called Pip.",
    });
    expect(chat.scene).toBe(next.scene);
    expect(chat.history.map((e) => e.wish)).toEqual([
      "Make a ladybug",
      "What is her name?",
    ]);
    expect(finishTurn(chat, "two", "What is her name?", answer(null))).toBe(
      chat,
    );
  });
  it("rejects syntax errors before persisting or executing generated code", () => {
    const game = initialGame();
    expect(() =>
      finishTurn(
        game,
        "bad",
        "Make magic",
        answer({ code: "const = broken;", description: "Broken" }),
      ),
    ).toThrow();
    expect(game.turn).toBe(0);
  });
  it("stores only the current source, not a full program in every conversation entry", () => {
    const g = initialGame();
    const next = finishTurn(g, "one", "Hello", answer(null));
    expect(next.history[0]).not.toHaveProperty("scene");
  });
});
