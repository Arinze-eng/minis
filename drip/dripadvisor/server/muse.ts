import { invokeLLM, type MessageContent } from "./_core/llm";
import { ENV } from "./_core/env";

export type GarmentAnalysis = {
  name: string;
  category: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" | "one_piece" | "underlayer" | "other";
  colors: string[];
  pattern: string;
  material: string;
  warmth: number;
  formality: number;
  confidence: number;
  explanation: string;
};

export type OutfitSuggestion = {
  title: string;
  note: string;
  itemIndexes: number[];
  score: number;
};

const garmentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    category: { type: "string", enum: ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "one_piece", "underlayer", "other"] },
    colors: { type: "array", items: { type: "string" }, maxItems: 5 },
    pattern: { type: "string" },
    material: { type: "string" },
    warmth: { type: "integer", minimum: 0, maximum: 3 },
    formality: { type: "integer", minimum: 0, maximum: 3 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    explanation: { type: "string" },
  },
  required: ["name", "category", "colors", "pattern", "material", "warmth", "formality", "confidence", "explanation"],
} as const;

const outfitJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          note: { type: "string" },
          itemIndexes: { type: "array", items: { type: "integer", minimum: 0, maximum: 49 }, maxItems: 8 },
          score: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["title", "note", "itemIndexes", "score"],
      },
    },
  },
  required: ["suggestions"],
} as const;

function parseJson<T>(content: unknown): T {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(fenced) as T;
}

async function callMuse<T>(body: Record<string, unknown>): Promise<T> {
  if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not configured");
  const response = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "muse-spark-1.1", ...body }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Muse request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  return parseJson<T>(payload.choices?.[0]?.message?.content);
}

async function callManus<T>(system: string, content: MessageContent[], schema: typeof garmentJsonSchema | typeof outfitJsonSchema): Promise<T> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: { name: "dripadvisor_response", strict: true, schema } },
  });
  return parseJson<T>(response.choices?.[0]?.message?.content);
}

export async function analyzeGarment(imageDataUrl: string): Promise<{ analysis: GarmentAnalysis; provider: "muse" | "manus" }> {
  const system = "You are DripAdvisor's garment cataloging assistant. Inspect only the provided garment image. Return strict JSON. Never claim details that cannot be reasonably inferred; use broad descriptions and confidence. warmth and formality are 0=low to 3=high.";
  const text = "Analyze this clothing item for a private wardrobe. Give it a useful short name and editable attributes.";
  try {
    const analysis = await callMuse<GarmentAnalysis>({
      messages: [{ role: "system", content: system }, { role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: imageDataUrl } }] }],
      response_format: { type: "json_schema", json_schema: { name: "garment_analysis", strict: true, schema: garmentJsonSchema } },
      reasoning_effort: "minimal",
      max_completion_tokens: 1600,
    });
    return { analysis, provider: "muse" };
  } catch (error) {
    console.warn("[Muse] Falling back to Manus garment analysis:", error instanceof Error ? error.message : error);
    const analysis = await callManus<GarmentAnalysis>(system, [{ type: "text", text }, { type: "image_url", image_url: { url: imageDataUrl } }], garmentJsonSchema);
    return { analysis, provider: "manus" };
  }
}

export async function recommendOutfits(requestText: string, wardrobe: Array<{ name: string; category: string; colors: string[]; warmth: number; formality: number }>, preferences?: string): Promise<{ suggestions: OutfitSuggestion[]; provider: "muse" | "manus" }> {
  const wardrobeText = wardrobe.map((item, index) => `${index}: ${item.name} | ${item.category} | ${item.colors.join(", ")} | warmth ${item.warmth}/3 | formality ${item.formality}/3`).join("\n");
  const system = "You are DripAdvisor, a careful wardrobe stylist. Recommend only items listed in the wardrobe. Return strict JSON with 1-3 complete outfit suggestions. Each itemIndexes value must refer to a listed wardrobe index. Explain the practical styling logic in note.";
  const text = `User request: ${requestText}\nUser style preferences: ${preferences?.trim() || "No saved preferences yet; choose a balanced, wearable look."}\n\nConfirmed wardrobe:\n${wardrobeText}`;
  try {
    const result = await callMuse<{ suggestions: OutfitSuggestion[] }>({
      messages: [{ role: "system", content: system }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: { name: "outfit_recommendations", strict: true, schema: outfitJsonSchema } },
      reasoning_effort: "minimal",
      max_completion_tokens: 1600,
    });
    return { ...result, provider: "muse" };
  } catch (error) {
    console.warn("[Muse] Falling back to Manus outfit recommendations:", error instanceof Error ? error.message : error);
    const result = await callManus<{ suggestions: OutfitSuggestion[] }>(system, [{ type: "text", text }], outfitJsonSchema);
    return { ...result, provider: "manus" };
  }
}

export function providerStatus() {
  return {
    museConfigured: Boolean(process.env.MODEL_API_KEY),
    museModel: "muse-spark-1.1",
    fallback: ENV.forgeApiKey ? "manus" : "deterministic",
  } as const;
}
