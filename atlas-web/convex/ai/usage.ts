import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { counters, limits } from "../limits";
import { appError } from "../lib/errors";
import { envNumber } from "../lib/env";
import { CAPABILITIES, DATA_CLASSES, PROVIDERS } from "../shared/ai";
import { literals } from "../shared/validators";

/** Spend is counted in micro-dollars so the sharded counter stays integer. */
const MICRO = 1_000_000;

export function spendKey(now = Date.now()): string {
  return `spend:${new Date(now).toISOString().slice(0, 10)}`;
}

/** Today's paid spend in USD across all users (UTC day). */
export const spendTodayUsd = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await counters.count(ctx, spendKey())) / MICRO,
});

/**
 * Called before any provider call that has a user: consumes one unit of the per-user daily AI quota,
 * and refuses paid work once today's global spend reaches ATLAS_MAX_DAILY_SPEND_USD.
 */
export const admit = internalMutation({
  args: { userId: v.optional(v.id("users")), paid: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, paid }) => {
    if (userId) {
      const { ok, retryAfter } = await limits.limit(ctx, "aiCallsPerUser", { key: userId });
      if (!ok) throw appError("RATE_LIMITED", "You've reached today's AI limit. Try again tomorrow.", { retryAfter });
    }
    if (paid) {
      const capUsd = envNumber("ATLAS_MAX_DAILY_SPEND_USD", 0);
      const spentUsd = (await counters.count(ctx, spendKey())) / MICRO;
      if (capUsd <= 0 || spentUsd >= capUsd) {
        throw appError("SPEND_KILL_SWITCH", "Paid AI is paused for today. Free providers are still available.");
      }
    }
    return null;
  },
});

/** One row per provider call, plus the global spend counter for paid calls. */
export const record = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    capability: literals(CAPABILITIES),
    dataClass: literals(DATA_CLASSES),
    provider: literals(PROVIDERS),
    model: v.string(),
    keyAlias: v.string(),
    costUsd: v.number(),
    latencyMs: v.number(),
    ok: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("aiUsage", { ...args, createdAt: Date.now() });
    const micro = Math.round(Math.max(0, args.costUsd) * MICRO);
    if (micro > 0) await counters.add(ctx, spendKey(), micro);
    return null;
  },
});
