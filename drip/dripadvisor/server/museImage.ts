import { storeImage } from "./assets";

const MUSE_IMAGE_MODEL = "muse-image-1.0";

type Reference = { label: string; dataUrl: string };

function extractImage(result: unknown): string {
  const output = (result as { output?: Array<{ type?: string; result?: string }> }).output ?? [];
  const image = output.find((item) => item.type === "image_generation_call" && item.result);
  if (!image?.result) throw new Error("Muse Image returned no generated image");
  return image.result;
}

export async function generateTryOn(input: { personImageDataUrl: string; clothingImageDataUrls: string[]; request?: string }) {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not configured");
  const references: Reference[] = [
    { label: "the person whose identity and pose should be preserved", dataUrl: input.personImageDataUrl },
    ...input.clothingImageDataUrls.map((dataUrl, index) => ({ label: `clothing item ${index + 1}`, dataUrl })),
  ];
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: `Create a realistic fashion try-on image. Preserve the person's face, body identity, skin tone, hair, and natural proportions from the person reference. Dress the person in the supplied clothing references, combining them into one coherent outfit. Keep the clothing colors, silhouette, and major details faithful. Use a simple editorial indoor background, full-body or three-quarter framing, natural light, no text, no logos, no extra people. ${input.request ?? "Make the outfit look polished and wearable."}` },
  ];
  for (const reference of references) {
    content.push({ type: "input_text", text: `Next reference: ${reference.label}.` });
    content.push({ type: "input_image", image_url: reference.dataUrl });
  }
  const response = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MUSE_IMAGE_MODEL, input: [{ role: "user", content }] }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Muse Image request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  const payload = await response.json();
  const base64 = extractImage(payload);
  const stored = await storeImage(`try-on/${Date.now()}.webp`, Buffer.from(base64, "base64"), "image/webp");
  return { url: stored.url, provider: "muse-image" as const, assetProvider: stored.provider, notice: "AI-generated try-on image; fit, facial details, and garment details may not be exact." };
}
