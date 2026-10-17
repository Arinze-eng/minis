import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { literals } from "./shared/validators";
import { CAPABILITIES, DATA_CLASSES, PROVIDERS } from "./shared/ai";

/**
 * Phase 0 foundation tables. Wardrobe, outfits, renders, jobs and stylist tables arrive with the
 * phases that use them (docs/atlas-wardrobe-v2-architecture.md §5, §12). Every user-owned row
 * carries `userId` and is read only through a `by_user…` index.
 */
export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  consentGrants: defineTable({
    userId: v.id("users"),
    scope: v.string(),
    granted: v.boolean(),
    grantedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    consentVersion: v.string(),
  }).index("by_user_scope", ["userId", "scope"]),

  auditEvents: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    subjectId: v.optional(v.string()),
    detail: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  /** One row per provider call: the audit trail behind the spend cap and the admin usage view. */
  aiUsage: defineTable({
    userId: v.optional(v.id("users")),
    capability: literals(CAPABILITIES),
    dataClass: literals(DATA_CLASSES),
    provider: literals(PROVIDERS),
    model: v.string(),
    keyAlias: v.string(),
    costUsd: v.number(),
    latencyMs: v.number(),
    ok: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_createdAt", ["createdAt"]),
});
