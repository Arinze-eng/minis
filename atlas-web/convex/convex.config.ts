import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import shardedCounter from "@convex-dev/sharded-counter/convex.config.js";

// Workflow + per-provider Workpools are registered in Phase 2, with the pipelines that use them.
const app = defineApp();
app.use(rateLimiter);
app.use(shardedCounter);

export default app;
