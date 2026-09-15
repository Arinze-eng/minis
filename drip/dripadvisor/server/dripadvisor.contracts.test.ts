import { describe, expect, it } from "vitest";
import {
  outfitFeedbackInputSchema,
  outfitRequestInputSchema,
  previewRequestInputSchema,
  previewStatusCopy,
  wardrobeItemInputSchema,
} from "./dripadvisor.contracts";

describe("DripAdvisor contracts", () => {
  it("accepts a user-confirmed wardrobe item with bounded attributes", () => {
    const result = wardrobeItemInputSchema.parse({
      name: "Navy overshirt",
      category: "outerwear",
      colors: ["navy"],
      warmth: 2,
      formality: 2,
    });

    expect(result.category).toBe("outerwear");
    expect(result.warmth).toBe(2);
  });

  it("rejects unsafe or unbounded garment values", () => {
    expect(() => wardrobeItemInputSchema.parse({
      name: "",
      category: "outerwear",
      colors: [],
      warmth: 8,
    })).toThrow();
  });

  it("accepts an outfit request without requiring authentication fields", () => {
    const result = outfitRequestInputSchema.parse({
      requestText: "Something polished for a cool office day",
      weather: { temperatureC: 19, condition: "clear" },
      includePreview: false,
    });

    expect(result.requestText).toContain("office");
    expect(result.includePreview).toBe(false);
  });

  it("requires explicit acknowledgement before a preview request", () => {
    const base = { outfitId: "11111111-1111-4111-8111-111111111111" };
    expect(() => previewRequestInputSchema.parse(base)).toThrow();
    expect(previewRequestInputSchema.parse({ ...base, noticeAccepted: true }).noticeAccepted).toBe(true);
  });

  it("keeps feedback decisions finite and preview status copy centralized", () => {
    const feedback = outfitFeedbackInputSchema.parse({
      outfitId: "11111111-1111-4111-8111-111111111111",
      decision: "saved",
    });

    expect(feedback.decision).toBe("saved");
    expect(previewStatusCopy.ready).toBe("Your preview is ready.");
  });
});
