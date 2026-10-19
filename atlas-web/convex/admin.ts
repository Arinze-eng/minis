import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { spendKey } from "./ai/usage";
import { counters } from "./limits";
import { envNumber } from "./lib/env";

/** Last 24 h of AI calls by provider: volume, failures, latency, cost. Admins only; no user content. */
export const usage = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") throw appError("FORBIDDEN", "Admins only.");
    const since = Date.now() - 86_400_000;
    // shortcut: reads up to 5,000 rows; switch to sharded counters per provider past that volume.
    const rows = await ctx.db.query("aiUsage").withIndex("by_createdAt", (q) => q.gt("createdAt", since)).take(5000);
    const byProvider = new Map<string, { provider: string; calls: number; failed: number; costUsd: number; latencies: number[] }>();
    for (const r of rows) {
      const p = byProvider.get(r.provider) ?? { provider: r.provider, calls: 0, failed: 0, costUsd: 0, latencies: [] };
      p.calls += 1;
      if (!r.ok) p.failed += 1;
      p.costUsd += r.costUsd;
      p.latencies.push(r.latencyMs);
      byProvider.set(r.provider, p);
    }
    const providers = [...byProvider.values()].map(({ latencies, ...p }) => {
      const sorted = latencies.sort((a, b) => a - b);
      return { ...p, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0 };
    });
    const byCapability: Record<string, number> = {};
    for (const r of rows) byCapability[r.capability] = (byCapability[r.capability] ?? 0) + 1;
    return {
      providers,
      byCapability,
      truncated: rows.length === 5000,
      spentTodayUsd: (await counters.count(ctx, spendKey())) / 1_000_000,
      dailyCapUsd: envNumber("ATLAS_MAX_DAILY_SPEND_USD", 0),
    };
  },
});

/** `npx convex run admin:promote '{"email":"you@example.com"}'` — roles are never taken from tokens. */
export const promote = internalMutation({
  args: { email: v.string(), role: v.optional(v.union(v.literal("admin"), v.literal("user"))) },
  returns: v.string(),
  handler: async (ctx, { email, role }) => {
    const users = await ctx.db.query("users").take(10_000);
    const user = users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (!user) throw appError("NOT_FOUND", "No user with that email.");
    await ctx.db.patch(user._id, { role: role ?? "admin" });
    return user._id;
  },
});
