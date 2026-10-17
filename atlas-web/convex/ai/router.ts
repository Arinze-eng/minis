"use node";

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { envFlag, envList, envNumber, optionalEnv } from "../lib/env";
import { appError } from "../lib/errors";
import { CAPABILITIES, DATA_CLASSES, resolveChain, type Capability, type DataClass, type Provider } from "../shared/ai";
import { literals } from "../shared/validators";
import {
  NoProviderAvailableError,
  PermanentProviderError,
  RetryableProviderError,
  classifyStatus,
  runWithFallback,
} from "./fallback";

/**
 * The single entry point for AI text calls. Order of checks: data-class policy → paid allowance and
 * spend cap → per-user quota → provider failover with key pools. Image capabilities (detect, cutout,
 * try-on) reuse the same chain resolution and fallback core in their phases.
 */

const REQUEST_TIMEOUT_MS = 30_000;

const OPENAI_COMPATIBLE: Record<Exclude<Provider, "bedrock">, { baseURL: string; keysEnv: string; modelEnv: string; defaultModel?: string }> = {
  groq: { baseURL: "https://api.groq.com/openai/v1", keysEnv: "GROQ_API_KEYS", modelEnv: "ATLAS_GROQ_TEXT_MODEL", defaultModel: "openai/gpt-oss-120b" },
  // VERIFY: current free Flash model id in AI Studio.
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", keysEnv: "GEMINI_API_KEYS", modelEnv: "ATLAS_GEMINI_TEXT_MODEL", defaultModel: "gemini-2.5-flash" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keysEnv: "OPENROUTER_API_KEYS", modelEnv: "ATLAS_OPENROUTER_TEXT_MODEL" },
};

// VERIFY: some regions need the cross-region inference profile id (e.g. "us.amazon.nova-lite-v1:0").
const BEDROCK_TEXT_MODEL = () => optionalEnv("ATLAS_BEDROCK_TEXT_MODEL") ?? "amazon.nova-lite-v1:0";
/** Estimate for the spend cap only (USD per 1M tokens); VERIFY against the Bedrock price list. */
const BEDROCK_TEXT_PRICE = { input: 0.06, output: 0.24 };

type TextResult = { text: string; model: string; costUsd: number };

function keysFor(provider: Provider): string[] {
  // Bedrock authenticates with the AWS credential chain, not an API key; a placeholder lets it enter the pool.
  if (provider === "bedrock") return optionalEnv("AWS_REGION") ? ["aws"] : [];
  return envList(OPENAI_COMPATIBLE[provider].keysEnv);
}

async function openAICompatibleText(provider: Exclude<Provider, "bedrock">, key: string, system: string | undefined, prompt: string, maxTokens: number): Promise<TextResult> {
  const config = OPENAI_COMPATIBLE[provider];
  const model = optionalEnv(config.modelEnv) ?? config.defaultModel;
  if (!model) throw new RetryableProviderError(`${provider} has no model configured`);
  let response: Response;
  try {
    response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RetryableProviderError(`${provider} network error: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    const message = `${provider} ${response.status}: ${detail}`;
    throw classifyStatus(response.status) === "retryable"
      ? new RetryableProviderError(message, response.status)
      : new PermanentProviderError(message, response.status);
  }
  const json = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new RetryableProviderError(`${provider} returned an empty answer`);
  return { text, model, costUsd: 0 };
}

let bedrock: BedrockRuntimeClient | undefined;

async function bedrockText(system: string | undefined, prompt: string, maxTokens: number): Promise<TextResult> {
  bedrock ??= new BedrockRuntimeClient({ region: optionalEnv("AWS_REGION") });
  const modelId = BEDROCK_TEXT_MODEL();
  try {
    const result = await bedrock.send(
      new ConverseCommand({
        modelId,
        ...(system ? { system: [{ text: system }] } : {}),
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens },
      }),
      { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    const text = result.output?.message?.content?.map((block) => block.text ?? "").join("").trim();
    if (!text) throw new RetryableProviderError("bedrock returned an empty answer");
    const usage = result.usage;
    const costUsd =
      ((usage?.inputTokens ?? 0) * BEDROCK_TEXT_PRICE.input + (usage?.outputTokens ?? 0) * BEDROCK_TEXT_PRICE.output) / 1_000_000;
    return { text, model: modelId, costUsd };
  } catch (error) {
    if (error instanceof RetryableProviderError) throw error;
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const message = `bedrock ${status ?? "error"}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300);
    throw classifyStatus(status) === "retryable" ? new RetryableProviderError(message, status) : new PermanentProviderError(message, status);
  }
}

export const generateText = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    capability: literals(CAPABILITIES),
    dataClass: literals(DATA_CLASSES),
    system: v.optional(v.string()),
    prompt: v.string(),
    maxTokens: v.optional(v.number()),
  },
  returns: v.object({ text: v.string(), provider: v.string(), model: v.string() }),
  handler: async (ctx, args) => {
    const capability: Capability = args.capability;
    const dataClass: DataClass = args.dataClass;
    const capUsd = envNumber("ATLAS_MAX_DAILY_SPEND_USD", 0);
    const spentUsd = await ctx.runQuery(internal.ai.usage.spendTodayUsd, {});
    const chain = resolveChain({
      capability,
      dataClass,
      configured: optionalEnv(`ATLAS_AI_CHAIN_${capability.toUpperCase()}`),
      geminiPaid: envFlag("GEMINI_PAID"),
      allowPaid: envFlag("ATLAS_ALLOW_PAID_AI") && spentUsd < capUsd,
    });
    if (chain.length === 0) throw appError("UPSTREAM_FAILED", "No AI provider is allowed for this request right now.");

    await ctx.runMutation(internal.ai.usage.admit, { userId: args.userId, paid: false });
    const maxTokens = Math.min(Math.max(Math.trunc(args.maxTokens ?? 800), 16), 4096);

    try {
      const { value, provider } = await runWithFallback({
        chain,
        keysFor,
        attempt: async (provider, key, alias) => {
          const started = Date.now();
          try {
            const result =
              provider === "bedrock"
                ? await bedrockText(args.system, args.prompt, maxTokens)
                : await openAICompatibleText(provider, key, args.system, args.prompt, maxTokens);
            await ctx.runMutation(internal.ai.usage.record, {
              userId: args.userId, capability, dataClass, provider, model: result.model, keyAlias: alias,
              costUsd: result.costUsd, latencyMs: Date.now() - started, ok: true,
            });
            return result;
          } catch (error) {
            await ctx.runMutation(internal.ai.usage.record, {
              userId: args.userId, capability, dataClass, provider, model: "unknown", keyAlias: alias,
              costUsd: 0, latencyMs: Date.now() - started, ok: false,
            });
            throw error;
          }
        },
      });
      return { text: value.text, provider, model: value.model };
    } catch (error) {
      if (error instanceof PermanentProviderError) throw appError("INVALID_INPUT", "The AI provider rejected this request.");
      if (error instanceof NoProviderAvailableError) throw appError("UPSTREAM_FAILED", "AI is busy right now. Please try again shortly.");
      throw error;
    }
  },
});
