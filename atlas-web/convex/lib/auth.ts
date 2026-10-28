import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

type Ctx = QueryCtx | MutationCtx;

/**
 * Identity comes only from the Clerk JWT Convex verified (`ctx.auth`). No function accepts a user id
 * from the client; every user-owned read is checked with `assertOwner`.
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw appError("UNAUTHENTICATED", "Your account is still being set up. Try again in a moment.");
  return user;
}

export function assertOwner<T extends { userId: Id<"users"> }>(doc: T | null, user: Doc<"users">, what = "item"): T {
  if (!doc || doc.userId !== user._id) throw appError("NOT_FOUND", `That ${what} doesn't exist.`);
  return doc;
}
