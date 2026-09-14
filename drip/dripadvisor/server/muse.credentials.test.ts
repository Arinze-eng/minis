import { describe, expect, it } from "vitest";

describe("Muse Model API credentials", () => {
  it("authenticates against the models endpoint without exposing the key", async () => {
    const apiKey = process.env.MODEL_API_KEY;

    if (!apiKey) {
      throw new Error("MODEL_API_KEY is not configured for this project");
    }

    const response = await fetch("https://api.meta.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.ok).toBe(true);
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data?.some((model) => model.id === "muse-spark-1.1")).toBe(true);
  }, 30_000);
});
