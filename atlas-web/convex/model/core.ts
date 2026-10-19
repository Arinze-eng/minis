import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import type { ConsentScope } from "../shared/domain";

type Ctx = QueryCtx | MutationCtx;
type Detail = Record<string, string | number | boolean | null>;

/** Append-only audit trail; kept through a content wipe, removed only with the account. */
export async function audit(ctx: MutationCtx, userId: Id<"users">, kind: string, subjectId?: string, detail?: Detail) {
  await ctx.db.insert("auditEvents", { userId, kind, subjectId, detail, createdAt: Date.now() });
}

export async function hasConsent(ctx: Ctx, userId: Id<"users">, scope: ConsentScope): Promise<boolean> {
  const row = await ctx.db
    .query("consentGrants")
    .withIndex("by_user_scope", (q) => q.eq("userId", userId).eq("scope", scope))
    .unique();
  return Boolean(row?.granted && !row.revokedAt);
}

/** Gate for every data use: checked in the mutation that starts work, not only in the UI. */
export async function requireConsent(ctx: Ctx, userId: Id<"users">, scope: ConsentScope, what: string) {
  if (!(await hasConsent(ctx, userId, scope))) {
    throw appError("CONSENT_REQUIRED", `Allow ${what} in Settings → Privacy first.`, { scope });
  }
}
