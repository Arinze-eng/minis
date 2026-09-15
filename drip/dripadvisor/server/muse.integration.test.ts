import { describe, expect, it } from "vitest";
import { recommendOutfits } from "./muse";

describe("Muse Spark integration", () => {
  it("returns wardrobe-grounded outfit suggestions", async () => {
    if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not configured");
    const result = await recommendOutfits("something polished for a cool office day", [
      { name: "Boxy Oxford", category: "top", colors: ["soft blue"], warmth: 1, formality: 2 },
      { name: "Pleated Trouser", category: "bottom", colors: ["charcoal"], warmth: 1, formality: 2 },
      { name: "Retro Runner", category: "shoes", colors: ["cream", "green"], warmth: 0, formality: 1 },
    ]);
    expect(result.provider).toBe("muse");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]?.itemIndexes.every((index) => index >= 0 && index < 3)).toBe(true);
  }, 45_000);
});
