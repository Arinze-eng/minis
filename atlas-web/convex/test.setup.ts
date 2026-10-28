/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import workpoolTest from "@convex-dev/workpool/test";
import schema from "./schema";

export const modules = import.meta.glob("./**/!(*.*.*)*.*s");

/** A fresh in-memory Convex backend with this app's components registered. */
export function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  shardedCounterTest.register(t);
  workpoolTest.register(t, "visionPool");
  workpoolTest.register(t, "imagePool");
  return t;
}
