import { describe, expect, it } from "vitest";
import { listNeonGarments, listNeonOutfits, neonConfigured } from "./neon";

describe("Neon feature store", () => {
  it("bootstraps the feature schema and reads the preview owner scope", async () => {
    expect(neonConfigured()).toBe(true);
    const garments = await listNeonGarments(0);
    const outfits = await listNeonOutfits(0);
    expect(Array.isArray(garments)).toBe(true);
    expect(Array.isArray(outfits)).toBe(true);
  }, 30_000);
});
