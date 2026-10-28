import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { audit } from "./model/core";
import { CONSENT_SCOPES } from "./shared/domain";
import { literals } from "./shared/validators";

const vScope = literals(CONSENT_SCOPES);

export const list = query({
  args: {},
  returns: v.array(v.object({ scope: vScope, granted: v.boolean(), grantedAt: v.optional(v.number()), revokedAt: v.optional(v.number()) })),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return Promise.all(
      CONSENT_SCOPES.map(async (scope) => {
        const row = await ctx.db
          .query("consentGrants")
          .withIndex("by_user_scope", (q) => q.eq("userId", user._id).eq("scope", scope))
          .unique();
        return { scope, granted: Boolean(row?.granted && !row.revokedAt), grantedAt: row?.grantedAt, revokedAt: row?.revokedAt };
      }),
    );
  },
});

/** Grant or revoke one scope. Revocation is recorded, never deleted. */
export const set = mutation({
  args: { scope: vScope, granted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { scope, granted }) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("consentGrants")
      .withIndex("by_user_scope", (q) => q.eq("userId", user._id).eq("scope", scope))
      .unique();
    const patch = granted
      ? { granted: true, grantedAt: now, revokedAt: undefined }
      : { granted: false, revokedAt: now };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("consentGrants", { userId: user._id, scope, consentVersion: "v1", ...patch });
    await audit(ctx, user._id, granted ? "consent_granted" : "consent_revoked", scope);
    return null;
  },
});
