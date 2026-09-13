import type { SignalCard, SourceHealth } from "@/lib/atlas";

/**
 * Wardrobe domain types at the browser boundary.
 *
 * Provenance rule (product contract §7): model suggestions are always kept
 * separate from user-confirmed values. A garment only becomes usable by
 * outfit logic once its status is "confirmed" — the UI mirrors the server
 * contract; it never decides ownership or confirmation policy.
 */

export type GarmentCategory =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "shoes"
  | "accessory"
  | "one_piece"
  | "underlayer"
  | "other";

export type GarmentStatus = "needs_confirmation" | "confirmed";

/** Where a structured attribute value came from. */
export type AttributeProvenance = "model_suggested" | "user_confirmed" | "seed";

export interface GarmentTag {
  value: string;
  provenance: AttributeProvenance;
}

export interface Garment {
  id: string;
  name: string;
  category: GarmentCategory;
  colors: string[];
  material?: string;
  pattern?: string;
  /** 0..3 */
  warmth: number;
  /** 0..3 */
  formality: number;
  seasons: string[];
  occasions: string[];
  /** User-entered purchase price in account currency (optional). */
  price?: number;
  currency?: string;
  wearCount: number;
  status: GarmentStatus;
  /** Analysis provenance for the garment record as a whole. */
  analysisProvider: "model" | "demo" | "seed" | "user";
  imageUrl?: string;
  /** Opaque server-side asset id (never a provider public_id). */
  imageRef?: string | null;
  imageAlt: string;
  addedAt: string;
  /** Correction history entries: what changed and who changed it. */
  correctionHistory: Array<{ field: string; from: string; to: string; by: AttributeProvenance; at: string }>;
}

/** A garment whose model-suggested tags await user confirmation. */
export interface PendingConfirmation {
  garment: Garment;
  suggestedTags: Record<string, { value: string; confidence: number; provenance: "model_suggested" }>;
}

export interface WardrobeSnapshot {
  mode: "demo" | "connected";
  demoLabel?: string;
  garments: Garment[];
  pending: PendingConfirmation[];
}

/* ---------------------------------------------------------------------------
 * Derived measures (display contract §5 of the product contract):
 * every derived number carries its inputs so the UI can show "why".
 * ------------------------------------------------------------------------- */

export interface CostPerWear {
  value: number;
  currency: string;
  basis: "confirmed_wears" | "no_wears_yet" | "price_unknown";
  price?: number;
  wears: number;
}

/**
 * Cost per wear from confirmed wear events only. Never fabricates a number:
 * without a price or without wears the result is explicitly "unknown".
 */
export function costPerWear(garment: Garment): CostPerWear {
  const currency = garment.currency ?? "USD";
  if (garment.price === undefined || garment.price <= 0) {
    return { value: 0, currency, basis: "price_unknown", wears: garment.wearCount };
  }
  if (garment.wearCount <= 0) {
    return { value: 0, currency, basis: "no_wears_yet", price: garment.price, wears: 0 };
  }
  return {
    value: garment.price / garment.wearCount,
    currency,
    basis: "confirmed_wears",
    price: garment.price,
    wears: garment.wearCount,
  };
}

/* ---------------------------------------------------------------------------
 * Filtering (pure functions; URL-stateful filters in the page mirror these)
 * ------------------------------------------------------------------------- */

export interface WardrobeFilters {
  category: GarmentCategory | "all";
  occasion: string | "all";
  color: string | "all";
  query: string;
}

export const DEFAULT_FILTERS: WardrobeFilters = {
  category: "all",
  occasion: "all",
  color: "all",
  query: "",
};

export function filterGarments(
  garments: Garment[],
  filters: WardrobeFilters,
): Garment[] {
  const q = filters.query.trim().toLowerCase();
  return garments.filter((g) => {
    if (filters.category !== "all" && g.category !== filters.category) return false;
    if (filters.occasion !== "all" && !g.occasions.includes(filters.occasion)) return false;
    if (
      filters.color !== "all" &&
      !g.colors.some((c) => c.toLowerCase() === filters.color.toLowerCase())
    ) {
      return false;
    }
    if (q) {
      const haystack = [g.name, g.material ?? "", g.pattern ?? "", ...g.colors]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function availableColors(garments: Garment[]): string[] {
  const set = new Set<string>();
  for (const g of garments) {
    for (const c of g.colors) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function availableOccasions(garments: Garment[]): string[] {
  const set = new Set<string>();
  for (const g of garments) {
    for (const o of g.occasions) set.add(o);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  top: "Tops",
  bottom: "Bottoms",
  dress: "Dresses",
  outerwear: "Outerwear",
  shoes: "Footwear",
  accessory: "Accessories",
  one_piece: "One-piece",
  underlayer: "Underlayers",
  other: "Other",
};

/* ---------------------------------------------------------------------------
 * Upload state machine (frontend projection of the server contract)
 * ------------------------------------------------------------------------- */

export type UploadState =
  | { phase: "idle" }
  | { phase: "picked"; fileName: string; sizeBytes: number; mimeType: string }
  | { phase: "uploading"; fileName: string; progress: number }
  | { phase: "analyzing"; fileName: string }
  | { phase: "review_required"; pending: PendingConfirmation }
  | { phase: "resolved"; garmentId: string }
  | { phase: "error_retry"; reason: string };

export const UPLOAD_PHASES: UploadState["phase"][] = [
  "idle",
  "picked",
  "uploading",
  "analyzing",
  "review_required",
  "resolved",
  "error_retry",
];

/** Client-side pre-validation mirroring the server's documented limits. */
export const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"] as const,
} as const;

export function validateUpload(
  fileName: string,
  sizeBytes: number,
  mimeType: string,
): { ok: true } | { ok: false; reason: string } {
  if (!UPLOAD_LIMITS.allowedMimeTypes.includes(mimeType as never)) {
    return { ok: false, reason: "Unsupported format — use JPEG, PNG, WebP, or HEIC." };
  }
  if (sizeBytes > UPLOAD_LIMITS.maxBytes) {
    return { ok: false, reason: "Image is larger than 8 MB — try a smaller capture." };
  }
  if (sizeBytes <= 0) {
    return { ok: false, reason: "That file looks empty." };
  }
  void fileName;
  return { ok: true };
}

/* ---------------------------------------------------------------------------
 * Inbox command-center additions (restrained; no vanity metrics)
 * ------------------------------------------------------------------------- */

export interface AnnualizedSummary {
  totalAnnualized: number;
  currency: string;
  cadenceAssumption: string;
  subscriptionCount: number;
  refreshedAt: string;
}

export interface UrgentAction {
  id: string;
  title: string;
  detail: string;
  href: string;
  urgency: SignalCard["urgency"];
}

export interface CommandStripData {
  wardrobeValue?: { value: number; currency: string; itemCount: number };
  annualizedDrain?: AnnualizedSummary;
  averageCPW?: CostPerWear & { garmentCount: number };
  urgent: UrgentAction[];
  sources: SourceHealth[];
}
