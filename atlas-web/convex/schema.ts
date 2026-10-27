import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { CAPABILITIES, DATA_CLASSES, PROVIDERS } from "./shared/ai";
import {
  literals,
  vAction,
  vCategory,
  vColours,
  vDetectedItem,
  vEvidence,
  vFindingState,
  vFit,
  vFormality,
  vItemStatus,
  vJobStatus,
  vJobStep,
  vJobType,
  vLaundry,
  vOutfitSlots,
  vPrefs,
  vSeason,
  vSignalState,
  vUploadStatus,
} from "./shared/validators";

/**
 * Atlas data model. Every user-owned table carries `userId` and is read only through a `by_user…`
 * index; privacy.ts purges each table listed here (keep the two in sync — a test checks it).
 */
export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    prefs: v.optional(vPrefs),
    defaultAvatarId: v.optional(v.id("avatars")),
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

  // ---- Inbox --------------------------------------------------------------
  notifications: defineTable({
    userId: v.id("users"),
    category: v.union(v.literal("renewals"), v.literal("closet"), v.literal("system")),
    title: v.string(),
    detail: v.string(),
    action: vAction,
    urgency: v.string(),
    read: v.boolean(),
    dedupKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_dedup", ["userId", "dedupKey"]),

  signals: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    title: v.string(),
    implication: v.string(),
    noticed: v.string(),
    urgency: v.string(),
    domains: v.array(v.string()),
    evidence: vEvidence,
    uncertainty: v.number(),
    capability: v.union(v.literal("advise"), v.literal("prepare")),
    primaryAction: vAction,
    state: vSignalState,
    stateUntil: v.optional(v.number()),
    dedupKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_dedup", ["userId", "dedupKey"]),

  // ---- Money --------------------------------------------------------------
  moneyFindings: defineTable({
    userId: v.id("users"),
    merchant: v.string(),
    productName: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    cadence: v.string(),
    annualized: v.optional(v.number()),
    nextRenewal: v.optional(v.number()),
    trialEnd: v.optional(v.number()),
    priceChanged: v.optional(v.object({ from: v.number(), to: v.number(), detectedAt: v.number() })),
    state: vFindingState,
    confidence: v.number(),
    sourceRef: v.string(),
    snippet: v.optional(v.string()),
    /** When the current amount was last seen in a source message; newer messages detect price changes. */
    observedAt: v.optional(v.number()),
    dedupKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_dedup", ["userId", "dedupKey"]),

  // ---- Sources (Gmail, Google Tasks) ---------------------------------------
  sourceConnections: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("gmail"), v.literal("google_tasks")),
    status: v.union(v.literal("connected"), v.literal("disconnected"), v.literal("error")),
    scopes: v.array(v.string()),
    /** AES-256-GCM envelope; never returned by any query. */
    encryptedRefreshToken: v.optional(v.string()),
    /** "clerk": tokens come from the Google account the user signed in with (Clerk stores and refreshes them). */
    via: v.optional(v.union(v.literal("oauth"), v.literal("clerk"))),
    /** False once the user disconnects, so signing in with Google never silently reconnects it. */
    autoConnect: v.optional(v.boolean()),
    connectedAt: v.optional(v.number()),
    lastScanAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user_provider", ["userId", "provider"]),

  oauthStates: defineTable({
    state: v.string(),
    userId: v.id("users"),
    provider: v.union(v.literal("gmail"), v.literal("google_tasks")),
    codeVerifier: v.string(),
    expiresAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_user", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  emailFindings: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    merchant: v.string(),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    cadence: v.optional(v.string()),
    nextRenewal: v.optional(v.number()),
    messageRef: v.string(),
    snippet: v.optional(v.string()),
    confidence: v.number(),
    occurredAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_message", ["userId", "messageRef"]),

  garmentSuggestions: defineTable({
    userId: v.id("users"),
    merchant: v.string(),
    title: v.string(),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    messageRef: v.string(),
    status: v.union(v.literal("pending"), v.literal("added"), v.literal("dismissed")),
    createdAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user_message", ["userId", "messageRef"]),

  // ---- Wardrobe -------------------------------------------------------------
  jobs: defineTable({
    userId: v.id("users"),
    type: vJobType,
    status: vJobStatus,
    steps: v.array(vJobStep),
    progress: v.number(),
    uploadId: v.optional(v.id("uploads")),
    batchId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status", "updatedAt"]),

  uploads: defineTable({
    userId: v.id("users"),
    batchId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    status: vUploadStatus,
    candidates: v.optional(v.array(vDetectedItem)),
    selectedIndices: v.optional(v.array(v.number())),
    jobId: v.optional(v.id("jobs")),
    /** Set when the photo was added from a Gmail purchase suggestion (price + merchant carry over). */
    suggestionId: v.optional(v.id("garmentSuggestions")),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_storage", ["storageId"]),

  items: defineTable({
    userId: v.id("users"),
    uploadId: v.optional(v.id("uploads")),
    storageId: v.optional(v.id("_storage")),
    sourceBbox: v.optional(v.array(v.number())),
    name: v.string(),
    category: vCategory,
    subcategory: v.string(),
    colours: vColours,
    pattern: v.string(),
    material: v.string(),
    seasons: v.array(vSeason),
    formality: vFormality,
    fit: v.optional(vFit),
    brand: v.optional(v.string()),
    description: v.string(),
    notes: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: vItemStatus,
    laundry: vLaundry,
    wearCount: v.number(),
    lastWornAt: v.optional(v.number()),
    phash: v.optional(v.string()),
    duplicateOfId: v.optional(v.id("items")),
    analysisProvider: v.string(),
    searchText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user_category", ["userId", "category"])
    .index("by_upload", ["uploadId"])
    .index("by_storage", ["storageId"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["userId", "status"] }),

  wearEvents: defineTable({
    userId: v.id("users"),
    itemIds: v.array(v.id("items")),
    outfitId: v.optional(v.id("outfits")),
    idempotencyKey: v.string(),
    wornAt: v.number(),
  }).index("by_user_key", ["userId", "idempotencyKey"]),

  outfits: defineTable({
    userId: v.id("users"),
    name: v.string(),
    slots: vOutfitSlots,
    occasion: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("agent")),
    threadId: v.optional(v.id("threads")),
    savedAt: v.optional(v.number()),
    wearCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_savedAt", ["userId", "savedAt"])
    .index("by_thread", ["threadId"]),

  avatars: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    label: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_storage", ["storageId"]),

  renders: defineTable({
    userId: v.id("users"),
    outfitId: v.id("outfits"),
    avatarId: v.id("avatars"),
    jobId: v.id("jobs"),
    status: v.union(v.literal("pending"), v.literal("done"), v.literal("failed")),
    storageId: v.optional(v.id("_storage")),
    provider: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    shareToken: v.optional(v.string()),
    shareExpiresAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_outfit", ["outfitId"])
    .index("by_job", ["jobId"])
    .index("by_share", ["shareToken"]),

  // ---- Stylist ----------------------------------------------------------------
  threads: defineTable({
    userId: v.id("users"),
    title: v.string(),
    busy: v.boolean(),
    lastMessageAt: v.number(),
    createdAt: v.number(),
  }).index("by_user_last", ["userId", "lastMessageAt"]),

  messages: defineTable({
    userId: v.id("users"),
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    tools: v.optional(v.array(v.string())),
    outfitIds: v.optional(v.array(v.id("outfits"))),
    approvalId: v.optional(v.id("approvals")),
    status: v.optional(v.union(v.literal("streaming"), v.literal("done"), v.literal("error"))),
    /** What the stylist is doing right now ("Checking the weather"), newest last. */
    activity: v.optional(v.array(v.string())),
    /** A one-tap clarifying question from the stylist. */
    question: v.optional(v.object({ prompt: v.string(), options: v.array(v.string()) })),
    /** Page the user asked from ("this piece", "this outfit"); verified server-side, treated as data. */
    context: v.optional(v.object({ kind: v.union(v.literal("item"), v.literal("outfit")), id: v.string() })),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_user", ["userId"]),

  approvals: defineTable({
    userId: v.id("users"),
    threadId: v.optional(v.id("threads")),
    action: v.literal("tryon"),
    outfitId: v.id("outfits"),
    summary: v.string(),
    payloadHash: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("expired")),
    expiresAt: v.number(),
    decidedAt: v.optional(v.number()),
    jobId: v.optional(v.id("jobs")),
    createdAt: v.number(),
  }).index("by_user_status", ["userId", "status"]),

  // ---- Travel -------------------------------------------------------------------
  tripPlans: defineTable({
    userId: v.id("users"),
    destination: v.string(),
    origin: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
    forecast: v.array(v.object({ date: v.string(), maxC: v.number(), minC: v.number(), rainChance: v.number() })),
    itemIds: v.array(v.id("items")),
    gaps: v.array(v.string()),
    notes: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});

/** Every table that holds user-owned rows, in purge order. Checked by a test against the schema. */
export const USER_TABLES = [
  "renders",
  "approvals",
  "messages",
  "threads",
  "wearEvents",
  "outfits",
  "items",
  "uploads",
  "jobs",
  "avatars",
  "tripPlans",
  "garmentSuggestions",
  "emailFindings",
  "oauthStates",
  "sourceConnections",
  "moneyFindings",
  "signals",
  "notifications",
  "consentGrants",
  "auditEvents",
  "aiUsage",
] as const;
