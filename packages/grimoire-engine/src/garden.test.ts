import { describe, it, expect } from "vitest";
import {
  initialGarden,
  pulseGarden,
  visitResident,
  validateGarden,
} from "./garden.js";
describe("a garden to become attached to", () => {
  it("residents seek habitats that suit them and settle into persistent homes", () => {
    const g = initialGarden(),
      sol = g.residents[0]!;
    const bank = g.habitats.find((h) => h.id === "bank")!;
    bank.shade = 0.8;
    bank.shelter = 0.8;
    for (let i = 0; i < 4; i++) pulseGarden(g, []);
    expect(sol.home).toBe("bank");
    expect(g.discoveries.some((d) => d.id === "home-sol")).toBe(true);
    expect(sol.x).toBeGreaterThan(650);
  });
  it("visits build recognition once per day without rewarding repetitive clicking", () => {
    const g = initialGarden();
    visitResident(g, "sol");
    const bond = g.residents[0]!.attachment;
    for (let i = 0; i < 10; i++) visitResident(g, "sol");
    expect(g.residents[0]!.attachment).toBe(bond);
    for (let i = 0; i < 4; i++) pulseGarden(g, []);
    visitResident(g, "sol");
    expect(g.residents[0]!.attachment).toBeGreaterThan(bond);
  });
  it("does not advance time on questions or absence, and accepts invented forms and traits", () => {
    const g = initialGarden();
    g.residents.push({
      ...g.residents[0]!,
      id: "cloud-whale",
      name: "Aster",
      form: "a pocket cloud whale",
      traits: { rainSong: true },
    });
    expect(validateGarden(g).residents.at(-1)!.form).toContain("whale");
    expect(g.day).toBe(1);
    expect(g.phase).toBe(2);
  });
});
