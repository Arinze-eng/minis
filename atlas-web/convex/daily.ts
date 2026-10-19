import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { notify } from "./model/signals";
import { pickOutfit } from "./model/pack";
import { DEFAULT_PREFS } from "./shared/validators";

function localParts(timezone: string | undefined, now: number): { hour: number; date: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return { hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
  } catch {
    return { hour: new Date(now).getUTCHours(), date: new Date(now).toISOString().slice(0, 10) };
  }
}

/**
 * Hourly: for each user whose local hour is their morning hour (opt-out in Settings), draft one outfit from
 * clean, least-recently-worn pieces and leave it in the Inbox. Deterministic — no AI, no data leaves Convex.
 */
export const morning = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db.query("users").paginate({ cursor: cursor ?? null, numItems: 100 });
    for (const user of page.page) {
      const prefs = { ...DEFAULT_PREFS, ...user.prefs };
      if (!prefs.morningOutfit) continue;
      const local = localParts(prefs.timezone, now);
      if (local.hour !== prefs.morningHour) continue;
      const dedupKey = `morning:${local.date}`;
      const existing = await ctx.db.query("notifications").withIndex("by_user_dedup", (q) => q.eq("userId", user._id).eq("dedupKey", dedupKey)).unique();
      if (existing) continue;
      const items = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "ready")).take(1500);
      const { slots, complete } = pickOutfit(items);
      if (!complete) continue;
      const outfitId = await ctx.db.insert("outfits", {
        userId: user._id,
        name: `Outfit for ${local.date}`,
        slots,
        reasoning: "Clean pieces you haven't worn in the longest time.",
        source: "agent",
        wearCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      await notify(ctx, user._id, {
        category: "closet",
        title: "Today's outfit is ready",
        detail: "Picked from clean pieces you haven't worn lately.",
        action: { label: "See outfit", href: `/looks/${outfitId}` },
        urgency: "low",
        dedupKey,
      });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.daily.morning, { cursor: page.continueCursor });
    return null;
  },
});

/** Stuck jobs, expired OAuth states. */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    for (const s of await ctx.db.query("oauthStates").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now)).take(200)) await ctx.db.delete(s._id);
    const stuck = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "running").lt("updatedAt", now - 30 * 60_000)).take(200);
    for (const job of stuck) {
      await ctx.db.patch(job._id, {
        status: "failed",
        error: "Timed out.",
        steps: job.steps.map((s) => (s.status === "pending" || s.status === "running" ? { ...s, status: "failed" as const, error: "Timed out." } : s)),
        progress: 1,
        updatedAt: now,
        completedAt: now,
      });
      const render = await ctx.db.query("renders").withIndex("by_job", (q) => q.eq("jobId", job._id)).unique();
      if (render?.status === "pending") await ctx.db.patch(render._id, { status: "failed", error: "Timed out.", completedAt: now });
    }
    return null;
  },
});
