import type { Garment, PendingConfirmation, WardrobeSnapshot } from "@/lib/wardrobe";

/**
 * Synthetic demo wardrobe — deterministic and clearly labelled, mirroring
 * `lib/demo/inbox.ts` rules. Nothing here is private or live data.
 */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const garments: Garment[] = [
  {
    id: "demo-boxy-oxford",
    name: "Boxy Oxford",
    category: "top",
    colors: ["soft blue"],
    material: "cotton poplin",
    pattern: "solid",
    warmth: 1,
    formality: 2,
    seasons: ["spring", "fall"],
    occasions: ["casual", "formal"],
    price: 68,
    currency: "USD",
    wearCount: 14,
    status: "confirmed",
    analysisProvider: "seed",
    imageAlt: "Soft blue boxy oxford shirt, folded flat-lay",
    addedAt: daysAgo(120),
    correctionHistory: [],
  },
  {
    id: "demo-pleated-trouser",
    name: "Pleated Trouser",
    category: "bottom",
    colors: ["charcoal"],
    material: "wool blend",
    warmth: 2,
    formality: 3,
    seasons: ["fall", "winter"],
    occasions: ["formal"],
    price: 95,
    currency: "USD",
    wearCount: 9,
    status: "confirmed",
    analysisProvider: "seed",
    imageAlt: "Charcoal pleated trousers on hanger",
    addedAt: daysAgo(98),
    correctionHistory: [],
  },
  {
    id: "demo-utility-overshirt",
    name: "Utility Overshirt",
    category: "outerwear",
    colors: ["olive"],
    material: "cotton twill",
    warmth: 2,
    formality: 1,
    seasons: ["spring", "fall"],
    occasions: ["casual"],
    price: 82,
    currency: "USD",
    wearCount: 2,
    status: "confirmed",
    analysisProvider: "seed",
    imageAlt: "Olive utility overshirt, buttoned, flat-lay",
    addedAt: daysAgo(60),
    correctionHistory: [],
  },
  {
    id: "demo-retro-runner",
    name: "Retro Runner",
    category: "shoes",
    colors: ["cream", "green"],
    material: "suede + mesh",
    warmth: 0,
    formality: 1,
    seasons: ["spring", "summer", "fall"],
    occasions: ["casual"],
    price: 110,
    currency: "USD",
    wearCount: 31,
    status: "confirmed",
    analysisProvider: "seed",
    imageAlt: "Cream and green retro running sneakers, pair",
    addedAt: daysAgo(200),
    correctionHistory: [],
  },
  {
    id: "demo-merino-knit",
    name: "Merino Knit",
    category: "top",
    colors: ["warm sand"],
    material: "merino wool",
    warmth: 2,
    formality: 2,
    seasons: ["fall", "winter"],
    occasions: ["casual", "date night"],
    price: 89,
    currency: "USD",
    wearCount: 6,
    status: "confirmed",
    analysisProvider: "seed",
    imageAlt: "Warm sand merino crewneck knit, folded",
    addedAt: daysAgo(75),
    correctionHistory: [],
  },
  {
    id: "demo-straight-denim",
    name: "Straight Denim",
    category: "bottom",
    colors: ["washed indigo"],
    material: "denim",
    warmth: 1,
    formality: 1,
    seasons: ["all"],
    occasions: ["casual"],
    price: 74,
    currency: "USD",
    wearCount: 22,
    status: "confirmed",
    analysisProvider: "seed",
    imageAlt: "Washed indigo straight-leg jeans, folded",
    addedAt: daysAgo(150),
    correctionHistory: [],
  },
];

/** One item awaiting tag confirmation (model-suggested, unconfirmed). */
const pending: PendingConfirmation[] = [
  {
    garment: {
      id: "demo-rain-shell",
      name: "New wardrobe piece",
      category: "outerwear",
      colors: ["ink black"],
      warmth: 3,
      formality: 1,
      seasons: ["fall", "winter"],
      occasions: ["casual"],
      wearCount: 0,
      status: "needs_confirmation",
      analysisProvider: "demo",
      imageAlt: "Ink black rain shell, uploaded capture pending review",
      addedAt: daysAgo(1),
      correctionHistory: [],
    },
    suggestedTags: {
      name: { value: "Rain Shell", confidence: 0.72, provenance: "model_suggested" },
      category: { value: "outerwear", confidence: 0.9, provenance: "model_suggested" },
      colors: { value: "ink black", confidence: 0.81, provenance: "model_suggested" },
      material: { value: "waterproof shell (estimated)", confidence: 0.55, provenance: "model_suggested" },
      warmth: { value: "3", confidence: 0.63, provenance: "model_suggested" },
      formality: { value: "1", confidence: 0.7, provenance: "model_suggested" },
    },
  },
];

export function demoWardrobe(): WardrobeSnapshot {
  return {
    mode: "demo",
    demoLabel: "Demo wardrobe — synthetic garments on this device, nothing uploaded anywhere",
    garments,
    pending,
  };
}

export { daysAgo };
