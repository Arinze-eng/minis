import type { Infer } from "convex/values";
import { CATEGORIES, FORMALITY, LIMITS, SEASONS, isCategory, type Formality, type Season } from "../shared/domain";
import type { vDetectedItem } from "../shared/validators";

/** Vision prompt + strict parsing for garment detection (adapted from Fitcheck's tuned prompt). Pure. */

export type DetectedItem = Infer<typeof vDetectedItem>;

export function detectionPrompt(): string {
  return [
    "You are cataloguing ONE photo for a personal digital wardrobe.",
    "List every distinct clothing item, pair of shoes, bag, hat or accessory that is visible, whether worn, folded, hanging or laid flat.",
    "One entry per physical item: a pair of shoes is one item; a two-piece suit is two items. Ignore anything not wearable.",
    `Return at most ${LIMITS.maxItemsPerPhoto} items, most prominent first. If nothing wearable is visible, return an empty list.`,
    "",
    "Answer with ONLY a JSON object of this exact shape, no prose:",
    '{"items":[{"name":"cream ribbed knit jumper","category":"top","subcategory":"crewneck jumper","colours":{"primary":"cream","secondary":[]},"pattern":"solid","material":"wool","seasons":["autumn","winter"],"formality":"casual","bbox":[0.1,0.2,0.6,0.9],"description":"the cream ribbed jumper worn on the left of the frame"}]}',
    "",
    `- category: exactly one of ${CATEGORIES.join(", ")}.`,
    `- seasons: every season it is genuinely wearable in, from ${SEASONS.join(", ")}.`,
    `- formality: exactly one of ${FORMALITY.join(", ")}.`,
    "- name: two to four shoppable words. Name a brand only if clearly legible.",
    "- bbox: [x0, y0, x1, y1] as fractions of width/height, 0,0 top-left; cover the whole item.",
    "- description: ONE sentence that isolates this exact item and where it sits in the frame.",
    "Be literal. Never invent brands, logos or details you cannot see. Do not describe the person.",
  ].join("\n");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function bbox(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 4) return [0, 0, 1, 1];
  // Some models answer in 0–1000 (Gemini style); normalise those.
  const scale = value.some((n) => typeof n === "number" && n > 1.5) ? 1000 : 1;
  const box = value.map((n) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n / scale)) : Number.NaN));
  if (box.some(Number.isNaN)) return [0, 0, 1, 1];
  const [x0, y0, x1, y1] = box as [number, number, number, number];
  return x1 - x0 < 0.02 || y1 - y0 < 0.02 ? [0, 0, 1, 1] : [x0, y0, x1, y1];
}

/** Tolerates code fences and prose around the JSON; drops anything malformed rather than guessing. */
export function parseDetection(raw: string): DetectedItem[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : [];
  return list
    .filter(isRecord)
    .slice(0, LIMITS.maxItemsPerPhoto)
    .map((item): DetectedItem => {
      const category = str(item.category, 20).toLowerCase();
      const colours = isRecord(item.colours) ? item.colours : {};
      const seasons = (Array.isArray(item.seasons) ? item.seasons : [])
        .map((s) => str(s, 10).toLowerCase())
        .filter((s): s is Season => (SEASONS as readonly string[]).includes(s));
      const formality = str(item.formality, 20).toLowerCase();
      return {
        name: str(item.name, 80) || "Unnamed piece",
        category: isCategory(category) ? category : "accessory",
        subcategory: str(item.subcategory, 60),
        colours: {
          primary: str(colours.primary, 30) || "unknown",
          secondary: (Array.isArray(colours.secondary) ? colours.secondary : []).map((c) => str(c, 30)).filter(Boolean).slice(0, 5),
          hex: [],
        },
        pattern: str(item.pattern, 40) || "solid",
        material: str(item.material, 40) || "unknown",
        seasons: seasons.length > 0 ? [...new Set(seasons)] : [...SEASONS],
        formality: (FORMALITY as readonly string[]).includes(formality) ? (formality as Formality) : "casual",
        description: str(item.description, 300),
        bbox: bbox(item.bbox),
      };
    })
    .filter((item) => item.description.length > 0);
}

export function searchTextOf(item: { name: string; subcategory: string; category: string; colours: { primary: string; secondary: string[] }; pattern: string; material: string; brand?: string; seasons: string[]; formality: string }): string {
  return [item.name, item.subcategory, item.category, item.colours.primary, ...item.colours.secondary, item.pattern, item.material, item.brand ?? "", ...item.seasons, item.formality]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
