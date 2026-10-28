import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { layered, validateSlots } from "./model/outfits";
import { vOutfitSlots } from "./shared/validators";

export async function outfitView(ctx: QueryCtx, outfit: Doc<"outfits">) {
  const pieces = await Promise.all(
    (await layered(ctx, outfit.slots)).map(async ({ slot, item }) => ({
      slot,
      _id: item._id,
      name: item.name,
      category: item.category,
      url: item.storageId ? await ctx.storage.getUrl(item.storageId) : null,
    })),
  );
  const cover = (await ctx.db.query("renders").withIndex("by_outfit", (q) => q.eq("outfitId", outfit._id)).order("desc").take(10)).find(
    (r) => r.status === "done" && r.storageId,
  );
  return { ...outfit, pieces, coverUrl: cover?.storageId ? await ctx.storage.getUrl(cover.storageId) : null };
}

/** Saved outfits, newest first. Agent proposals stay out until saved. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("outfits")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", user._id).gt("savedAt", 0))
      .order("desc")
      .take(100);
    return Promise.all(rows.map((o) => outfitView(ctx, o)));
  },
});

export const get = query({
  args: { outfitId: v.string() },
  handler: async (ctx, { outfitId }) => {
    const user = await requireUser(ctx);
    const id = ctx.db.normalizeId("outfits", outfitId);
    const outfit = id ? await ctx.db.get(id) : null;
    if (!outfit || outfit.userId !== user._id) return null;
    return outfitView(ctx, outfit);
  },
});

export const create = mutation({
  args: { name: v.string(), slots: vOutfitSlots, occasion: v.optional(v.string()) },
  returns: v.id("outfits"),
  handler: async (ctx, { name, slots, occasion }) => {
    const user = await requireUser(ctx);
    await validateSlots(ctx, user, slots);
    const now = Date.now();
    return ctx.db.insert("outfits", {
      userId: user._id,
      name: name.trim().slice(0, 60) || "Untitled outfit",
      slots,
      occasion: occasion?.trim().slice(0, 60) || undefined,
      source: "manual",
      savedAt: now,
      wearCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { outfitId: v.id("outfits"), name: v.optional(v.string()), slots: v.optional(vOutfitSlots), occasion: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { outfitId, name, slots, occasion }) => {
    const user = await requireUser(ctx);
    const outfit = assertOwner(await ctx.db.get(outfitId), user, "outfit");
    if (slots) await validateSlots(ctx, user, slots);
    await ctx.db.patch(outfit._id, {
      ...(name !== undefined ? { name: name.trim().slice(0, 60) || outfit.name } : {}),
      ...(slots ? { slots } : {}),
      ...(occasion !== undefined ? { occasion: occasion.trim().slice(0, 60) || undefined } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Keep an agent proposal in the saved list. */
export const save = mutation({
  args: { outfitId: v.id("outfits") },
  returns: v.null(),
  handler: async (ctx, { outfitId }) => {
    const user = await requireUser(ctx);
    const outfit = assertOwner(await ctx.db.get(outfitId), user, "outfit");
    if (!outfit.savedAt) await ctx.db.patch(outfit._id, { savedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

/** Deletes the outfit and its renders (files too). Blocked while a try-on of it is still running. */
export const remove = mutation({
  args: { outfitId: v.id("outfits") },
  returns: v.null(),
  handler: async (ctx, { outfitId }) => {
    const user = await requireUser(ctx);
    const outfit = assertOwner(await ctx.db.get(outfitId), user, "outfit");
    const renders = await ctx.db.query("renders").withIndex("by_outfit", (q) => q.eq("outfitId", outfit._id)).take(200);
    if (renders.some((r) => r.status === "pending")) throw appError("CONFLICT", "Wait for the try-on to finish before deleting this outfit.");
    for (const render of renders) {
      if (render.storageId) await ctx.storage.delete(render.storageId);
      await ctx.db.delete(render._id);
    }
    await ctx.db.delete(outfit._id);
    return null;
  },
});
