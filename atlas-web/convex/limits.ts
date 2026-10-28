import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "./_generated/api";

const DAY = 24 * HOUR;

/**
 * Per-user quotas live in the rate-limiter component, not in user tables, so "delete all my data"
 * can never reset them (the Fitcheck wipe-resets-limits bug). Shards keep hot keys conflict-free.
 */
export const limits = new RateLimiter(components.rateLimiter, {
  // Per-user keys see little contention; sharding would split the 500 across shards and block early.
  aiCallsPerUser: { kind: "fixed window", rate: 500, period: DAY },
  uploadsPerUser: { kind: "fixed window", rate: 50, period: DAY },
  scansPerUser: { kind: "fixed window", rate: 100, period: DAY },
  tryOnsPerUser: { kind: "fixed window", rate: 10, period: DAY },
  stylistMessagesPerUser: { kind: "fixed window", rate: 100, period: DAY },
  stylistBurst: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },
});

/** Hot, high-write counters (daily paid spend) without single-document write conflicts. */
export const counters = new ShardedCounter(components.shardedCounter, { defaultShards: 8 });
