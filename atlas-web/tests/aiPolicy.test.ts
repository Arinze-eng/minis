import { beforeEach, describe, expect, it } from "vitest";
import { allowedProviders, resolveChain, DATA_CLASSES } from "@/convex/shared/ai";
import {
  NoProviderAvailableError,
  PermanentProviderError,
  RetryableProviderError,
  classifyStatus,
  resetFallbackState,
  runWithFallback,
} from "@/convex/ai/fallback";

describe("AI privacy policy", () => {
  it("never routes personal data to Gemini unless the Gemini key is on a paid project", () => {
    for (const dataClass of ["personal_image", "personal_text"] as const) {
      expect(allowedProviders(dataClass, false)).not.toContain("gemini");
      expect(allowedProviders(dataClass, true)).toContain("gemini");
      // A chain that explicitly asks for Gemini first still cannot reach it.
      expect(
        resolveChain({ capability: "text", dataClass, configured: "gemini,groq", geminiPaid: false, allowPaid: true }),
      ).toEqual(["groq"]);
    }
  });

  it("allows Gemini's free tier only for public text", () => {
    expect(resolveChain({ capability: "text", dataClass: "public_text", configured: "gemini", geminiPaid: false, allowPaid: false })).toEqual(["gemini"]);
  });

  it("drops paid providers when paid AI is not allowed", () => {
    expect(resolveChain({ capability: "detect", dataClass: "personal_image", geminiPaid: false, allowPaid: false })).toEqual(["groq"]);
    expect(resolveChain({ capability: "detect", dataClass: "personal_image", geminiPaid: false, allowPaid: true })).toEqual(["bedrock", "groq"]);
    // Try-on has no free provider: without paid AI there is nothing lawful to call.
    expect(resolveChain({ capability: "tryon", dataClass: "personal_image", geminiPaid: false, allowPaid: false })).toEqual([]);
  });

  it("ignores unknown and duplicate providers and keeps configured order", () => {
    expect(
      resolveChain({ capability: "text", dataClass: "public_text", configured: " groq, nope, groq ,gemini", geminiPaid: false, allowPaid: false }),
    ).toEqual(["groq", "gemini"]);
  });

  it("covers every data class", () => {
    for (const dataClass of DATA_CLASSES) expect(allowedProviders(dataClass, false).length).toBeGreaterThan(0);
  });
});

describe("provider failover", () => {
  beforeEach(() => resetFallbackState());

  it("classifies statuses", () => {
    expect(classifyStatus(429)).toBe("retryable");
    expect(classifyStatus(503)).toBe("retryable");
    expect(classifyStatus(undefined)).toBe("retryable");
    expect(classifyStatus(400)).toBe("permanent");
    expect(classifyStatus(401)).toBe("permanent");
  });

  it("falls through to the next provider on a retryable error", async () => {
    const result = await runWithFallback({
      chain: ["groq", "bedrock"],
      keysFor: () => ["k"],
      attempt: async (provider) => {
        if (provider === "groq") throw new RetryableProviderError("429", 429);
        return "from-bedrock";
      },
    });
    expect(result.value).toBe("from-bedrock");
    expect(result.provider).toBe("bedrock");
    expect(result.attempts.map((a) => a.outcome)).toEqual(["retryable", "ok"]);
  });

  it("stops on a permanent error instead of paying another provider", async () => {
    let bedrockCalled = false;
    await expect(
      runWithFallback({
        chain: ["groq", "bedrock"],
        keysFor: () => ["k"],
        attempt: async (provider) => {
          if (provider === "bedrock") bedrockCalled = true;
          throw new PermanentProviderError("bad image", 400);
        },
      }),
    ).rejects.toBeInstanceOf(PermanentProviderError);
    expect(bedrockCalled).toBe(false);
  });

  it("opens a circuit for a single-key provider and skips it until it closes", async () => {
    let now = 1_000;
    const calls: string[] = [];
    const attempt = async (provider: string) => {
      calls.push(provider);
      if (provider === "groq") throw new RetryableProviderError("down", 503);
      return "ok";
    };
    const opts = { chain: ["groq", "bedrock"] as const, keysFor: () => ["k"], attempt, now: () => now };
    await runWithFallback(opts);
    await runWithFallback(opts);
    expect(calls).toEqual(["groq", "bedrock", "bedrock"]);
    now += 61_000;
    await runWithFallback(opts);
    expect(calls.at(-2)).toBe("groq");
  });

  it("rotates to the least recently throttled key", async () => {
    let now = 1_000;
    const used: string[] = [];
    const run = () =>
      runWithFallback({
        chain: ["groq"],
        keysFor: () => ["a", "b"],
        attempt: async (_provider, key) => {
          used.push(key);
          if (key === "a") throw new RetryableProviderError("429", 429);
          return key;
        },
        now: () => now,
      }).catch(() => "failed");
    expect(await run()).toBe("failed"); // first try uses key a, throttled
    now += 1;
    expect((await run()) as { value: string }).toMatchObject({ value: "b" });
    expect(used).toEqual(["a", "b"]);
  });

  it("reports when no provider can serve the request", async () => {
    await expect(runWithFallback({ chain: ["groq"], keysFor: () => [], attempt: async () => "x" })).rejects.toBeInstanceOf(
      NoProviderAvailableError,
    );
  });
});
