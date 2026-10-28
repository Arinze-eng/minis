import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { envFlag, envList, envNumber, optionalEnv } from "../lib/env";
import { appError } from "../lib/errors";
import { resolveChain, type Capability, type DataClass, type Provider } from "../shared/ai";
import { NoProviderAvailableError, PermanentProviderError, runWithFallback } from "./fallback";

/**
 * The one path every AI call takes: data-class policy → paid allowance and spend cap → per-user
 * quota → provider failover with key pools → usage ledger. Provider adapters live elsewhere and
 * only receive `(provider, key)`.
 */

export function keysFor(provider: Provider): string[] {
  if (provider === "bedrock") return optionalEnv("AWS_REGION") ? ["aws"] : [];
  if (provider === "groq") return envList("GROQ_API_KEYS");
  if (provider === "gemini") return envList("GEMINI_API_KEYS");
  return envList("OPENROUTER_API_KEYS");
}

export type AiResult<T> = { value: T; model: string; costUsd: number };

export async function runAI<T>(
  ctx: ActionCtx,
  input: {
    capability: Capability;
    dataClass: DataClass;
    userId?: Id<"users">;
    /** Skip the per-user quota (already counted by the mutation that queued this work). */
    quotaCounted?: boolean;
    call: (provider: Provider, key: string) => Promise<AiResult<T>>;
  },
): Promise<{ value: T; provider: Provider; model: string }> {
  const capUsd = envNumber("ATLAS_MAX_DAILY_SPEND_USD", 0);
  const spentUsd = await ctx.runQuery(internal.ai.usage.spendTodayUsd, {});
  const chain = resolveChain({
    capability: input.capability,
    dataClass: input.dataClass,
    configured: optionalEnv(`ATLAS_AI_CHAIN_${input.capability.toUpperCase()}`),
    geminiPaid: envFlag("GEMINI_PAID"),
    allowPaid: envFlag("ATLAS_ALLOW_PAID_AI") && spentUsd < capUsd,
  });
  if (chain.length === 0) {
    throw appError(
      "UPSTREAM_FAILED",
      input.capability === "tryon" || input.capability === "cutout"
        ? "This needs Amazon Bedrock with paid AI enabled (ATLAS_ALLOW_PAID_AI and a daily cap)."
        : "No AI provider is configured for this. Add a Groq key or enable Bedrock.",
    );
  }
  if (!input.quotaCounted) await ctx.runMutation(internal.ai.usage.admit, { userId: input.userId, paid: false });

  try {
    const { value, provider } = await runWithFallback({
      chain,
      keysFor,
      attempt: async (provider, key, keyAlias) => {
        const started = Date.now();
        try {
          const result = await input.call(provider, key);
          await ctx.runMutation(internal.ai.usage.record, {
            userId: input.userId, capability: input.capability, dataClass: input.dataClass, provider,
            model: result.model, keyAlias, costUsd: result.costUsd, latencyMs: Date.now() - started, ok: true,
          });
          return result;
        } catch (error) {
          await ctx.runMutation(internal.ai.usage.record, {
            userId: input.userId, capability: input.capability, dataClass: input.dataClass, provider,
            model: "unknown", keyAlias, costUsd: 0, latencyMs: Date.now() - started, ok: false,
          });
          throw error;
        }
      },
    });
    return { value: value.value, provider, model: value.model };
  } catch (error) {
    if (error instanceof PermanentProviderError) throw appError("INVALID_INPUT", "The AI provider rejected this image or request.");
    if (error instanceof NoProviderAvailableError) {
      const unconfigured = error.attempts.every((a) => a.outcome === "skipped" && a.error === "no key configured");
      throw appError(
        unconfigured ? "CONFLICT" : "UPSTREAM_FAILED",
        unconfigured ? "No AI provider is set up for this yet. Add a Groq key, or enable Amazon Bedrock." : "AI is busy right now. Atlas will retry shortly.",
      );
    }
    throw error;
  }
}
