import { v, type VLiteral, type VUnion } from "convex/values";
import {
  CATEGORIES,
  FINDING_STATES,
  FITS,
  FORMALITY,
  ITEM_STATUSES,
  JOB_STATUSES,
  JOB_TYPES,
  LAUNDRY_STATES,
  PRESENTATIONS,
  SEASONS,
  SIGNAL_STATES,
  STEP_STATUSES,
  UPLOAD_STATUSES,
} from "./domain";

type LiteralUnion<T extends readonly string[]> = VUnion<T[number], VLiteral<T[number]>[]>;

/** `v.union(v.literal(...))` from a readonly tuple, so enums live in one place (Fitcheck pattern). */
export function literals<const T extends readonly string[]>(values: T): LiteralUnion<T> {
  const members = values.map((value) => v.literal(value)) as VLiteral<T[number]>[];
  return v.union(...members) as unknown as LiteralUnion<T>;
}

export const vCategory = literals(CATEGORIES);
export const vSeason = literals(SEASONS);
export const vFormality = literals(FORMALITY);
export const vFit = literals(FITS);
export const vPresentation = literals(PRESENTATIONS);
export const vItemStatus = literals(ITEM_STATUSES);
export const vLaundry = literals(LAUNDRY_STATES);
export const vUploadStatus = literals(UPLOAD_STATUSES);
export const vJobType = literals(JOB_TYPES);
export const vJobStatus = literals(JOB_STATUSES);
export const vStepStatus = literals(STEP_STATUSES);
export const vSignalState = literals(SIGNAL_STATES);
export const vFindingState = literals(FINDING_STATES);

export const vColours = v.object({ primary: v.string(), secondary: v.array(v.string()), hex: v.array(v.string()) });

/** Attributes produced by detection and editable by the user. */
export const vItemAttributes = v.object({
  name: v.string(),
  category: vCategory,
  subcategory: v.string(),
  colours: vColours,
  pattern: v.string(),
  material: v.string(),
  seasons: v.array(vSeason),
  formality: vFormality,
  description: v.string(),
});

export const vDetectedItem = v.object({ ...vItemAttributes.fields, bbox: v.array(v.number()) });

export const vOutfitSlots = v.object({
  outerwear: v.optional(v.id("items")),
  top: v.optional(v.id("items")),
  bottom: v.optional(v.id("items")),
  dress: v.optional(v.id("items")),
  shoes: v.optional(v.id("items")),
  accessories: v.array(v.id("items")),
});

export const vJobStep = v.object({
  key: v.string(),
  label: v.string(),
  status: vStepStatus,
  error: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
});

export const vPrefs = v.object({
  presentation: vPresentation,
  fit: vFit,
  avoidColours: v.array(v.string()),
  homeCity: v.optional(v.string()),
  timezone: v.optional(v.string()),
  quietHoursEnabled: v.boolean(),
  quietStart: v.string(),
  quietEnd: v.string(),
  morningOutfit: v.boolean(),
  morningHour: v.number(),
  telegramChatId: v.optional(v.string()),
});

export const DEFAULT_PREFS = {
  presentation: "neutral" as const,
  fit: "regular" as const,
  avoidColours: [] as string[],
  quietHoursEnabled: true,
  quietStart: "22:00",
  quietEnd: "07:30",
  morningOutfit: true,
  morningHour: 7,
};

export const vEvidence = v.array(v.object({ label: v.string(), detail: v.string() }));
export const vAction = v.object({ label: v.string(), href: v.string() });
