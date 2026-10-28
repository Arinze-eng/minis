import { vOnCompleteValidator } from "@convex-dev/workpool";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { counters, limits } from "./limits";
import { assertOwner, requireUser } from "./lib/auth";
import { envFlag, envNumber } from "./lib/env";
import { appError } from "./lib/errors";
import { spendKey } from "./ai/usage";
import { audit, hasConsent, requireConsent } from "./model/core";
import { assertBelowJobLimit, createJob, setStep, readableError } from "./model/jobs";
import { layered, validateSlots } from "./model/outfits";
import { imagePool } from "./pools";
import { LIMITS } from "./shared/domain";

/** Why a try-on can't start right now, or null. Shared by the UI quote and the start path. */
async function blocker(ctx: QueryCtx | MutationCtx, user: Doc<"users">): Promise<string | null> {
  if (!(await hasConsent(ctx, user._id, "person_image_use"))) return "Allow using your photo for try-ons in Settings → Privacy.";
  if (!user.defaultAvatarId || !(await ctx.db.get(user.defaultAvatarId))) return "Add a full-length photo of yourself in Settings first.";
  if (!envFlag("ATLAS_ALLOW_PAID_AI") || !process.env.AWS_REGION) return "Try-on runs on Amazon Bedrock, which isn't switched on for this deployment yet.";
  const capUsd = envNumber("ATLAS_MAX_DAILY_SPEND_USD", 0);
  if (capUsd <= 0 || (await counters.count(ctx, spendKey())) / 1_000_000 >= capUsd) return "Try-ons are paused for today. Try again tomorrow.";
  return null;
}

/** The single path that starts a paid try-on (UI button or an approved stylist request). */
export async function startTryOn(ctx: MutationCtx, user: Doc<"users">, outfitId: Id<"outfits">): Promise<{ jobId: Id<"jobs">; renderId: Id<"renders"> }> {
  const outfit = assertOwner(await ctx.db.get(outfitId), user, "outfit");
  await requireConsent(ctx, user._id, "person_image_use", "using your photo for try-ons");
  await validateSlots(ctx, user, outfit.slots);
  const reason = await blocker(ctx, user);
  if (reason) throw appError("CONFLICT", reason);
  const garments = (await layered(ctx, outfit.slots)).filter(({ slot, item }) => slot !== "accessories" && item.storageId && !item.sample);
  if (garments.length === 0) throw appError("INVALID_INPUT", "Try-on needs photos of your own clothes — sample pieces are illustrations.");
  await assertBelowJobLimit(ctx, user._id);
  const { ok } = await limits.limit(ctx, "tryOnsPerUser", { key: user._id });
  if (!ok) throw appError("RATE_LIMITED", "You've reached today's try-on limit. Try again tomorrow.");

  const jobId = await createJob(ctx, {
    userId: user._id,
    type: "tryon",
    steps: garments.map(({ item }, n) => ({ key: `layer:${n}`, label: `Dressing in ${item.name}` })),
  });
  const renderId = await ctx.db.insert("renders", {
    userId: user._id,
    outfitId: outfit._id,
    avatarId: user.defaultAvatarId!,
    jobId,
    status: "pending",
    createdAt: Date.now(),
  });
  await imagePool.enqueueAction(ctx, internal.ai.tryon.render, { renderId }, {
    onComplete: internal.renders.onRenderDone,
    context: { renderId, jobId },
  });
  await audit(ctx, user._id, "tryon_started", renderId);
  return { jobId, renderId };
}

export const readiness = query({
  args: {},
  returns: v.object({ ready: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx) => {
    const reason = await blocker(ctx, await requireUser(ctx));
    return reason ? { ready: false, reason } : { ready: true };
  },
});

export const start = mutation({
  args: { outfitId: v.id("outfits") },
  returns: v.object({ jobId: v.id("jobs"), renderId: v.id("renders") }),
  handler: async (ctx, { outfitId }) => startTryOn(ctx, await requireUser(ctx), outfitId),
});

export const renderContext = internalQuery({
  args: { renderId: v.id("renders") },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      jobId: v.id("jobs"),
      avatar: v.id("_storage"),
      garments: v.array(v.object({ slot: v.string(), storageId: v.id("_storage"), name: v.string() })),
    }),
  ),
  handler: async (ctx, { renderId }) => {
    const render = await ctx.db.get(renderId);
    const avatar = render ? await ctx.db.get(render.avatarId) : null;
    const outfit = render ? await ctx.db.get(render.outfitId) : null;
    if (!render || !avatar || !outfit) return null;
    const garments = (await layered(ctx, outfit.slots))
      .filter(({ slot, item }) => slot !== "accessories" && item.storageId && !item.sample)
      .map(({ slot, item }) => ({ slot, storageId: item.storageId!, name: item.name }));
    return { userId: render.userId, jobId: render.jobId, avatar: avatar.storageId, garments };
  },
});

export const layerDone = internalMutation({
  args: { jobId: v.id("jobs"), index: v.number() },
  returns: v.null(),
  handler: async (ctx, { jobId, index }) => {
    await setStep(ctx, jobId, `layer:${index}`, { status: "done" });
    return null;
  },
});

export const renderDone = internalMutation({
  args: { renderId: v.id("renders"), storageId: v.id("_storage"), costUsd: v.number() },
  returns: v.null(),
  handler: async (ctx, { renderId, storageId, costUsd }) => {
    const render = await ctx.db.get(renderId);
    if (!render) {
      await ctx.storage.delete(storageId);
      return null;
    }
    await ctx.db.patch(renderId, { status: "done", storageId, provider: "nova-canvas", costUsd, completedAt: Date.now() });
    return null;
  },
});

export const onRenderDone = internalMutation({
  args: vOnCompleteValidator(v.object({ renderId: v.id("renders"), jobId: v.id("jobs") })),
  handler: async (ctx, { context, result }) => {
    const render = await ctx.db.get(context.renderId);
    const job = await ctx.db.get(context.jobId);
    if (result.kind !== "success" && render && render.status === "pending") {
      const error = result.kind === "failed" ? readableError(result.error) : "Cancelled.";
      await ctx.db.patch(render._id, { status: "failed", error, completedAt: Date.now() });
      if (job) {
        for (const step of job.steps) if (step.status !== "done") await setStep(ctx, job._id, step.key, { status: "failed", error });
      }
    } else if (job) {
      for (const step of job.steps) if (step.status !== "done") await setStep(ctx, job._id, step.key, { status: "done" });
    }
  },
});

async function renderView(ctx: { storage: { getUrl(id: Id<"_storage">): Promise<string | null> } }, r: Doc<"renders">) {
  return { ...r, url: r.storageId ? await ctx.storage.getUrl(r.storageId) : null };
}

export const lookbook = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("renders").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(60);
    return Promise.all(
      rows.map(async (r) => ({ ...(await renderView(ctx, r)), outfitName: (await ctx.db.get(r.outfitId))?.name ?? "Outfit", job: await ctx.db.get(r.jobId) })),
    );
  },
});

export const byOutfit = query({
  args: { outfitId: v.id("outfits") },
  handler: async (ctx, { outfitId }) => {
    const user = await requireUser(ctx);
    const outfit = await ctx.db.get(outfitId);
    if (!outfit || outfit.userId !== user._id) return [];
    const rows = await ctx.db.query("renders").withIndex("by_outfit", (q) => q.eq("outfitId", outfitId)).order("desc").take(12);
    return Promise.all(rows.map(async (r) => ({ ...(await renderView(ctx, r)), job: await ctx.db.get(r.jobId) })));
  },
});

export const remove = mutation({
  args: { renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, { renderId }) => {
    const user = await requireUser(ctx);
    const render = assertOwner(await ctx.db.get(renderId), user, "try-on");
    if (render.status === "pending") throw appError("CONFLICT", "Wait for this try-on to finish.");
    if (render.storageId) await ctx.storage.delete(render.storageId);
    await ctx.db.delete(render._id);
    return null;
  },
});

/** Expiring public link (default 7 days). Revoked automatically if photo consent is withdrawn. */
export const share = mutation({
  args: { renderId: v.id("renders") },
  returns: v.string(),
  handler: async (ctx, { renderId }) => {
    const user = await requireUser(ctx);
    const render = assertOwner(await ctx.db.get(renderId), user, "try-on");
    if (render.status !== "done") throw appError("INVALID_INPUT", "Wait for the try-on to finish before sharing it.");
    const token = render.shareToken && (render.shareExpiresAt ?? 0) > Date.now() ? render.shareToken : crypto.randomUUID();
    await ctx.db.patch(render._id, { shareToken: token, shareExpiresAt: Date.now() + LIMITS.shareLinkDays * 86_400_000 });
    await audit(ctx, user._id, "render_shared", render._id);
    return token;
  },
});

export const unshare = mutation({
  args: { renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, { renderId }) => {
    const user = await requireUser(ctx);
    const render = assertOwner(await ctx.db.get(renderId), user, "try-on");
    await ctx.db.patch(render._id, { shareToken: undefined, shareExpiresAt: undefined });
    return null;
  },
});

/** Public. Null when the token is unknown, expired, or the owner withdrew photo consent. */
export const shared = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
    const render = await ctx.db.query("renders").withIndex("by_share", (q) => q.eq("shareToken", token)).unique();
    if (!render || render.status !== "done" || !render.storageId || (render.shareExpiresAt ?? 0) <= Date.now()) return null;
    if (!(await hasConsent(ctx, render.userId, "person_image_use"))) return null;
    const outfit = await ctx.db.get(render.outfitId);
    return { url: await ctx.storage.getUrl(render.storageId), outfitName: outfit?.name ?? "Outfit", createdAt: render.createdAt, expiresAt: render.shareExpiresAt };
  },
});
