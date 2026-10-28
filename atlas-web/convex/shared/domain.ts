/**
 * Domain vocabulary shared by Convex functions, the stylist agent and the UI. One place, so the
 * client, the agent and the database always agree.
 */

export const CATEGORIES = ["top", "bottom", "outerwear", "dress", "shoes", "accessory", "bag", "headwear"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Tops",
  bottom: "Bottoms",
  outerwear: "Outerwear",
  dress: "Dresses",
  shoes: "Shoes",
  accessory: "Accessories",
  bag: "Bags",
  headwear: "Headwear",
};

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const FORMALITY = ["casual", "smart-casual", "formal"] as const;
export type Formality = (typeof FORMALITY)[number];

export const FITS = ["slim", "regular", "relaxed", "oversized"] as const;
export const PRESENTATIONS = ["masculine", "feminine", "neutral"] as const;

export const ITEM_STATUSES = ["extracting", "ready", "failed", "hidden"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const LAUNDRY_STATES = ["clean", "worn", "in_wash"] as const;
export type LaundryState = (typeof LAUNDRY_STATES)[number];

/** Builder slots; `dress` replaces top + bottom. */
export const SLOTS = ["outerwear", "top", "bottom", "dress", "shoes", "accessories"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_CATEGORIES: Record<Slot, readonly Category[]> = {
  outerwear: ["outerwear"],
  top: ["top"],
  bottom: ["bottom"],
  dress: ["dress"],
  shoes: ["shoes"],
  accessories: ["accessory", "bag", "headwear"],
};

/** Layer order for try-on: inner to outer. */
export const LAYER_ORDER: readonly Slot[] = ["dress", "bottom", "top", "outerwear", "shoes", "accessories"];

export const UPLOAD_STATUSES = ["queued", "detecting", "awaiting_selection", "extracting", "done", "failed"] as const;

export const JOB_TYPES = ["scan", "extract", "tryon", "gmail_scan"] as const;
export const JOB_STATUSES = ["queued", "running", "done", "partial", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const STEP_STATUSES = ["pending", "running", "done", "failed", "skipped"] as const;

export const SIGNAL_STATES = ["active", "snoozed", "dismissed", "done"] as const;
export const FINDING_STATES = ["active", "kept", "ignored", "cancel_prepared"] as const;

export const CONSENT_SCOPES = ["garment_image_analysis", "person_image_use", "gmail_read", "telegram_delivery"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const LIMITS = {
  maxPhotosPerBatch: 20,
  maxItemsPerPhoto: 12,
  maxItemsPerUser: 1500,
  maxRunningJobsPerUser: 3,
  maxAccessories: 4,
  maxAvatars: 3,
  maxRendersPerRequest: 2,
  shareLinkDays: 7,
  approvalMinutes: 10,
} as const;

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function slotForCategory(category: Category): Slot {
  for (const slot of SLOTS) if (SLOT_CATEGORIES[slot].includes(category)) return slot;
  return "accessories";
}
