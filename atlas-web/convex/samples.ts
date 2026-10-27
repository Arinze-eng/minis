import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./model/core";
import { searchTextOf } from "./model/detect";
import { samplesFor } from "./model/samples";
import { syncSignals } from "./model/signals";
import { DEFAULT_PREFS } from "./shared/validators";

/**
 * A ready-made illustrated wardrobe, so Atlas can be explored before the first photo (or without AI
 * keys). Sample pieces style and pack like real ones; they are never sent to try-on.
 */
export const add = action({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
    const who = await ctx.runQuery(internal.samples.owner, { clerkId: identity.subject });
    if (!who) throw appError("UNAUTHENTICATED", "Your account is still being set up.");
    if (who.hasSamples) return 0;
    const stored: { key: string; storageId: Id<"_storage"> }[] = [];
    for (const piece of samplesFor(who.presentation)) {
      stored.push({ key: piece.key, storageId: await ctx.storage.store(new Blob([piece.svg], { type: "image/svg+xml" })) });
    }
    return ctx.runMutation(internal.samples.insert, { userId: who.userId, presentation: who.presentation, stored });
  },
});

export const owner = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId)).unique();
    if (!user) return null;
    const ready = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "ready")).take(1500);
    return { userId: user._id, presentation: { ...DEFAULT_PREFS, ...user.prefs }.presentation as string, hasSamples: ready.some((i) => i.sample) };
  },
});

export const insert = internalMutation({
  args: { userId: v.id("users"), presentation: v.string(), stored: v.array(v.object({ key: v.string(), storageId: v.id("_storage") })) },
  returns: v.number(),
  handler: async (ctx, { userId, presentation, stored }) => {
    const now = Date.now();
    const files = new Map(stored.map((s) => [s.key, s.storageId]));
    let added = 0;
    for (const piece of samplesFor(presentation)) {
      const storageId = files.get(piece.key);
      if (!storageId) continue;
      const { key: _key, for: _for, svg: _svg, ...attributes } = piece;
      await ctx.db.insert("items", {
        userId,
        storageId,
        ...attributes,
        status: "ready",
        laundry: "clean",
        wearCount: 0,
        sample: true,
        analysisProvider: "sample",
        searchText: searchTextOf(attributes),
        createdAt: now,
        updatedAt: now,
      });
      added += 1;
    }
    await audit(ctx, userId, "samples_added", undefined, { count: added });
    await syncSignals(ctx, userId);
    return added;
  },
});

/** How many sample pieces the user has, so the UI can offer to remove them. */
export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const ready = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "ready")).take(1500);
    return ready.filter((i) => i.sample).length;
  },
});
