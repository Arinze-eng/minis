import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { sha256Hex } from "./lib/secretBox";
import { audit } from "./model/core";
import { validateSlots } from "./model/outfits";
import { startTryOn } from "./renders";
import { LIMITS } from "./shared/domain";

const slotsHash = (outfit: Doc<"outfits">) => sha256Hex(JSON.stringify(outfit.slots));

/**
 * The stylist may ask for a paid try-on but never start one. It files a request bound to the outfit's
 * exact pieces; only the user's own click (decide) runs it, after every check runs again.
 */
export async function fileApproval(ctx: MutationCtx, user: Doc<"users">, outfitId: Id<"outfits">, threadId?: Id<"threads">): Promise<Id<"approvals">> {
  const outfit = assertOwner(await ctx.db.get(outfitId), user, "outfit");
  await validateSlots(ctx, user, outfit.slots);
  const open = await ctx.db
    .query("approvals")
    .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "pending"))
    .take(20);
  const same = open.find((a) => a.outfitId === outfit._id && a.expiresAt > Date.now());
  if (same) return same._id;
  const now = Date.now();
  return ctx.db.insert("approvals", {
    userId: user._id,
    threadId,
    action: "tryon",
    outfitId: outfit._id,
    summary: `Try on “${outfit.name}” using your photo (Amazon Bedrock, counts toward today's try-ons).`,
    payloadHash: await slotsHash(outfit),
    status: "pending",
    expiresAt: now + LIMITS.approvalMinutes * 60_000,
    createdAt: now,
  });
}

export const request = mutation({
  args: { outfitId: v.id("outfits"), threadId: v.optional(v.id("threads")) },
  returns: v.id("approvals"),
  handler: async (ctx, { outfitId, threadId }) => fileApproval(ctx, await requireUser(ctx), outfitId, threadId),
});

export const pending = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "pending"))
      .take(20);
    return rows.filter((a) => a.expiresAt > Date.now());
  },
});

export const get = query({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, { approvalId }) => {
    const user = await requireUser(ctx);
    const approval = await ctx.db.get(approvalId);
    if (!approval || approval.userId !== user._id) return null;
    const expired = approval.status === "pending" && approval.expiresAt <= Date.now();
    return { ...approval, status: expired ? ("expired" as const) : approval.status };
  },
});

async function settle(ctx: MutationCtx, approval: Doc<"approvals">, status: "rejected" | "expired") {
  await ctx.db.patch(approval._id, { status, decidedAt: Date.now() });
}

export const decide = mutation({
  args: { approvalId: v.id("approvals"), approve: v.boolean() },
  returns: v.object({ status: v.string(), jobId: v.optional(v.id("jobs")) }),
  handler: async (ctx, { approvalId, approve }) => {
    const user = await requireUser(ctx);
    const approval = assertOwner(await ctx.db.get(approvalId), user, "request");
    if (approval.status !== "pending") throw appError("CONFLICT", "This request was already answered.");
    if (approval.expiresAt <= Date.now()) {
      await settle(ctx, approval, "expired");
      return { status: "expired" };
    }
    if (!approve) {
      await settle(ctx, approval, "rejected");
      return { status: "rejected" };
    }
    const outfit = await ctx.db.get(approval.outfitId);
    if (!outfit || (await slotsHash(outfit)) !== approval.payloadHash) {
      await settle(ctx, approval, "expired");
      throw appError("CONFLICT", "The outfit changed since this was suggested. Ask again.");
    }
    const { jobId } = await startTryOn(ctx, user, outfit._id);
    await ctx.db.patch(approval._id, { status: "approved", decidedAt: Date.now(), jobId });
    await audit(ctx, user._id, "approval_granted", approval._id);
    return { status: "approved", jobId };
  },
});
