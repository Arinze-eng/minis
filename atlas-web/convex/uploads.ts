import { vOnCompleteValidator } from "@convex-dev/workpool";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { limits } from "./limits";
import { assertOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { audit, requireConsent } from "./model/core";
import { searchTextOf } from "./model/detect";
import { assertBelowJobLimit, createJob, setStep, readableError } from "./model/jobs";
import { syncSignals } from "./model/signals";
import { visionPool } from "./pools";
import { ACCEPTED_IMAGE_TYPES, LIMITS, MAX_UPLOAD_BYTES } from "./shared/domain";
import { vDetectedItem } from "./shared/validators";

/** Rate-limited per user, so nobody can mint unlimited upload URLs (Fitcheck finding 3). */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const { ok } = await limits.limit(ctx, "uploadsPerUser", { key: user._id });
    if (!ok) throw appError("RATE_LIMITED", "You've uploaded a lot today. Try again tomorrow.");
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * A stored file may be registered once, by the user who uploaded it, and must really be an image of
 * an accepted type and size. Convex files carry no owner, so "referenced nowhere yet" is the guard.
 */
export async function assertFreshImage(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">, label: string) {
  const meta = await ctx.db.system.get(storageId);
  if (!meta) throw appError("INVALID_INPUT", `"${label}" didn't finish uploading. Try again.`);
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(meta.contentType ?? "")) {
    throw appError("INVALID_INPUT", `"${label}" isn't a JPEG, PNG or WebP photo.`);
  }
  if (meta.size > MAX_UPLOAD_BYTES) throw appError("INVALID_INPUT", `"${label}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const used =
    (await ctx.db.query("uploads").withIndex("by_storage", (q) => q.eq("storageId", storageId)).first()) ??
    (await ctx.db.query("items").withIndex("by_storage", (q) => q.eq("storageId", storageId)).first()) ??
    (await ctx.db.query("avatars").withIndex("by_storage", (q) => q.eq("storageId", storageId)).first());
  if (used) throw appError("INVALID_INPUT", `"${label}" is already in use.`);
}

export const createBatch = mutation({
  args: {
    files: v.array(v.object({ storageId: v.id("_storage"), fileName: v.string() })),
    suggestionId: v.optional(v.id("garmentSuggestions")),
  },
  returns: v.object({ batchId: v.string(), uploadIds: v.array(v.id("uploads")) }),
  handler: async (ctx, { files, suggestionId }) => {
    const user = await requireUser(ctx);
    await requireConsent(ctx, user._id, "garment_image_analysis", "clothing photo analysis");
    if (files.length === 0 || files.length > LIMITS.maxPhotosPerBatch) {
      throw appError("INVALID_INPUT", `Add between 1 and ${LIMITS.maxPhotosPerBatch} photos at a time.`);
    }
    if (suggestionId) assertOwner(await ctx.db.get(suggestionId), user, "suggestion");
    for (const file of files) await assertFreshImage(ctx, file.storageId, file.fileName.slice(0, 80));
    await assertBelowJobLimit(ctx, user._id);
    const { ok } = await limits.limit(ctx, "scansPerUser", { key: user._id, count: files.length });
    if (!ok) throw appError("RATE_LIMITED", "You've scanned a lot of photos today. Try again tomorrow.");

    const batchId = crypto.randomUUID();
    const uploadIds: Id<"uploads">[] = [];
    for (const file of files) {
      const uploadId = await ctx.db.insert("uploads", {
        userId: user._id,
        batchId,
        storageId: file.storageId,
        fileName: file.fileName.slice(0, 120),
        status: "queued",
        suggestionId,
        createdAt: Date.now(),
      });
      const jobId = await createJob(ctx, { userId: user._id, type: "scan", uploadId, batchId, steps: [{ key: "detect", label: "Finding clothes in the photo" }] });
      await ctx.db.patch(uploadId, { jobId });
      await visionPool.enqueueAction(ctx, internal.ai.pipeline.scanUpload, { uploadId }, {
        onComplete: internal.uploads.onScanDone,
        context: { uploadId, jobId },
      });
      uploadIds.push(uploadId);
    }
    await audit(ctx, user._id, "photos_uploaded", batchId, { count: files.length });
    return { batchId, uploadIds };
  },
});

export const scanContext = internalQuery({
  args: { uploadId: v.id("uploads") },
  returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), userId: v.id("users") })),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get(uploadId);
    return upload ? { storageId: upload.storageId, userId: upload.userId } : null;
  },
});

export const markDetecting = internalMutation({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get(uploadId);
    if (upload?.status === "queued") await ctx.db.patch(uploadId, { status: "detecting" });
    if (upload?.jobId) await setStep(ctx, upload.jobId, "detect", { status: "running" });
    return null;
  },
});

/** Scan results are review data only: nothing enters the wardrobe until the user picks pieces. */
export const recordCandidates = internalMutation({
  args: { uploadId: v.id("uploads"), items: v.array(vDetectedItem), provider: v.string() },
  returns: v.null(),
  handler: async (ctx, { uploadId, items, provider }) => {
    const upload = await ctx.db.get(uploadId);
    if (!upload || upload.candidates !== undefined) return null; // replay-safe
    await ctx.db.patch(uploadId, { candidates: items, status: items.length > 0 ? "awaiting_selection" : "done" });
    if (upload.jobId) {
      await setStep(ctx, upload.jobId, "detect", {
        status: "done",
        label: items.length === 0 ? "No clothing found" : `Found ${items.length} ${items.length === 1 ? "piece" : "pieces"} (${provider})`,
      });
    }
    return null;
  },
});

export const onScanDone = internalMutation({
  args: vOnCompleteValidator(v.object({ uploadId: v.id("uploads"), jobId: v.id("jobs") })),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "success") return;
    const error = result.kind === "failed" ? readableError(result.error) : "Cancelled.";
    const upload = await ctx.db.get(context.uploadId);
    if (upload && upload.candidates === undefined) await ctx.db.patch(upload._id, { status: "failed", error });
    await setStep(ctx, context.jobId, "detect", { status: "failed", error });
  },
});

async function withUrl<T extends { storageId: Id<"_storage"> }>(ctx: QueryCtx, row: T) {
  return { ...row, url: await ctx.storage.getUrl(row.storageId) };
}

export const recent = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("uploads").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(24);
    return Promise.all(
      rows.map(async (row) => ({ ...(await withUrl(ctx, row)), job: row.jobId ? await ctx.db.get(row.jobId) : null })),
    );
  },
});

export const needsReview = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("uploads")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "awaiting_selection"))
      .order("desc")
      .take(20);
    return Promise.all(rows.map((row) => withUrl(ctx, row)));
  },
});

/** Only the chosen pieces are imported; the selection is confirmed once. */
export const confirmSelection = mutation({
  args: { uploadId: v.id("uploads"), indices: v.array(v.number()) },
  returns: v.number(),
  handler: async (ctx, { uploadId, indices }) => {
    const user = await requireUser(ctx);
    const upload = assertOwner(await ctx.db.get(uploadId), user, "photo");
    const candidates = upload.candidates ?? [];
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    if (upload.status !== "awaiting_selection") throw appError("CONFLICT", "This photo's pieces were already chosen.");
    if (unique.length === 0 || unique.some((i) => !Number.isInteger(i) || i < 0 || i >= candidates.length)) {
      throw appError("INVALID_INPUT", "Choose at least one piece from this photo.");
    }
    const readyCount = (await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "ready")).take(LIMITS.maxItemsPerUser + 1)).length;
    if (readyCount + unique.length > LIMITS.maxItemsPerUser) throw appError("INVALID_INPUT", "Your wardrobe is full. Remove a few pieces first.");

    const suggestion = upload.suggestionId ? await ctx.db.get(upload.suggestionId) : null;
    const now = Date.now();
    const jobId = await createJob(ctx, {
      userId: user._id,
      type: "extract",
      uploadId,
      batchId: upload.batchId,
      steps: unique.map((index, n) => ({ key: `extract:${n}`, label: `Cutting out ${candidates[index]!.name}` })),
    });
    for (const [n, index] of unique.entries()) {
      const { bbox, ...attrs } = candidates[index]!;
      const brand = suggestion?.merchant;
      const itemId = await ctx.db.insert("items", {
        userId: user._id,
        uploadId,
        sourceBbox: bbox,
        ...attrs,
        brand,
        price: suggestion && unique.length === 1 ? suggestion.price : undefined,
        currency: suggestion && unique.length === 1 ? suggestion.currency : undefined,
        status: "extracting",
        laundry: "clean",
        wearCount: 0,
        analysisProvider: "pending",
        searchText: searchTextOf({ ...attrs, brand }),
        createdAt: now,
        updatedAt: now,
      });
      await visionPool.enqueueAction(ctx, internal.ai.pipeline.extractItem, { itemId }, {
        onComplete: internal.uploads.onExtractDone,
        context: { itemId, jobId, stepKey: `extract:${n}` },
      });
    }
    await ctx.db.patch(uploadId, { selectedIndices: unique, status: "extracting", jobId });
    if (suggestion?.status === "pending") await ctx.db.patch(suggestion._id, { status: "added" });
    return unique.length;
  },
});

export const extractContext = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.union(v.null(), v.object({ userId: v.id("users"), photo: v.id("_storage"), bbox: v.array(v.number()), category: v.string() })),
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    const upload = item?.uploadId ? await ctx.db.get(item.uploadId) : null;
    if (!item || !upload) return null;
    return { userId: item.userId, photo: upload.storageId, bbox: item.sourceBbox ?? [0, 0, 1, 1], category: item.category };
  },
});

export const userHashes = internalQuery({
  args: { userId: v.id("users"), exclude: v.id("items") },
  returns: v.array(v.object({ id: v.id("items"), phash: v.string(), category: v.string() })),
  handler: async (ctx, { userId, exclude }) => {
    const rows = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "ready")).take(LIMITS.maxItemsPerUser);
    return rows.filter((r) => r._id !== exclude && r.phash).map((r) => ({ id: r._id, phash: r.phash!, category: r.category }));
  },
});

export const itemReady = internalMutation({
  args: {
    itemId: v.id("items"),
    storageId: v.id("_storage"),
    hex: v.array(v.string()),
    phash: v.string(),
    provider: v.string(),
    duplicateOfId: v.optional(v.id("items")),
  },
  returns: v.null(),
  handler: async (ctx, { itemId, storageId, hex, phash, provider, duplicateOfId }) => {
    const item = await ctx.db.get(itemId);
    if (!item) {
      await ctx.storage.delete(storageId); // deleted while extracting
      return null;
    }
    if (item.storageId && item.storageId !== storageId) await ctx.storage.delete(item.storageId);
    await ctx.db.patch(itemId, {
      storageId,
      colours: { ...item.colours, hex },
      phash,
      duplicateOfId,
      analysisProvider: provider,
      status: "ready",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const onExtractDone = internalMutation({
  args: vOnCompleteValidator(v.object({ itemId: v.id("items"), jobId: v.id("jobs"), stepKey: v.string() })),
  handler: async (ctx, { context, result }) => {
    const item = await ctx.db.get(context.itemId);
    if (result.kind === "success") {
      await setStep(ctx, context.jobId, context.stepKey, { status: "done" });
    } else {
      const error = result.kind === "failed" ? readableError(result.error) : "Cancelled.";
      if (item && item.status === "extracting") await ctx.db.patch(item._id, { status: "failed", updatedAt: Date.now() });
      await setStep(ctx, context.jobId, context.stepKey, { status: "failed", error });
    }
    const job = await ctx.db.get(context.jobId);
    if (job && job.status !== "running" && job.uploadId) {
      await ctx.db.patch(job.uploadId, { status: job.status === "failed" ? "failed" : "done" });
      if (item) await syncSignals(ctx, item.userId);
    }
  },
});

/** Deletes the source photo. Imported pieces stay in the wardrobe. */
export const remove = mutation({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const user = await requireUser(ctx);
    const upload = assertOwner(await ctx.db.get(uploadId), user, "photo");
    if (upload.status === "queued" || upload.status === "detecting" || upload.status === "extracting") {
      throw appError("CONFLICT", "Wait for this photo to finish before removing it.");
    }
    await ctx.storage.delete(upload.storageId);
    for (const item of await ctx.db.query("items").withIndex("by_upload", (q) => q.eq("uploadId", uploadId)).take(50)) {
      await ctx.db.patch(item._id, { uploadId: undefined, sourceBbox: undefined });
    }
    await ctx.db.delete(uploadId);
    return null;
  },
});
