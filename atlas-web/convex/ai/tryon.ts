"use node";

import { NonRetryableError } from "@convex-dev/workpool";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { isAppError } from "../lib/errors";
import { InvalidImageError, fitForCanvas, normalize } from "./imaging";
import { CANVAS_COST_USD, virtualTryOn, type GarmentClass } from "./providers";
import { runAI } from "./run";

/** Slot → Nova Canvas garment class. Accessories are not rendered. */
const CLASS: Record<string, { garmentClass: GarmentClass; open?: boolean } | undefined> = {
  dress: { garmentClass: "FULL_BODY" },
  bottom: { garmentClass: "LOWER_BODY" },
  top: { garmentClass: "UPPER_BODY" },
  outerwear: { garmentClass: "UPPER_BODY", open: true },
  shoes: { garmentClass: "FOOTWEAR" },
};

/**
 * Chained try-on: each garment is layered onto the previous result, inner to outer (strategy B in the
 * plan). Only Bedrock can serve this (personal image, paid), and the router enforces that.
 */
export const render = internalAction({
  args: { renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, { renderId }) => {
    try {
      const context = await ctx.runQuery(internal.renders.renderContext, { renderId });
      if (!context) return null;
      const avatarBlob = await ctx.storage.get(context.avatar);
      if (!avatarBlob) throw new InvalidImageError("Your photo is no longer available.");
      let person = await fitForCanvas(await normalize(await avatarBlob.arrayBuffer(), 1536, "png"), 1024);
      let cost = 0;

      for (const [index, garment] of context.garments.entries()) {
        const spec = CLASS[garment.slot];
        if (!spec) continue;
        const blob = await ctx.storage.get(garment.storageId);
        if (!blob) continue;
        const reference = await fitForCanvas(Buffer.from(await blob.arrayBuffer()), 1024);
        const { value } = await runAI(ctx, {
          capability: "tryon",
          dataClass: "personal_image",
          userId: context.userId,
          quotaCounted: true,
          call: async () => ({
            value: await virtualTryOn({ person, garment: reference, garmentClass: spec.garmentClass, outerLayerOpen: spec.open }),
            model: "nova-canvas",
            costUsd: CANVAS_COST_USD,
          }),
        });
        person = value;
        cost += CANVAS_COST_USD;
        await ctx.runMutation(internal.renders.layerDone, { jobId: context.jobId, index });
      }

      const storageId = await ctx.storage.store(new Blob([new Uint8Array(person)], { type: "image/png" }));
      await ctx.runMutation(internal.renders.renderDone, { renderId, storageId, costUsd: cost });
    } catch (error) {
      if (error instanceof InvalidImageError) throw new NonRetryableError(error.message);
      if (isAppError(error) && error.data.code !== "UPSTREAM_FAILED") throw new NonRetryableError(error.data.message);
      throw error;
    }
    return null;
  },
});
