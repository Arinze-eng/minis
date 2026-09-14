import { z } from "zod";

export const garmentCategorySchema = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
  "one_piece",
  "underlayer",
  "other",
]);

export const wardrobeItemInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: garmentCategorySchema,
  colors: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  pattern: z.string().trim().max(80).optional(),
  material: z.string().trim().max(80).optional(),
  warmth: z.number().int().min(0).max(3).default(1),
  formality: z.number().int().min(0).max(3).default(1),
  sourceAssetId: z.string().uuid().optional(),
});

export const outfitRequestInputSchema = z.object({
  requestText: z.string().trim().min(1).max(4000),
  occasion: z.string().trim().max(120).optional(),
  location: z.string().trim().max(160).optional(),
  weather: z.object({
    temperatureC: z.number().optional(),
    precipitationProbability: z.number().min(0).max(100).optional(),
    condition: z.string().max(100).optional(),
  }).optional(),
  includePreview: z.boolean().default(false),
  wardrobeItemIds: z.array(z.string().uuid()).max(50).optional(),
});

export const previewRequestInputSchema = z.object({
  outfitId: z.string().uuid(),
  referenceAssetId: z.string().uuid().optional(),
  noticeAccepted: z.literal(true),
});

export const outfitFeedbackInputSchema = z.object({
  outfitId: z.string().uuid(),
  previewId: z.string().uuid().optional(),
  decision: z.enum(["saved", "rejected", "tried_again", "reported"]),
  reason: z.string().trim().max(2000).optional(),
});

export type WardrobeItemInput = z.infer<typeof wardrobeItemInputSchema>;
export type OutfitRequestInput = z.infer<typeof outfitRequestInputSchema>;
export type PreviewRequestInput = z.infer<typeof previewRequestInputSchema>;
export type OutfitFeedbackInput = z.infer<typeof outfitFeedbackInputSchema>;

export const previewStatusCopy = {
  queued: "Your preview is queued.",
  analyzing: "Muse Spark is checking the selected pieces.",
  rendering: "Muse Image is preparing a visual approximation.",
  ready: "Your preview is ready.",
  failed: "The preview could not be generated. Try again with fewer reference images.",
} as const;
