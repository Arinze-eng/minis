import { describe, expect, it } from "vitest";

describe("Groq secret", () => {
  it("authenticates against the models endpoint without exposing the key", async () => {
    const key = process.env.GROQ_API_KEY;
    expect(key, "GROQ_API_KEY must be configured in the managed project").toBeTruthy();

    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    expect(response.ok, `Groq models endpoint returned HTTP ${response.status}`).toBe(true);
    const body = (await response.json()) as { data?: unknown };
    expect(Array.isArray(body.data)).toBe(true);
  }, 30_000);
});
