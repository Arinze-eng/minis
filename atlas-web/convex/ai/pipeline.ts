"use node";

import { NonRetryableError } from "@convex-dev/workpool";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { isAppError } from "../lib/errors";
import { detectionPrompt, parseDetection } from "../model/detect";
import { DUPLICATE_DISTANCE, hammingHex } from "../model/hash";
import { InvalidImageError, cropBox, dHash, dominantHex, fitForCanvas, normalize } from "./imaging";
import { removeBackground, visionText, CANVAS_COST_USD } from "./providers";
import { runAI } from "./run";

/** Turn errors that retrying cannot fix into NonRetryableError, so the Workpool stops early. */
function settle(error: unknown): never {
  if (error instanceof InvalidImageError) throw new NonRetryableError(error.message);
  if (isAppError(error) && error.data.code !== "UPSTREAM_FAILED") throw new NonRetryableError(error.data.message);
  throw error;
}

/** Scan one photo for wearable pieces. Free tier first (Groq vision), Bedrock Nova Lite when allowed. */
export const scanUpload = internalAction({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    try {
      const context = await ctx.runQuery(internal.uploads.scanContext, { uploadId });
      if (!context) return null;
      await ctx.runMutation(internal.uploads.markDetecting, { uploadId });
      const blob = await ctx.storage.get(context.storageId);
      if (!blob) throw new InvalidImageError("The photo is no longer available.");
      const jpeg = await normalize(await blob.arrayBuffer(), 1280, "jpeg");
      const { value, provider } = await runAI(ctx, {
        capability: "detect",
        dataClass: "personal_image",
        userId: context.userId,
        call: async (p, key) => {
          const result = await visionText(p, key, detectionPrompt(), jpeg);
          return { value: result.text, model: result.model, costUsd: result.costUsd };
        },
      });
      await ctx.runMutation(internal.uploads.recordCandidates, { uploadId, items: parseDetection(value), provider });
    } catch (error) {
      settle(error);
    }
    return null;
  },
});

/** Cut one selected piece out of its photo: crop → background removal (Bedrock) → colours → hash → dedupe. */
export const extractItem = internalAction({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    try {
      const context = await ctx.runQuery(internal.uploads.extractContext, { itemId });
      if (!context) return null;
      const blob = await ctx.storage.get(context.photo);
      if (!blob) throw new InvalidImageError("The source photo is no longer available.");
      const photo = await normalize(await blob.arrayBuffer(), 2048, "png");
      const crop = await cropBox(photo, context.bbox);

      let cutout = crop;
      let provider = "crop";
      try {
        const { value } = await runAI(ctx, {
          capability: "cutout",
          dataClass: "personal_image",
          userId: context.userId,
          call: async () => ({ value: await removeBackground(await fitForCanvas(crop)), model: "nova-canvas", costUsd: CANVAS_COST_USD }),
        });
        cutout = value;
        provider = "nova-canvas";
      } catch {
        // No paid provider or a rejection: keep the plain crop, labelled honestly as "crop".
      }

      const [hex, phash] = await Promise.all([dominantHex(cutout), dHash(cutout)]);
      const others = await ctx.runQuery(internal.uploads.userHashes, { userId: context.userId, exclude: itemId });
      const duplicate = others.find((o) => o.category === context.category && hammingHex(o.phash, phash) <= DUPLICATE_DISTANCE);
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(cutout)], { type: "image/png" }));
      await ctx.runMutation(internal.uploads.itemReady, { itemId, storageId, hex, phash, provider, duplicateOfId: duplicate?.id });
    } catch (error) {
      settle(error);
    }
    return null;
  },
});
