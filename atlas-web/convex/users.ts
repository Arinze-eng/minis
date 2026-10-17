import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { appError } from "./lib/errors";

const vMe = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  role: v.union(v.literal("user"), v.literal("admin")),
  createdAt: v.number(),
});

/** The signed-in user, or null while signed out / not yet stored. */
export const me = query({
  args: {},
  returns: v.union(vMe, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      role: user.role,
      createdAt: user.createdAt,
    };
  },
});

/**
 * Idempotent: called by the client after sign-in so the row exists before any other call. Role is
 * never taken from the token here; admins are promoted deliberately (later phase), so a forged or
 * misconfigured claim cannot self-promote.
 */
export const ensure = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
    const profile = {
      email: identity.email ?? undefined,
      name: identity.name ?? identity.nickname ?? undefined,
      imageUrl: identity.pictureUrl ?? undefined,
    };
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (existing) {
      const changed =
        profile.email !== existing.email || profile.name !== existing.name || profile.imageUrl !== existing.imageUrl;
      if (changed) await ctx.db.patch(existing._id, profile);
      return existing._id;
    }
    return ctx.db.insert("users", { clerkId: identity.subject, ...profile, role: "user", createdAt: Date.now() });
  },
});
