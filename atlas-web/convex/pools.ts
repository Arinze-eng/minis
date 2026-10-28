import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

const retry = { maxAttempts: 3, initialBackoffMs: 2000, base: 2 };

/** Photo scans and cutouts: cheap, bursty. */
export const visionPool = new Workpool(components.visionPool, {
  maxParallelism: 6,
  retryActionsByDefault: true,
  defaultRetryBehavior: retry,
});

/** Try-on renders: slow and paid, so fewer at once. */
export const imagePool = new Workpool(components.imagePool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
  defaultRetryBehavior: retry,
});
