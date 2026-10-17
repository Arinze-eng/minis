import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

/** Rows deleted per transaction; well under Convex's 16,000-writes-per-transaction limit. */
const PURGE_BATCH = 200;

/**
 * Deletes everything owned by one user, a batch at a time, then the user row. Every new user-owned
 * table must be added here (and to the matching test) in the phase that creates it.
 */
async function purgeBatch(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  let budget = PURGE_BATCH;

  const consents = await ctx.db
    .query("consentGrants")
    .withIndex("by_user_scope", (q) => q.eq("userId", userId))
    .take(budget);
  for (const row of consents) await ctx.db.delete(row._id);
  budget -= consents.length;
  if (budget <= 0) return false;

  const audits = await ctx.db
    .query("auditEvents")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(budget);
  for (const row of audits) await ctx.db.delete(row._id);
  budget -= audits.length;
  if (budget <= 0) return false;

  const usage = await ctx.db
    .query("aiUsage")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(budget);
  for (const row of usage) await ctx.db.delete(row._id);
  budget -= usage.length;

  return budget > 0;
}

/** One transaction's worth of deletion; reschedules itself until nothing of the user is left. */
export const purgeUserData = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if (!(await ctx.db.get(userId))) return null;
    if (await purgeBatch(ctx, userId)) {
      await ctx.db.delete(userId);
    } else {
      await ctx.scheduler.runAfter(0, internal.privacy.purgeUserData, { userId });
    }
    return null;
  },
});

/** Entry point for Clerk's `user.deleted` webhook. Unknown ids are a no-op (already purged or never stored). */
export const purgeByClerkId = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (user) await ctx.scheduler.runAfter(0, internal.privacy.purgeUserData, { userId: user._id });
    return null;
  },
});
