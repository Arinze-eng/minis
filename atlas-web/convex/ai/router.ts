"use node";

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { optionalEnv } from "../lib/env";
import { CAPABILITIES, DATA_CLASSES, type Provider } from "../shared/ai";
import { literals } from "../shared/validators";
import { PermanentProviderError, RetryableProviderError, classifyStatus } from "./fallback";
import { runAI } from "./run";

/** Text generation through the shared AI path (used by drip copy, research summaries, etc.). */

const TIMEOUT_MS = 30_000;
const OPENAI_COMPATIBLE: Record<Exclude<Provider, "bedrock">, { baseURL: string; modelEnv: string; defaultModel?: string }> = {
  groq: { baseURL: "https://api.groq.com/openai/v1", modelEnv: "ATLAS_GROQ_TEXT_MODEL", defaultModel: "openai/gpt-oss-120b" },
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelEnv: "ATLAS_GEMINI_TEXT_MODEL", defaultModel: "gemini-2.5-flash" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", modelEnv: "ATLAS_OPENROUTER_TEXT_MODEL" },
};

let bedrock: BedrockRuntimeClient | undefined;

async function textCall(provider: Provider, key: string, system: string | undefined, prompt: string, maxTokens: number) {
  if (provider === "bedrock") {
    bedrock ??= new BedrockRuntimeClient({ region: optionalEnv("AWS_REGION") });
    const modelId = optionalEnv("ATLAS_BEDROCK_TEXT_MODEL") ?? "amazon.nova-lite-v1:0"; // VERIFY region profile id
    try {
      const result = await bedrock.send(
        new ConverseCommand({
          modelId,
          ...(system ? { system: [{ text: system }] } : {}),
          messages: [{ role: "user", content: [{ text: prompt }] }],
          inferenceConfig: { maxTokens },
        }),
        { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      const text = result.output?.message?.content?.map((b) => b.text ?? "").join("").trim();
      if (!text) throw new RetryableProviderError("bedrock returned an empty answer");
      const u = result.usage;
      return { value: text, model: modelId, costUsd: ((u?.inputTokens ?? 0) * 0.06 + (u?.outputTokens ?? 0) * 0.24) / 1_000_000 };
    } catch (error) {
      if (error instanceof RetryableProviderError) throw error;
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const message = `bedrock ${status ?? "error"}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300);
      throw classifyStatus(status) === "retryable" ? new RetryableProviderError(message, status) : new PermanentProviderError(message, status);
    }
  }
  const config = OPENAI_COMPATIBLE[provider];
  const model = optionalEnv(config.modelEnv) ?? config.defaultModel;
  if (!model) throw new RetryableProviderError(`${provider} has no model configured`);
  let res: Response;
  try {
    res = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new RetryableProviderError(`${provider} network error: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw classifyStatus(res.status) === "retryable"
      ? new RetryableProviderError(`${provider} ${res.status}: ${detail}`, res.status)
      : new PermanentProviderError(`${provider} ${res.status}: ${detail}`, res.status);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new RetryableProviderError(`${provider} returned an empty answer`);
  return { value: text, model, costUsd: 0 };
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
    const maxTokens = Math.min(Math.max(Math.trunc(args.maxTokens ?? 800), 16), 4096);
    const { value, provider, model } = await runAI(ctx, {
      capability: args.capability,
      dataClass: args.dataClass,
      userId: args.userId,
      call: (provider, key) => textCall(provider, key, args.system, args.prompt, maxTokens),
    });
    return { text: value, provider, model };
  },
});
