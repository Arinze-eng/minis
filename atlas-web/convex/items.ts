import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./model/core";
import { searchTextOf } from "./model/detect";
import { createJob } from "./model/jobs";
import { syncSignals } from "./model/signals";
import { visionPool } from "./pools";
import { LIMITS } from "./shared/domain";
import { vCategory, vColours, vFit, vFormality, vItemStatus, vLaundry, vSeason } from "./shared/validators";

export async function itemView(ctx: QueryCtx, item: Doc<"items">) {
  return { ...item, url: item.storageId ? await ctx.storage.getUrl(item.storageId) : null };
}

export const list = query({
  args: { status: v.optional(vItemStatus), category: v.optional(vCategory), laundry: v.optional(vLaundry) },
  handler: async (ctx, { status, category, laundry }) => {
    const user = await requireUser(ctx);
    const rows = category
      ? (await ctx.db.query("items").withIndex("by_user_category", (q) => q.eq("userId", user._id).eq("category", category)).take(LIMITS.maxItemsPerUser)).filter(
          (i) => i.status === (status ?? "ready"),
        )
      : await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", status ?? "ready")).take(LIMITS.maxItemsPerUser);
    const filtered = laundry ? rows.filter((i) => i.laundry === laundry) : rows;
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(filtered.map((item) => itemView(ctx, item)));
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const ready = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "ready")).take(LIMITS.maxItemsPerUser);
    const priced = ready.filter((i) => i.price);
    return {
      ready: ready.length,
      worn: ready.filter((i) => i.laundry !== "clean").length,
      value: priced.reduce((sum, i) => sum + (i.price ?? 0), 0),
      wears: ready.reduce((sum, i) => sum + i.wearCount, 0),
      pricedWears: priced.reduce((sum, i) => sum + i.wearCount, 0),
    };
  },
});

export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const user = await requireUser(ctx);
    const term = text.trim().toLowerCase().slice(0, 64);
    if (!term) return [];
    const rows = await ctx.db
      .query("items")
      .withSearchIndex("search_text", (q) => q.search("searchText", term).eq("userId", user._id).eq("status", "ready"))
      .take(50);
    return Promise.all(rows.map((item) => itemView(ctx, item)));
  },
});

/** Raw id from the URL: malformed, unknown or foreign ids return null (not-found page, no throw). */
export const get = query({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const user = await requireUser(ctx);
    const id = ctx.db.normalizeId("items", itemId);
    const item = id ? await ctx.db.get(id) : null;
    if (!item || item.userId !== user._id) return null;
    const upload = item.uploadId ? await ctx.db.get(item.uploadId) : null;
    const duplicate = item.duplicateOfId ? await ctx.db.get(item.duplicateOfId) : null;
    const outfits = (await ctx.db.query("outfits").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(300)).filter((o) =>
      [o.slots.outerwear, o.slots.top, o.slots.bottom, o.slots.dress, o.slots.shoes, ...o.slots.accessories].includes(item._id),
    );
    return {
      item: await itemView(ctx, item),
      sourceUrl: upload ? await ctx.storage.getUrl(upload.storageId) : null,
      duplicateOf: duplicate && duplicate.userId === user._id ? await itemView(ctx, duplicate) : null,
      outfits: outfits.map((o) => ({ _id: o._id, name: o.name })),
    };
  },
});

export const update = mutation({
  args: {
    itemId: v.id("items"),
    patch: v.object({
      name: v.optional(v.string()),
      category: v.optional(vCategory),
      subcategory: v.optional(v.string()),
      colours: v.optional(vColours),
      pattern: v.optional(v.string()),
      material: v.optional(v.string()),
      seasons: v.optional(v.array(vSeason)),
      formality: v.optional(vFormality),
      fit: v.optional(vFit),
      brand: v.optional(v.string()),
      notes: v.optional(v.string()),
      price: v.optional(v.number()),
      currency: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { itemId, patch }) => {
    const user = await requireUser(ctx);
    const item = assertOwner(await ctx.db.get(itemId), user, "item");
    if (patch.price !== undefined && !(patch.price >= 0 && patch.price <= 1_000_000)) throw appError("INVALID_INPUT", "Enter a price between 0 and 1,000,000.");
    const clean = {
      ...patch,
      name: patch.name?.trim().slice(0, 80) || undefined,
      subcategory: patch.subcategory?.trim().slice(0, 60),
      pattern: patch.pattern?.trim().slice(0, 40),
      material: patch.material?.trim().slice(0, 40),
      brand: patch.brand?.trim().slice(0, 60),
      notes: patch.notes?.trim().slice(0, 500),
      currency: patch.currency?.trim().toUpperCase().slice(0, 3),
    };
    const next = { ...item, ...Object.fromEntries(Object.entries(clean).filter(([, value]) => value !== undefined)) } as Doc<"items">;
    await ctx.db.patch(item._id, { ...Object.fromEntries(Object.entries(clean).filter(([, value]) => value !== undefined)), searchText: searchTextOf(next), updatedAt: Date.now() });
    await syncSignals(ctx, user._id);
    return null;
  },
});

export const setStatus = mutation({
  args: { itemIds: v.array(v.id("items")), status: v.union(v.literal("hidden"), v.literal("ready")) },
  returns: v.null(),
  handler: async (ctx, { itemIds, status }) => {
    const user = await requireUser(ctx);
    for (const id of itemIds.slice(0, 200)) {
      const item = assertOwner(await ctx.db.get(id), user, "item");
      if (item.status === "ready" || item.status === "hidden") await ctx.db.patch(item._id, { status, updatedAt: Date.now() });
    }
    return null;
  },
});

export const setLaundry = mutation({
  args: { itemIds: v.array(v.id("items")), laundry: vLaundry },
  returns: v.null(),
  handler: async (ctx, { itemIds, laundry }) => {
    const user = await requireUser(ctx);
    for (const id of itemIds.slice(0, 200)) {
      const item = assertOwner(await ctx.db.get(id), user, "item");
      await ctx.db.patch(item._id, { laundry, updatedAt: Date.now() });
    }
    await syncSignals(ctx, user._id);
    return null;
  },
});

/** Removes items from every outfit slot that used them. Bounded by the outfit read cap. */
async function stripFromOutfits(ctx: MutationCtx, userId: Id<"users">, removed: Set<Id<"items">>) {
  for (const outfit of await ctx.db.query("outfits").withIndex("by_user", (q) => q.eq("userId", userId)).take(1000)) {
    const s = outfit.slots;
    const drop = (id?: Id<"items">) => (id && removed.has(id) ? undefined : id);
    const next = { outerwear: drop(s.outerwear), top: drop(s.top), bottom: drop(s.bottom), dress: drop(s.dress), shoes: drop(s.shoes), accessories: s.accessories.filter((id) => !removed.has(id)) };
    if (JSON.stringify(next) !== JSON.stringify(s)) await ctx.db.patch(outfit._id, { slots: next, updatedAt: Date.now() });
  }
}

export const remove = mutation({
  args: { itemIds: v.array(v.id("items")) },
  returns: v.null(),
  handler: async (ctx, { itemIds }) => {
    const user = await requireUser(ctx);
    const removed = new Set<Id<"items">>();
    for (const id of itemIds.slice(0, 200)) {
      const item = assertOwner(await ctx.db.get(id), user, "item");
      if (item.storageId) await ctx.storage.delete(item.storageId);
      await ctx.db.delete(item._id);
      removed.add(item._id);
    }
    await stripFromOutfits(ctx, user._id, removed);
    await audit(ctx, user._id, "items_deleted", undefined, { count: removed.size });
    await syncSignals(ctx, user._id);
    return null;
  },
});

/**
 * Log a wear for one or more pieces (optionally as an outfit). Idempotent per key: a double tap or a
 * retried request counts once. Worn pieces move to the laundry pile.
 */
export const markWorn = mutation({
  args: { itemIds: v.array(v.id("items")), idempotencyKey: v.string(), outfitId: v.optional(v.id("outfits")) },
  returns: v.object({ duplicate: v.boolean() }),
  handler: async (ctx, { itemIds, idempotencyKey, outfitId }) => {
    const user = await requireUser(ctx);
    const key = idempotencyKey.slice(0, 120);
    const seen = await ctx.db.query("wearEvents").withIndex("by_user_key", (q) => q.eq("userId", user._id).eq("idempotencyKey", key)).unique();
    if (seen) return { duplicate: true };
    const now = Date.now();
    const unique = [...new Set(itemIds)].slice(0, 12);
    for (const id of unique) {
      const item = assertOwner(await ctx.db.get(id), user, "item");
      await ctx.db.patch(item._id, { wearCount: item.wearCount + 1, lastWornAt: now, laundry: "worn", updatedAt: now });
    }
    if (outfitId) {
      const outfit = assertOwner(await ctx.db.get(outfitId), user, "outfit");
      await ctx.db.patch(outfit._id, { wearCount: outfit.wearCount + 1, updatedAt: now });
    }
    await ctx.db.insert("wearEvents", { userId: user._id, itemIds: unique, outfitId, idempotencyKey: key, wornAt: now });
    await syncSignals(ctx, user._id);
    return { duplicate: false };
  },
});

export const dismissDuplicate = mutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    const user = await requireUser(ctx);
    const item = assertOwner(await ctx.db.get(itemId), user, "item");
    await ctx.db.patch(item._id, { duplicateOfId: undefined });
    return null;
  },
});

/** Retry a failed cut-out from its original photo. */
export const retryExtract = mutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    const user = await requireUser(ctx);
    const item = assertOwner(await ctx.db.get(itemId), user, "item");
    if (!item.uploadId || !(await ctx.db.get(item.uploadId))) throw appError("INVALID_INPUT", "The original photo is gone, so this can't be retried.");
    if (item.status === "extracting") return null;
    const jobId = await createJob(ctx, { userId: user._id, type: "extract", uploadId: item.uploadId, steps: [{ key: "extract:0", label: `Cutting out ${item.name}` }] });
    await ctx.db.patch(item._id, { status: "extracting", updatedAt: Date.now() });
    await visionPool.enqueueAction(ctx, internal.ai.pipeline.extractItem, { itemId }, {
      onComplete: internal.uploads.onExtractDone,
      context: { itemId, jobId, stepKey: "extract:0" },
    });
    return null;
  },
});

export const jobs = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db.query("jobs").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "running")).take(20);
  },
});
