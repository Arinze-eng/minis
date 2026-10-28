import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { audit } from "./model/core";
import { annualizedOf, syncSignals } from "./model/signals";
import { vFindingState } from "./shared/validators";

export const findings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("moneyFindings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(500);
    const counted = rows.filter((f) => f.state !== "ignored");
    const annualTotal = counted.reduce((sum, f) => sum + (f.annualized ?? annualizedOf(f.amount, f.cadence) ?? 0), 0);
    const now = Date.now();
    const upcoming = counted
      .filter((f) => f.nextRenewal !== undefined && f.nextRenewal >= now - 86_400_000)
      .sort((a, b) => (a.nextRenewal ?? 0) - (b.nextRenewal ?? 0))
      .slice(0, 5);
    return { findings: rows, annualTotal, upcoming };
  },
});

/** Keep / ignore / mark a cancellation as prepared. Atlas never cancels or pays anything itself. */
export const setState = mutation({
  args: { findingId: v.id("moneyFindings"), state: vFindingState },
  returns: v.null(),
  handler: async (ctx, { findingId, state }) => {
    const user = await requireUser(ctx);
    const finding = assertOwner(await ctx.db.get(findingId), user, "finding");
    await ctx.db.patch(finding._id, { state });
    await audit(ctx, user._id, "finding_state", finding._id, { state });
    await syncSignals(ctx, user._id);
    return null;
  },
});
