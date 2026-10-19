import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit, requireConsent } from "./model/core";
import { LIMITS } from "./shared/domain";
import { assertFreshImage } from "./uploads";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("avatars").withIndex("by_user", (q) => q.eq("userId", user._id)).take(LIMITS.maxAvatars);
    return Promise.all(
      rows.map(async (a) => ({ ...a, url: await ctx.storage.getUrl(a.storageId), isDefault: user.defaultAvatarId === a._id })),
    );
  },
});

/** A full-body photo used only for the user's own try-ons. Needs `person_image_use` consent. */
export const create = mutation({
  args: { storageId: v.id("_storage"), label: v.optional(v.string()) },
  returns: v.id("avatars"),
  handler: async (ctx, { storageId, label }) => {
    const user = await requireUser(ctx);
    await requireConsent(ctx, user._id, "person_image_use", "using your photo for try-ons");
    const existing = await ctx.db.query("avatars").withIndex("by_user", (q) => q.eq("userId", user._id)).take(LIMITS.maxAvatars + 1);
    if (existing.length >= LIMITS.maxAvatars) throw appError("INVALID_INPUT", `You can keep up to ${LIMITS.maxAvatars} photos. Remove one first.`);
    await assertFreshImage(ctx, storageId, "That photo");
    const avatarId = await ctx.db.insert("avatars", {
      userId: user._id,
      storageId,
      label: label?.trim().slice(0, 40) || `Photo ${existing.length + 1}`,
      createdAt: Date.now(),
    });
    if (!user.defaultAvatarId) await ctx.db.patch(user._id, { defaultAvatarId: avatarId });
    await audit(ctx, user._id, "avatar_added", avatarId);
    return avatarId;
  },
});

export const setDefault = mutation({
  args: { avatarId: v.id("avatars") },
  returns: v.null(),
  handler: async (ctx, { avatarId }) => {
    const user = await requireUser(ctx);
    const avatar = assertOwner(await ctx.db.get(avatarId), user, "photo");
    await ctx.db.patch(user._id, { defaultAvatarId: avatar._id });
    return null;
  },
});

export const remove = mutation({
  args: { avatarId: v.id("avatars") },
  returns: v.null(),
  handler: async (ctx, { avatarId }) => {
    const user = await requireUser(ctx);
    const avatar = assertOwner(await ctx.db.get(avatarId), user, "photo");
    const pending = (await ctx.db.query("renders").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(50)).some(
      (r) => r.avatarId === avatar._id && r.status === "pending",
    );
    if (pending) throw appError("CONFLICT", "Wait for the try-on using this photo to finish.");
    await ctx.storage.delete(avatar.storageId);
    await ctx.db.delete(avatar._id);
    if (user.defaultAvatarId === avatar._id) {
      const next = await ctx.db.query("avatars").withIndex("by_user", (q) => q.eq("userId", user._id)).first();
      await ctx.db.patch(user._id, { defaultAvatarId: next?._id });
    }
    await audit(ctx, user._id, "avatar_removed", avatar._id);
    return null;
  },
});
