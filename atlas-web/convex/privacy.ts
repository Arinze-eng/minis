import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { revoke } from "./lib/google";
import { decryptSecret, encryptionConfigured } from "./lib/secretBox";
import { audit } from "./model/core";
import { USER_TABLES } from "./schema";

/** Rows deleted per transaction; far under Convex's 16,000-writes-per-transaction limit. */
const PURGE_BATCH = 200;

type UserTable = (typeof USER_TABLES)[number];

/** The index on each user table whose first field is `userId`. Checked by a test against the schema. */
export const USER_INDEX: Record<UserTable, string> = {
  renders: "by_user",
  approvals: "by_user_status",
  messages: "by_user",
  threads: "by_user_last",
  wearEvents: "by_user_key",
  outfits: "by_user",
  items: "by_user_status",
  uploads: "by_user",
  jobs: "by_user",
  avatars: "by_user",
  tripPlans: "by_user",
  garmentSuggestions: "by_user_status",
  emailFindings: "by_user",
  oauthStates: "by_user",
  sourceConnections: "by_user_provider",
  moneyFindings: "by_user",
  signals: "by_user",
  notifications: "by_user",
  consentGrants: "by_user_scope",
  auditEvents: "by_user",
  aiUsage: "by_user",
};

/** Content wipe keeps the audit trail and AI usage ledger; account deletion removes everything. */
const KEPT_ON_CONTENT_WIPE: ReadonlySet<UserTable> = new Set(["auditEvents", "aiUsage"]);

type LooseRow = Record<string, unknown> & { _id: Id<TableNames>; storageId?: Id<"_storage"> };
type LooseQuery = {
  withIndex(name: string, range: (q: { eq(field: string, value: unknown): unknown }) => unknown): { take(n: number): Promise<LooseRow[]> };
};

/** Rows of one user table via its userId index. Generic over every table, so Convex's per-table index typing can't follow; USER_INDEX is checked by a test. */
function byUser(ctx: QueryCtx | MutationCtx, table: UserTable, userId: Id<"users">) {
  return (ctx.db.query(table) as unknown as LooseQuery).withIndex(USER_INDEX[table], (q) => q.eq("userId", userId));
}

async function deleteFile(ctx: MutationCtx, storageId: Id<"_storage"> | undefined) {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Already gone (retried batch or manual cleanup); the row deletion still stands.
  }
}

async function purgeBatch(ctx: MutationCtx, userId: Id<"users">, mode: "content" | "account"): Promise<boolean> {
  let budget = PURGE_BATCH;
  for (const table of USER_TABLES) {
    if (mode === "content" && KEPT_ON_CONTENT_WIPE.has(table)) continue;
    const rows = await byUser(ctx, table, userId).take(budget);
    for (const row of rows) {
      await deleteFile(ctx, row.storageId);
      await ctx.db.delete(row._id);
    }
    budget -= rows.length;
    if (budget <= 0) return false;
  }
  return true;
}

export const purgeUserData = internalMutation({
  args: { userId: v.id("users"), mode: v.union(v.literal("content"), v.literal("account")) },
  returns: v.null(),
  handler: async (ctx, { userId, mode }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (!(await purgeBatch(ctx, userId, mode))) {
      await ctx.scheduler.runAfter(0, internal.privacy.purgeUserData, { userId, mode });
      return null;
    }
    if (mode === "account") await ctx.db.delete(userId);
    else {
      await ctx.db.patch(userId, { defaultAvatarId: undefined });
      await audit(ctx, userId, "data_wipe_completed");
    }
    return null;
  },
});

/** Entry point for Clerk's `user.deleted` webhook. Unknown ids are a no-op. */
export const purgeByClerkId = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId)).unique();
    if (user) await ctx.scheduler.runAfter(0, internal.privacy.purgeUserData, { userId: user._id, mode: "account" });
    return null;
  },
});

export const googleTokens = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.string()),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", userId)).take(10);
    return rows.map((r) => r.encryptedRefreshToken).filter((t): t is string => Boolean(t));
  },
});

export const startWipe = internalMutation({
  args: { userId: v.id("users"), revoked: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, revoked }) => {
    await audit(ctx, userId, "data_wipe_requested", undefined, { googleGrantsRevoked: revoked });
    await ctx.scheduler.runAfter(0, internal.privacy.purgeUserData, { userId, mode: "content" });
    return null;
  },
});

/**
 * "Delete all my data": revokes every Google grant at Google first, then deletes every row and file
 * the user owns in batches. Daily AI quotas live in the rate limiter, so a wipe can't reset them.
 */
export const wipe = action({
  args: { confirm: v.literal("DELETE") },
  returns: v.object({ googleGrantsRevoked: v.number() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
    const userId = await ctx.runQuery(internal.sources.userIdByClerk, { clerkId: identity.subject });
    if (!userId) throw appError("UNAUTHENTICATED", "Your account is still being set up.");
    let revoked = 0;
    if (encryptionConfigured()) {
      for (const envelope of await ctx.runQuery(internal.privacy.googleTokens, { userId })) {
        const token = await decryptSecret(envelope);
        if (token && (await revoke(token))) revoked += 1;
      }
    }
    await ctx.runMutation(internal.privacy.startWipe, { userId, revoked });
    return { googleGrantsRevoked: revoked };
  },
});

/** Machine-readable copy of everything the user owns. Token material and storage ids are left out. */
export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const out: Record<string, unknown[]> = {};
    for (const table of USER_TABLES) {
      if (table === "oauthStates") continue;
      const rows = await byUser(ctx, table, user._id).take(1000);
      out[table] = rows.map((row) => {
        const { encryptedRefreshToken: _token, storageId: _storage, ...rest } = row;
        return rest;
      });
    }
    return { exportedAt: Date.now(), user: { email: user.email, name: user.name, prefs: user.prefs }, data: out };
  },
});

/** Lets the UI show "wipe in progress" until the batches finish. */
export const hasData = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;
    const item = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id)).first();
    const signal = await ctx.db.query("signals").withIndex("by_user", (q) => q.eq("userId", user._id)).first();
    return Boolean(item || signal);
  },
});
