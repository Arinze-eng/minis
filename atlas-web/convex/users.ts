import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./model/core";
import { DEFAULT_PREFS, vFit, vPrefs, vPresentation } from "./shared/validators";

const vMe = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  role: v.union(v.literal("user"), v.literal("admin")),
  prefs: vPrefs,
  createdAt: v.number(),
});

/** The signed-in user with preferences (defaults filled in), or null while signed out / not stored. */
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
      prefs: { ...DEFAULT_PREFS, ...user.prefs },
      createdAt: user.createdAt,
    };
  },
});

/**
 * Idempotent: called by the client after sign-in so the row exists before any other call. Role is
 * never taken from the token; admins are promoted deliberately (`npx convex run admin:promote`).
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

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const updatePrefs = mutation({
  args: {
    patch: v.object({
      presentation: v.optional(vPresentation),
      fit: v.optional(vFit),
      avoidColours: v.optional(v.array(v.string())),
      homeCity: v.optional(v.string()),
      timezone: v.optional(v.string()),
      quietHoursEnabled: v.optional(v.boolean()),
      quietStart: v.optional(v.string()),
      quietEnd: v.optional(v.string()),
      morningOutfit: v.optional(v.boolean()),
      morningHour: v.optional(v.number()),
      telegramChatId: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { patch }) => {
    const user = await requireUser(ctx);
    if (patch.quietStart !== undefined && !TIME.test(patch.quietStart)) throw appError("INVALID_INPUT", "Quiet hours use HH:MM.");
    if (patch.quietEnd !== undefined && !TIME.test(patch.quietEnd)) throw appError("INVALID_INPUT", "Quiet hours use HH:MM.");
    if (patch.morningHour !== undefined && !(Number.isInteger(patch.morningHour) && patch.morningHour >= 0 && patch.morningHour <= 23)) {
      throw appError("INVALID_INPUT", "Pick an hour between 0 and 23.");
    }
    if (patch.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: patch.timezone });
      } catch {
        throw appError("INVALID_INPUT", "Unknown time zone.");
      }
    }
    const clean = {
      ...patch,
      avoidColours: patch.avoidColours?.map((c) => c.trim().slice(0, 30)).filter(Boolean).slice(0, 12),
      homeCity: patch.homeCity?.trim().slice(0, 80),
      telegramChatId: patch.telegramChatId?.trim().slice(0, 40),
    };
    const merged = { ...DEFAULT_PREFS, ...user.prefs };
    for (const [key, value] of Object.entries(clean)) if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    await ctx.db.patch(user._id, { prefs: merged });
    await audit(ctx, user._id, "preferences_updated");
    return null;
  },
});
