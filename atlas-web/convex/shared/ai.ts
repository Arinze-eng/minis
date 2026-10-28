/**
 * The AI privacy and routing policy, shared by the Convex router and the Next.js stylist so the two
 * runtimes can never disagree about where data may go. Pure and isomorphic: no env access, no I/O.
 *
 * Rule (docs/atlas-wardrobe-v2-architecture.md §16): Gemini's free tier may use inputs to improve
 * Google products and allows human review, so personal data never goes there.
 */

export const PROVIDERS = ["bedrock", "groq", "gemini", "openrouter"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const DATA_CLASSES = ["personal_image", "personal_text", "public_text"] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export const CAPABILITIES = ["detect", "cutout", "tryon", "agent", "text", "embed"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Providers that bill real money (AWS credits count). Free tiers are rate-limited, not billed. */
export const PAID_PROVIDERS: ReadonlySet<Provider> = new Set(["bedrock"]);

/** Default chains when no ATLAS_AI_CHAIN_<CAPABILITY> env var is set. */
export const DEFAULT_CHAINS: Record<Capability, readonly Provider[]> = {
  detect: ["bedrock", "groq"],
  cutout: ["bedrock"],
  tryon: ["bedrock"],
  agent: ["groq", "bedrock"],
  text: ["groq", "bedrock", "gemini"],
  embed: ["bedrock"],
};

/** Which providers may ever see each data class. `geminiPaid` = the Gemini key is on a billed project. */
export function allowedProviders(dataClass: DataClass, geminiPaid: boolean): readonly Provider[] {
  switch (dataClass) {
    // Bedrock and Groq both state they do not train on inputs and keep none by default.
    case "personal_image":
      return geminiPaid ? ["bedrock", "groq", "gemini"] : ["bedrock", "groq"];
    case "personal_text":
      return geminiPaid ? ["groq", "bedrock", "gemini"] : ["groq", "bedrock"];
    case "public_text":
      return ["gemini", "groq", "bedrock", "openrouter"];
  }
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

/**
 * The ordered providers to try: the configured chain (or the default), minus anything the data class
 * forbids, minus duplicates and unknown names. An empty result means "no lawful provider" — the caller
 * must fail, never widen the policy.
 */
export function resolveChain(input: {
  capability: Capability;
  dataClass: DataClass;
  configured?: string;
  geminiPaid: boolean;
  allowPaid: boolean;
}): Provider[] {
  const requested = input.configured?.trim()
    ? input.configured.split(",").map((part) => part.trim().toLowerCase()).filter(isProvider)
    : [...DEFAULT_CHAINS[input.capability]];
  const allowed = new Set(allowedProviders(input.dataClass, input.geminiPaid));
  const chain: Provider[] = [];
  for (const provider of requested) {
    if (!allowed.has(provider) || chain.includes(provider)) continue;
    if (PAID_PROVIDERS.has(provider) && !input.allowPaid) continue;
    chain.push(provider);
  }
  return chain;
}
