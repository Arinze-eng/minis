import type { Doc } from "../_generated/dataModel";
import { CATEGORIES, CATEGORY_LABELS, FORMALITY, SEASONS } from "../shared/domain";

type Item = Pick<Doc<"items">, "category" | "seasons" | "formality" | "colours">;

/**
 * What this wardrobe can't dress: counts by category, season and formality, the colour spread, and
 * plain gaps ("no shoes", "no outerwear for winter"), so the stylist names a real missing piece
 * instead of inventing one.
 */
export function summariseGaps(items: Item[]) {
  const byCategory = CATEGORIES.map((category) => ({ category, label: CATEGORY_LABELS[category], count: items.filter((i) => i.category === category).length }));
  const bySeason = SEASONS.map((season) => {
    const inSeason = items.filter((i) => i.seasons.includes(season));
    return { season, count: inSeason.length, outerwear: inSeason.filter((i) => i.category === "outerwear").length };
  });
  const byFormality = FORMALITY.map((formality) => ({ formality, count: items.filter((i) => i.formality === formality).length }));
  const colourCounts = new Map<string, number>();
  for (const item of items) {
    const colour = item.colours.primary.trim().toLowerCase();
    if (colour) colourCounts.set(colour, (colourCounts.get(colour) ?? 0) + 1);
  }
  const colours = [...colourCounts.entries()]
    .map(([colour, count]) => ({ colour, count }))
    .sort((a, b) => b.count - a.count || a.colour.localeCompare(b.colour))
    .slice(0, 6);

  const count = (category: string) => byCategory.find((c) => c.category === category)?.count ?? 0;
  const gaps: string[] = [];
  if (items.length === 0) gaps.push("the wardrobe is empty");
  else {
    if (count("shoes") === 0) gaps.push("no shoes");
    if (count("top") === 0 && count("dress") === 0) gaps.push("no tops or dresses");
    if (count("bottom") === 0 && count("dress") === 0) gaps.push("no bottoms or dresses");
    if (count("outerwear") === 0) gaps.push("no outerwear");
    else if ((bySeason.find((s) => s.season === "winter")?.outerwear ?? 0) === 0) gaps.push("no outerwear for winter");
    if ((byFormality.find((f) => f.formality === "formal")?.count ?? 0) === 0) gaps.push("nothing formal");
    if (colours.length > 0 && colours[0]!.count / items.length > 0.6) gaps.push(`mostly ${colours[0]!.colour}; little colour variety`);
  }
  return { total: items.length, byCategory, bySeason, byFormality, colours, gaps };
}
