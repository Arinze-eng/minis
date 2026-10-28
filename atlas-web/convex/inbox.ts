import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit } from "./model/core";
import { syncSignals } from "./model/signals";
import { vSignalState } from "./shared/validators";

/** Active signals for the Inbox: snoozes past their time reappear. */
export const signals = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("signals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);
    return rows.filter((s) => s.state === "active" || (s.state === "snoozed" && (s.stateUntil ?? 0) <= now));
  },
});

export const signal = query({
  args: { signalId: v.string() },
  handler: async (ctx, { signalId }) => {
    const user = await requireUser(ctx);
    const id = ctx.db.normalizeId("signals", signalId);
    const row = id ? await ctx.db.get(id) : null;
    return row && row.userId === user._id ? row : null;
  },
});

export const setSignalState = mutation({
  args: { signalId: v.id("signals"), state: vSignalState, until: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { signalId, state, until }) => {
    const user = await requireUser(ctx);
    const signal = assertOwner(await ctx.db.get(signalId), user, "signal");
    if (state === "snoozed" && (!until || until <= Date.now())) throw appError("INVALID_INPUT", "Pick a time in the future.");
    await ctx.db.patch(signal._id, { state, stateUntil: state === "snoozed" ? until : undefined, updatedAt: Date.now() });
    await audit(ctx, user._id, "signal_state", signal._id, { state });
    return null;
  },
});

/** Re-derive now (the Inbox "Refresh" button); derivation also runs after every relevant write. */
export const refresh = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await syncSignals(ctx, user._id);
    return null;
  },
});

export const notifications = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

export const markRead = mutation({
  args: { notificationId: v.optional(v.id("notifications")) },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    if (notificationId) {
      const row = assertOwner(await ctx.db.get(notificationId), user, "notification");
      if (!row.read) await ctx.db.patch(row._id, { read: true });
      return null;
    }
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);
    for (const row of unread) if (!row.read) await ctx.db.patch(row._id, { read: true });
    return null;
  },
});
