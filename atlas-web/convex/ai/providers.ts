"use node";

import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { optionalEnv } from "../lib/env";
import type { Provider } from "../shared/ai";
import { PermanentProviderError, RetryableProviderError, classifyStatus } from "./fallback";

/**
 * Raw provider calls for images (vision chat, Nova Canvas). Each throws RetryableProviderError or
 * PermanentProviderError so the fallback core can decide whether to try the next provider.
 */

const TIMEOUT_MS = 60_000;

let bedrock: BedrockRuntimeClient | undefined;
function bedrockClient() {
  bedrock ??= new BedrockRuntimeClient({ region: optionalEnv("AWS_REGION") });
  return bedrock;
}

function rethrowBedrock(error: unknown): never {
  if (error instanceof RetryableProviderError || error instanceof PermanentProviderError) throw error;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  const message = `bedrock ${status ?? "error"}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300);
  throw classifyStatus(status) === "retryable" ? new RetryableProviderError(message, status) : new PermanentProviderError(message, status);
}

/** Vision prompt → text answer. JPEG bytes in. */
export async function visionText(provider: Provider, key: string, prompt: string, jpeg: Buffer): Promise<{ text: string; model: string; costUsd: number }> {
  if (provider === "bedrock") {
    // VERIFY: some regions need the cross-region profile id, e.g. "us.amazon.nova-lite-v1:0".
    const modelId = optionalEnv("ATLAS_BEDROCK_VISION_MODEL") ?? "amazon.nova-lite-v1:0";
    try {
      const result = await bedrockClient().send(
        new ConverseCommand({
          modelId,
          messages: [{ role: "user", content: [{ image: { format: "jpeg", source: { bytes: jpeg } } }, { text: prompt }] }],
          inferenceConfig: { maxTokens: 3000, temperature: 0.1 },
        }),
        { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      const text = result.output?.message?.content?.map((b) => b.text ?? "").join("") ?? "";
      const usage = result.usage;
      // Estimate for the spend cap (USD per 1M tokens); VERIFY against the Bedrock price list.
      const costUsd = ((usage?.inputTokens ?? 0) * 0.06 + (usage?.outputTokens ?? 0) * 0.24) / 1_000_000;
      return { text, model: modelId, costUsd };
    } catch (error) {
      rethrowBedrock(error);
    }
  }

  const config = {
    groq: { url: "https://api.groq.com/openai/v1", model: optionalEnv("ATLAS_GROQ_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct" },
    gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai", model: optionalEnv("ATLAS_GEMINI_VISION_MODEL") ?? "gemini-2.5-flash" },
    openrouter: { url: "https://openrouter.ai/api/v1", model: optionalEnv("ATLAS_OPENROUTER_VISION_MODEL") ?? "" },
  }[provider];
  if (!config.model) throw new RetryableProviderError(`${provider} has no vision model configured`);
  let res: Response;
  try {
    res = await fetch(`${config.url}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
            ],
          },
        ],
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
  return { text: json.choices?.[0]?.message?.content ?? "", model: config.model, costUsd: 0 };
}

const CANVAS_MODEL = () => optionalEnv("ATLAS_BEDROCK_IMAGE_MODEL") ?? "amazon.nova-canvas-v1:0";
/** Estimate per Nova Canvas image for the spend cap; VERIFY current price. */
export const CANVAS_COST_USD = 0.04;

async function canvas(body: Record<string, unknown>): Promise<Buffer> {
  try {
    const result = await bedrockClient().send(
      new InvokeModelCommand({ modelId: CANVAS_MODEL(), contentType: "application/json", accept: "application/json", body: JSON.stringify(body) }),
      { abortSignal: AbortSignal.timeout(120_000) },
    );
    const json = JSON.parse(new TextDecoder().decode(result.body)) as { images?: string[]; error?: string };
    const image = json.images?.[0];
    if (!image) throw new PermanentProviderError(`nova canvas returned no image${json.error ? `: ${json.error}` : ""}`);
    return Buffer.from(image, "base64");
  } catch (error) {
    rethrowBedrock(error);
  }
}

/** Transparent-background cutout (Nova Canvas BACKGROUND_REMOVAL). PNG in, PNG out. */
export function removeBackground(png: Buffer): Promise<Buffer> {
  return canvas({ taskType: "BACKGROUND_REMOVAL", backgroundRemovalParams: { image: png.toString("base64") } });
}

export type GarmentClass = "UPPER_BODY" | "LOWER_BODY" | "FULL_BODY" | "FOOTWEAR";

/** One garment onto the person (Nova Canvas VIRTUAL_TRY_ON). Both images must already fit Canvas rules. */
export function virtualTryOn(params: { person: Buffer; garment: Buffer; garmentClass: GarmentClass; outerLayerOpen?: boolean }): Promise<Buffer> {
  return canvas({
    taskType: "VIRTUAL_TRY_ON",
    virtualTryOnParams: {
      sourceImage: params.person.toString("base64"),
      referenceImage: params.garment.toString("base64"),
      maskType: "GARMENT",
      garmentBasedMask: {
        garmentClass: params.garmentClass,
        ...(params.garmentClass === "UPPER_BODY" ? { garmentStyling: { outerLayerStyle: params.outerLayerOpen ? "OPEN" : "CLOSED" } } : {}),
      },
      maskExclusions: { preserveFace: "ON", preserveHands: "ON", preserveBodyPose: "ON" },
      mergeStyle: "SEAMLESS",
    },
    imageGenerationConfig: { numberOfImages: 1, quality: "standard" },
  });
}
