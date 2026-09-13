import { describe, expect, it } from "vitest";
import {
  costPerWear,
  filterGarments,
  validateUpload,
  DEFAULT_FILTERS,
  UPLOAD_LIMITS,
  type Garment,
} from "@/lib/wardrobe";

function garment(overrides: Partial<Garment> = {}): Garment {
  return {
    id: "g1",
    name: "Test Top",
    category: "top",
    colors: ["blue"],
    warmth: 1,
    formality: 1,
    seasons: ["spring"],
    occasions: ["casual"],
    wearCount: 0,
    status: "confirmed",
    analysisProvider: "seed",
    imageAlt: "test garment",
    addedAt: new Date().toISOString(),
    correctionHistory: [],
    ...overrides,
  };
}

describe("cost per wear", () => {
  it("divides price by confirmed wears", () => {
    const cpw = costPerWear(garment({ price: 100, currency: "USD", wearCount: 4 }));
    expect(cpw).toMatchObject({ value: 25, basis: "confirmed_wears", price: 100, wears: 4 });
  });

  it("never fabricates a number without wears", () => {
    const cpw = costPerWear(garment({ price: 100, wearCount: 0 }));
    expect(cpw.basis).toBe("no_wears_yet");
    expect(cpw.value).toBe(0);
  });

  it("never fabricates a number without a price", () => {
    const cpw = costPerWear(garment({ wearCount: 5 }));
    expect(cpw.basis).toBe("price_unknown");
  });
});

describe("wardrobe filters", () => {
  const items = [
    garment({ id: "a", name: "Oxford", category: "top", colors: ["soft blue"], occasions: ["formal"], material: "cotton" }),
    garment({ id: "b", name: "Runner", category: "shoes", colors: ["green"], occasions: ["casual"] }),
    garment({ id: "c", name: "Denim", category: "bottom", colors: ["indigo"], occasions: ["casual"], pattern: "washed" }),
  ];

  it("filters by category", () => {
    expect(filterGarments(items, { ...DEFAULT_FILTERS, category: "shoes" }).map((g) => g.id)).toEqual(["b"]);
  });

  it("filters by occasion", () => {
    expect(filterGarments(items, { ...DEFAULT_FILTERS, occasion: "casual" }).map((g) => g.id)).toEqual(["b", "c"]);
  });

  it("matches query across name, material, pattern, and colors", () => {
    expect(filterGarments(items, { ...DEFAULT_FILTERS, query: "cotton" }).map((g) => g.id)).toEqual(["a"]);
    expect(filterGarments(items, { ...DEFAULT_FILTERS, query: "washed" }).map((g) => g.id)).toEqual(["c"]);
    expect(filterGarments(items, { ...DEFAULT_FILTERS, query: "GREEN" }).map((g) => g.id)).toEqual(["b"]);
  });

  it("combines filters", () => {
    expect(
      filterGarments(items, { ...DEFAULT_FILTERS, category: "top", occasion: "formal" }).map((g) => g.id),
    ).toEqual(["a"]);
  });
});

describe("upload validation", () => {
  it("accepts allowed types within size bounds", () => {
    expect(validateUpload("a.jpg", 1024, "image/jpeg")).toEqual({ ok: true });
    expect(validateUpload("a.webp", UPLOAD_LIMITS.maxBytes, "image/webp")).toEqual({ ok: true });
  });

  it("rejects unsupported mime types", () => {
    const result = validateUpload("a.gif", 1024, "image/gif");
    expect(result.ok).toBe(false);
  });

  it("rejects oversized files", () => {
    const result = validateUpload("a.png", UPLOAD_LIMITS.maxBytes + 1, "image/png");
    expect(result.ok).toBe(false);
  });

  it("rejects empty files", () => {
    expect(validateUpload("a.png", 0, "image/png").ok).toBe(false);
  });
});
