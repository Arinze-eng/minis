import type { Doc, Id } from "../_generated/dataModel";
import type { Category } from "../shared/domain";

type Item = Pick<Doc<"items">, "_id" | "name" | "category" | "seasons" | "laundry" | "wearCount" | "lastWornAt" | "colours">;
export type Day = { date: string; maxC: number; minC: number; rainChance: number };

/** Clean first, then least recently worn, then least worn — so suggestions rotate the closet. */
function rank(items: Item[], category: Category, season?: string): Item[] {
  return items
    .filter((i) => i.category === category && i.laundry !== "in_wash")
    .sort(
      (a, b) =>
        Number(a.laundry !== "clean") - Number(b.laundry !== "clean") ||
        Number(season ? !a.seasons.includes(season as never) : 0) - Number(season ? !b.seasons.includes(season as never) : 0) ||
        (a.lastWornAt ?? 0) - (b.lastWornAt ?? 0) ||
        a.wearCount - b.wearCount,
    );
}

export function seasonFor(maxC: number): "winter" | "spring" | "summer" {
  return maxC < 12 ? "winter" : maxC > 24 ? "summer" : "spring";
}

/** One outfit for the day: dress or top+bottom, shoes, and a layer when it's cool or wet. */
export function pickOutfit(items: Item[], day?: Pick<Day, "maxC" | "minC" | "rainChance">) {
  const season = day ? seasonFor(day.maxC) : undefined;
  const top = rank(items, "top", season)[0];
  const bottom = rank(items, "bottom", season)[0];
  const dress = rank(items, "dress", season)[0];
  const useDress = (!top || !bottom) && dress;
  const needsLayer = day ? day.minC < 14 || day.rainChance >= 50 : false;
  const slots = {
    top: useDress ? undefined : top?._id,
    bottom: useDress ? undefined : bottom?._id,
    dress: useDress ? dress._id : undefined,
    shoes: rank(items, "shoes", season)[0]?._id,
    outerwear: needsLayer ? rank(items, "outerwear", season)[0]?._id : undefined,
    accessories: [] as Id<"items">[],
  };
  const complete = Boolean((slots.dress || (slots.top && slots.bottom)) && slots.shoes);
  return { slots, complete };
}

/** Packing list for a trip: counts scale with length, layers follow the forecast; gaps say what's missing. */
export function packFor(items: Item[], days: Day[], nights: number) {
  const n = Math.max(1, nights);
  const coldest = days.length ? Math.min(...days.map((d) => d.minC)) : 15;
  const warmest = days.length ? Math.max(...days.map((d) => d.maxC)) : 20;
  const wet = days.some((d) => d.rainChance >= 50);
  const season = seasonFor(warmest);
  const want: [Category, number][] = [
    ["top", Math.min(n, 6)],
    ["bottom", Math.min(Math.ceil(n / 3), 3)],
    ["shoes", n > 4 ? 2 : 1],
    ["outerwear", coldest < 14 || wet ? 1 : 0],
  ];
  const picked: Id<"items">[] = [];
  const gaps: string[] = [];
  for (const [category, count] of want) {
    const found = rank(items, category, season).slice(0, count);
    picked.push(...found.map((i) => i._id));
    if (found.length < count) gaps.push(`${count - found.length} more ${category === "shoes" ? "pair of shoes" : category}${count - found.length > 1 && category !== "shoes" ? "s" : ""}`);
  }
  const notes: string[] = [];
  if (days.length) notes.push(`Expect ${Math.round(coldest)}–${Math.round(warmest)}°C.`);
  else notes.push("No forecast yet for these dates (forecasts reach about 16 days ahead), so this assumes mild weather.");
  if (wet) notes.push("Rain is likely on at least one day — pack a layer that copes with it.");
  if (coldest < 5) notes.push("It gets close to freezing: think warm layers and closed shoes.");
  return { itemIds: picked, gaps, notes };
}
