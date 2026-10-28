import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import shardedCounter from "@convex-dev/sharded-counter/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";

const app = defineApp();
app.use(rateLimiter);
app.use(shardedCounter);
// Separate pools per workload so slow try-ons never starve photo scans (load balancing).
app.use(workpool, { name: "visionPool" });
app.use(workpool, { name: "imagePool" });

export default app;
