import type { Provider } from "../shared/ai";

/**
 * Provider failover with per-provider circuit breakers and per-provider key pools. Pure logic with
 * injected time and attempt functions, so it is unit-testable without any network or Convex runtime.
 *
 * shortcut: breaker and key-throttle state live in module memory, so each Convex action container
 * learns about a throttled provider on its own; move to a shared table if containers multiply.
 */

/** A provider answered "slow down" or "temporarily broken": try the next one. */
export class RetryableProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RetryableProviderError";
  }
}

/** A provider rejected the input itself (bad image, policy, validation): another provider must not be paid to try. */
export class PermanentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PermanentProviderError";
  }
}

/** Nothing in the chain could serve the request. */
export class NoProviderAvailableError extends Error {
  constructor(readonly attempts: Attempt[]) {
    super(
      attempts.length === 0
        ? "No AI provider is allowed or configured for this request."
        : `Every AI provider failed: ${attempts.map((a) => `${a.provider}(${a.outcome})`).join(", ")}`,
    );
    this.name = "NoProviderAvailableError";
  }
}

/** Classify an HTTP status from any provider SDK or fetch. */
export function classifyStatus(status: number | undefined): "retryable" | "permanent" {
  if (status === undefined) return "retryable"; // network error, timeout
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return "retryable";
  return "permanent";
}

export type Attempt = { provider: Provider; keyAlias?: string; outcome: "ok" | "retryable" | "skipped"; error?: string };

const BREAKER_OPEN_MS = 60_000;
const breakerOpenUntil = new Map<Provider, number>();
const keyThrottledAt = new Map<string, number>();

/** For tests: forget all breaker and key state. */
export function resetFallbackState(): void {
  breakerOpenUntil.clear();
  keyThrottledAt.clear();
}

/** Least-recently-throttled key, so a 429 on one key moves traffic to the others. */
export function pickKey(provider: Provider, keys: readonly string[]): { key: string; alias: string } | undefined {
  let best: { key: string; alias: string; throttledAt: number } | undefined;
  keys.forEach((key, index) => {
    const alias = `${provider}#${index + 1}`;
    const throttledAt = keyThrottledAt.get(alias) ?? 0;
    if (!best || throttledAt < best.throttledAt) best = { key, alias, throttledAt };
  });
  return best ? { key: best.key, alias: best.alias } : undefined;
}

export async function runWithFallback<T>(input: {
  chain: readonly Provider[];
  keysFor: (provider: Provider) => readonly string[];
  attempt: (provider: Provider, key: string, keyAlias: string) => Promise<T>;
  now?: () => number;
}): Promise<{ value: T; provider: Provider; keyAlias: string; attempts: Attempt[] }> {
  const now = input.now ?? Date.now;
  const attempts: Attempt[] = [];
  for (const provider of input.chain) {
    if ((breakerOpenUntil.get(provider) ?? 0) > now()) {
      attempts.push({ provider, outcome: "skipped", error: "circuit open" });
      continue;
    }
    const picked = pickKey(provider, input.keysFor(provider));
    if (!picked) {
      attempts.push({ provider, outcome: "skipped", error: "no key configured" });
      continue;
    }
    try {
      const value = await input.attempt(provider, picked.key, picked.alias);
      attempts.push({ provider, keyAlias: picked.alias, outcome: "ok" });
      return { value, provider, keyAlias: picked.alias, attempts };
    } catch (error) {
      if (error instanceof PermanentProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ provider, keyAlias: picked.alias, outcome: "retryable", error: message.slice(0, 200) });
      keyThrottledAt.set(picked.alias, now());
      // One bad key should not open the breaker while the provider has other keys to try.
      if (input.keysFor(provider).length <= 1) breakerOpenUntil.set(provider, now() + BREAKER_OPEN_MS);
    }
  }
  throw new NoProviderAvailableError(attempts);
}
