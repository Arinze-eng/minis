/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai_fallback from "../ai/fallback.js";
import type * as ai_imaging from "../ai/imaging.js";
import type * as ai_pipeline from "../ai/pipeline.js";
import type * as ai_providers from "../ai/providers.js";
import type * as ai_router from "../ai/router.js";
import type * as ai_run from "../ai/run.js";
import type * as ai_stylist from "../ai/stylist.js";
import type * as ai_tryon from "../ai/tryon.js";
import type * as ai_usage from "../ai/usage.js";
import type * as approvals from "../approvals.js";
import type * as avatars from "../avatars.js";
import type * as consent from "../consent.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as items from "../items.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_clerkGoogle from "../lib/clerkGoogle.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_google from "../lib/google.js";
import type * as lib_secretBox from "../lib/secretBox.js";
import type * as limits from "../limits.js";
import type * as model_core from "../model/core.js";
import type * as model_detect from "../model/detect.js";
import type * as model_email from "../model/email.js";
import type * as model_gaps from "../model/gaps.js";
import type * as model_hash from "../model/hash.js";
import type * as model_jobs from "../model/jobs.js";
import type * as model_outfits from "../model/outfits.js";
import type * as model_pack from "../model/pack.js";
import type * as model_samples from "../model/samples.js";
import type * as model_signals from "../model/signals.js";
import type * as money from "../money.js";
import type * as outfits from "../outfits.js";
import type * as pools from "../pools.js";
import type * as privacy from "../privacy.js";
import type * as renders from "../renders.js";
import type * as samples from "../samples.js";
import type * as shared_ai from "../shared/ai.js";
import type * as shared_domain from "../shared/domain.js";
import type * as shared_validators from "../shared/validators.js";
import type * as sources from "../sources.js";
import type * as stylist from "../stylist.js";
import type * as travel from "../travel.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "ai/fallback": typeof ai_fallback;
  "ai/imaging": typeof ai_imaging;
  "ai/pipeline": typeof ai_pipeline;
  "ai/providers": typeof ai_providers;
  "ai/router": typeof ai_router;
  "ai/run": typeof ai_run;
  "ai/stylist": typeof ai_stylist;
  "ai/tryon": typeof ai_tryon;
  "ai/usage": typeof ai_usage;
  approvals: typeof approvals;
  avatars: typeof avatars;
  consent: typeof consent;
  crons: typeof crons;
  daily: typeof daily;
  http: typeof http;
  inbox: typeof inbox;
  items: typeof items;
  "lib/auth": typeof lib_auth;
  "lib/clerkGoogle": typeof lib_clerkGoogle;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "lib/google": typeof lib_google;
  "lib/secretBox": typeof lib_secretBox;
  limits: typeof limits;
  "model/core": typeof model_core;
  "model/detect": typeof model_detect;
  "model/email": typeof model_email;
  "model/gaps": typeof model_gaps;
  "model/hash": typeof model_hash;
  "model/jobs": typeof model_jobs;
  "model/outfits": typeof model_outfits;
  "model/pack": typeof model_pack;
  "model/samples": typeof model_samples;
  "model/signals": typeof model_signals;
  money: typeof money;
  outfits: typeof outfits;
  pools: typeof pools;
  privacy: typeof privacy;
  renders: typeof renders;
  samples: typeof samples;
  "shared/ai": typeof shared_ai;
  "shared/domain": typeof shared_domain;
  "shared/validators": typeof shared_validators;
  sources: typeof sources;
  stylist: typeof stylist;
  travel: typeof travel;
  uploads: typeof uploads;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  shardedCounter: import("@convex-dev/sharded-counter/_generated/component.js").ComponentApi<"shardedCounter">;
  visionPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"visionPool">;
  imagePool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"imagePool">;
};
