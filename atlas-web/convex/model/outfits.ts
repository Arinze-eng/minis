import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { LAYER_ORDER, LIMITS, SLOT_CATEGORIES, type Slot } from "../shared/domain";
import type { vOutfitSlots } from "../shared/validators";

type Ctx = QueryCtx | MutationCtx;
export type OutfitSlots = Infer<typeof vOutfitSlots>;

export function slotIds(slots: OutfitSlots): Id<"items">[] {
  return [slots.outerwear, slots.top, slots.bottom, slots.dress, slots.shoes, ...slots.accessories].filter((id): id is Id<"items"> => Boolean(id));
}

/**
 * Every id must belong to the user, be ready, and fit its slot; a dress replaces top + bottom.
 * Returns readable problems (for the agent) or throws (for the UI) — Fitcheck's rule, same messages.
 */
export async function validateSlots(ctx: Ctx, user: Doc<"users">, slots: OutfitSlots, collect = false): Promise<string[]> {
  const problems: string[] = [];
  if (slots.accessories.length > LIMITS.maxAccessories) problems.push(`at most ${LIMITS.maxAccessories} accessories`);
  const check = async (slot: Slot, id?: Id<"items">) => {
    if (!id) return;
    const item = await ctx.db.get(id);
    if (!item || item.userId !== user._id) return problems.push(`${slot}: that piece is not in your wardrobe`);
    if (item.status !== "ready") return problems.push(`${slot}: "${item.name}" isn't ready yet`);
    if (!SLOT_CATEGORIES[slot].includes(item.category)) return problems.push(`${slot}: "${item.name}" is a ${item.category}, not ${slot}`);
  };
  await check("outerwear", slots.outerwear);
  await check("top", slots.top);
  await check("bottom", slots.bottom);
  await check("dress", slots.dress);
  await check("shoes", slots.shoes);
  for (const id of slots.accessories) await check("accessories", id);
  if (slots.dress && (slots.top || slots.bottom)) problems.push("a dress replaces the top and bottom");
  if (slotIds(slots).length === 0) problems.push("an outfit needs at least one piece");
  if (problems.length > 0 && !collect) throw appError("INVALID_INPUT", problems[0]!, { problems });
  return problems;
}

/** Items in try-on layer order (inner → outer) with their slot. Missing items are skipped. */
export async function layered(ctx: Ctx, slots: OutfitSlots): Promise<Array<{ slot: Slot; item: Doc<"items"> }>> {
  const out: Array<{ slot: Slot; item: Doc<"items"> }> = [];
  for (const slot of LAYER_ORDER) {
    const ids = slot === "accessories" ? slots.accessories : slots[slot] ? [slots[slot]!] : [];
    for (const id of ids) {
      const item = await ctx.db.get(id);
      if (item) out.push({ slot, item });
    }
  }
  return out;
}
