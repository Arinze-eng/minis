"use node";

import { Agent, tool, type MessageData } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { optionalEnv } from "../lib/env";
import { isAppError } from "../lib/errors";
import type { Provider } from "../shared/ai";
import { RetryableProviderError } from "./fallback";
import { runAI } from "./run";

const OPENAI_COMPATIBLE: Record<Exclude<Provider, "bedrock">, { baseURL: string; model: string }> = {
  groq: { baseURL: "https://api.groq.com/openai/v1", model: optionalEnv("ATLAS_GROQ_AGENT_MODEL") ?? "openai/gpt-oss-120b" },
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: optionalEnv("ATLAS_GEMINI_AGENT_MODEL") ?? "gemini-2.5-flash" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", model: optionalEnv("ATLAS_OPENROUTER_AGENT_MODEL") ?? "" },
};
const BEDROCK_MODEL = optionalEnv("ATLAS_BEDROCK_AGENT_MODEL") ?? "amazon.nova-lite-v1:0"; // VERIFY region profile id

function modelFor(provider: Provider, key: string) {
  if (provider === "bedrock") return { model: new BedrockModel({ modelId: BEDROCK_MODEL, region: optionalEnv("AWS_REGION"), maxTokens: 1500 }), id: BEDROCK_MODEL };
  const config = OPENAI_COMPATIBLE[provider];
  if (!config.model) throw new RetryableProviderError(`${provider} has no agent model configured`);
  return {
    model: new OpenAIModel({ api: "chat", modelId: config.model, apiKey: key, maxTokens: 1500, clientConfig: { baseURL: config.baseURL, timeout: 45_000, maxRetries: 0 } }),
    id: config.model,
  };
}

function instructions(name: string | undefined, prefs: { presentation: string; fit: string; avoidColours: string[]; homeCity?: string }) {
  return [
    "You are Atlas, a calm, practical personal stylist working only with clothes the user already owns.",
    name ? `The user's name is ${name}.` : "",
    `Style presentation: ${prefs.presentation}. Preferred fit: ${prefs.fit}.` +
      (prefs.avoidColours.length ? ` Avoid these colours: ${prefs.avoidColours.join(", ")}.` : "") +
      (prefs.homeCity ? ` They live in ${prefs.homeCity}.` : ""),
    "Rules:",
    "- Look at the wardrobe with the tools before suggesting anything. Never invent pieces or ids.",
    "- To suggest an outfit, call propose_outfit with item ids from the tools. If it reports problems, fix them and try again.",
    "- A dress replaces top and bottom. Prefer clean pieces over ones marked worn or in_wash.",
    "- Only call request_tryon when the user asks to see an outfit on themselves. It asks them to approve; you cannot start it.",
    "- If the wardrobe lacks something, say what is missing plainly. Keep replies short: a sentence or two per outfit.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Model history must alternate and start with the user; merge any same-role neighbours. */
function toMessages(history: { role: "user" | "assistant"; text: string }[]): MessageData[] {
  const out: MessageData[] = [];
  for (const m of history) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content.push({ text: m.text });
    else out.push({ role: m.role, content: [{ text: m.text }] });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

export const reply = internalAction({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    const context = await ctx.runQuery(internal.stylist.turnContext, { threadId });
    if (!context) return null;
    const messages = toMessages(context.history);
    const latest = messages.pop();
    if (!latest || latest.role !== "user") {
      await ctx.runMutation(internal.stylist.finishTurn, { threadId, text: "What would you like to wear?", tools: [], outfitIds: [] });
      return null;
    }

    try {
      const { value } = await runAI(ctx, {
        capability: "agent",
        dataClass: "personal_text",
        userId: context.userId,
        call: async (provider, key) => {
          const turn = await runTurn(ctx, threadId, context.userId, provider, key, instructions(context.name, context.prefs), messages, latest);
          return { value: turn, model: turn.model, costUsd: turn.costUsd };
        },
      });
      await ctx.runMutation(internal.stylist.finishTurn, {
        threadId,
        text: value.text || (value.outfitIds.length ? "Here's what I'd wear." : "I couldn't put together an answer. Try rephrasing?"),
        tools: value.tools,
        outfitIds: value.outfitIds,
        approvalId: value.approvalId,
      });
    } catch (error) {
      const text = isAppError(error) ? error.data.message : "Atlas couldn't answer just now. Try again in a moment.";
      await ctx.runMutation(internal.stylist.finishTurn, { threadId, text, tools: [], outfitIds: [] });
    }
    return null;
  },
});

async function runTurn(
  ctx: ActionCtx,
  threadId: Id<"threads">,
  userId: Id<"users">,
  provider: Provider,
  key: string,
  systemPrompt: string,
  history: MessageData[],
  latest: MessageData,
) {
  const used = new Set<string>();
  const outfitIds: Id<"outfits">[] = [];
  let approvalId: Id<"approvals"> | undefined;

  const tools = [
    tool({
      name: "list_wardrobe",
      description: "List the user's ready wardrobe items, optionally for one category (top, bottom, outerwear, dress, shoes, accessory, bag, headwear).",
      inputSchema: z.object({ category: z.string().optional() }),
      callback: async ({ category }) => {
        used.add("list_wardrobe");
        return ctx.runQuery(internal.stylist.toolWardrobe, { userId, category });
      },
    }),
    tool({
      name: "search_wardrobe",
      description: "Search the wardrobe by words like 'navy blazer' or 'linen'.",
      inputSchema: z.object({ text: z.string() }),
      callback: async ({ text }) => {
        used.add("search_wardrobe");
        return ctx.runQuery(internal.stylist.toolSearch, { userId, text });
      },
    }),
    tool({
      name: "propose_outfit",
      description: "Show the user an outfit made from item ids returned by the wardrobe tools.",
      inputSchema: z.object({
        name: z.string(),
        occasion: z.string().optional(),
        reasoning: z.string().describe("One or two sentences on why it works."),
        outerwear: z.string().optional(),
        top: z.string().optional(),
        bottom: z.string().optional(),
        dress: z.string().optional(),
        shoes: z.string().optional(),
        accessories: z.array(z.string()).optional(),
      }),
      callback: async ({ name, occasion, reasoning, ...slots }) => {
        used.add("propose_outfit");
        const result = await ctx.runMutation(internal.stylist.toolPropose, { threadId, name, occasion, reasoning, slots });
        if (result.outfitId) outfitIds.push(result.outfitId);
        return result.outfitId ? { ok: true, outfitId: result.outfitId } : { ok: false, problems: result.problems };
      },
    }),
    tool({
      name: "request_tryon",
      description: "Ask the user to approve a virtual try-on of a proposed outfit on their photo.",
      inputSchema: z.object({ outfitId: z.string() }),
      callback: async ({ outfitId }) => {
        used.add("request_tryon");
        const result = await ctx.runMutation(internal.stylist.toolRequestTryOn, { threadId, outfitId });
        if (result.approvalId) approvalId = result.approvalId;
        return result.approvalId ? { ok: true, note: "The user will see an approve button." } : { ok: false, problem: result.problem };
      },
    }),
  ];

  const { model, id } = modelFor(provider, key);
  const agent = new Agent({ model, tools, systemPrompt, messages: history, printer: false, retryStrategy: null });
  try {
    const result = await agent.invoke(latest.content);
    const usage = result.metrics?.accumulatedUsage;
    const costUsd = provider === "bedrock" ? ((usage?.inputTokens ?? 0) * 0.06 + (usage?.outputTokens ?? 0) * 0.24) / 1_000_000 : 0;
    return { text: result.toString().trim(), tools: [...used], outfitIds, approvalId, model: id, costUsd };
  } catch (error) {
    // shortcut: a failover retries the whole turn; proposals from the failed attempt stay unsaved drafts.
    throw new RetryableProviderError(error instanceof Error ? error.message : String(error));
  }
}
