import { and, desc, eq } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { atlasChatMessages, atlasMoneyFindings, atlasPreferences, atlasSignals, atlasSources, atlasTasks, atlasWardrobe } from "../drizzle/schema";

export const PREVIEW_OWNER = "preview-owner";

export function ownerId(openId?: string | null) {
  return openId || PREVIEW_OWNER;
}

const safeJson = (value: unknown, fallback: unknown) => {
  try { return value ? JSON.parse(String(value)) : fallback; } catch { return fallback; }
};

export async function seedAtlasOwner(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return false;
  try {
    const existing = await db.select({ id: atlasTasks.id }).from(atlasTasks).where(eq(atlasTasks.ownerOpenId, ownerOpenId)).limit(1);
    if (existing.length) return true;
    await db.insert(atlasTasks).values([
      { ownerOpenId, title: "Review your pending tasks", source: "Google Tasks", meta: "1 overdue · 3 due soon", status: "open" },
      { ownerOpenId, title: "Plan a focused work block", source: "Drip Advice", meta: "Suggested for this morning", status: "open" },
      { ownerOpenId, title: "Compare black running shoes", source: "Shopping research", meta: "Under $100 · 5 sources", status: "open" },
    ]);
    await db.insert(atlasSignals).values([
      { ownerOpenId, title: "Review your pending tasks", implication: "One item is overdue and three are due soon.", urgency: "urgent", state: "active", domains: "tasks", actionLabel: "Review task list", actionHref: "/tasks", evidence: JSON.stringify(["Google Tasks", "read-only connector"]) },
      { ownerOpenId, title: "Compare black running shoes", implication: "Five sources support the price range, but color still needs confirmation.", urgency: "review", state: "active", domains: "research", actionLabel: "Open research", actionHref: "/research", evidence: JSON.stringify(["SerpApi", "5 source trail"]) },
    ]);
    await db.insert(atlasWardrobe).values([
      { ownerOpenId, name: "Oxford shirt", category: "top", colors: JSON.stringify(["white"]), status: "confirmed", price: "85.00", currency: "USD" },
      { ownerOpenId, name: "Straight-leg trousers", category: "bottom", colors: JSON.stringify(["charcoal"]), status: "confirmed", price: "120.00", currency: "USD" },
      { ownerOpenId, name: "Leather sneakers", category: "shoes", colors: JSON.stringify(["white"]), status: "confirmed", price: "140.00", currency: "USD" },
      { ownerOpenId, name: "Rain shell", category: "outerwear", colors: JSON.stringify(["navy"]), status: "confirmed", price: "165.00", currency: "USD" },
    ]);
    await db.insert(atlasMoneyFindings).values([
      { ownerOpenId, merchant: "SampleStream", productName: "Subscription renewal", amount: "20.00", annualized: "240.00", currency: "USD", cadence: "monthly", state: "open", confidence: 92, evidence: "Renews soon · review before deciding" },
      { ownerOpenId, merchant: "CloudBox", productName: "Storage plan", amount: "37.00", annualized: "444.00", currency: "USD", cadence: "monthly", state: "open", confidence: 88, evidence: "Recurring charge detected" },
    ]);
    await db.insert(atlasSources).values([
      { ownerOpenId, name: "Google Tasks", provider: "google_tasks", status: "connected", detail: "Task evidence is available to the priority queue." },
      { ownerOpenId, name: "SerpApi", provider: "serpapi", status: "connected", detail: "Shopping evidence is normalized with source trails." },
      { ownerOpenId, name: "Cloudinary", provider: "cloudinary", status: "connected", detail: "Signed wardrobe image storage is configured." },
      { ownerOpenId, name: "Telegram", provider: "telegram", status: "safe_mode", detail: "Health checks pass; delivery is disabled by policy." },
    ]);
    return true;
  } catch (error) {
    console.warn("[Atlas] Seed skipped:", error);
    return false;
  }
}

export async function getDashboard(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    await seedAtlasOwner(ownerOpenId);
    const [tasks, signals, wardrobe, money, sources, preferences] = await Promise.all([
      db.select().from(atlasTasks).where(eq(atlasTasks.ownerOpenId, ownerOpenId)).orderBy(desc(atlasTasks.createdAt)),
      db.select().from(atlasSignals).where(eq(atlasSignals.ownerOpenId, ownerOpenId)).orderBy(desc(atlasSignals.createdAt)),
      db.select().from(atlasWardrobe).where(eq(atlasWardrobe.ownerOpenId, ownerOpenId)).orderBy(desc(atlasWardrobe.createdAt)),
      db.select().from(atlasMoneyFindings).where(eq(atlasMoneyFindings.ownerOpenId, ownerOpenId)).orderBy(desc(atlasMoneyFindings.createdAt)),
      db.select().from(atlasSources).where(eq(atlasSources.ownerOpenId, ownerOpenId)).orderBy(atlasSources.name),
      db.select().from(atlasPreferences).where(eq(atlasPreferences.ownerOpenId, ownerOpenId)).limit(1),
    ]);
    return { tasks, signals, wardrobe, money, sources, preferences: preferences[0] ?? null };
  } catch (error) {
    console.warn("[Atlas] Dashboard unavailable:", error);
    return null;
  }
}

export async function completeTask(ownerOpenId: string, id: number, status: "open" | "completed" | "snoozed") {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(atlasTasks).set({ status }).where(and(eq(atlasTasks.id, id), eq(atlasTasks.ownerOpenId, ownerOpenId)));
  return result[0].affectedRows > 0;
}

export async function updateSignal(ownerOpenId: string, id: number, state: "active" | "dismissed" | "completed") {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(atlasSignals).set({ state }).where(and(eq(atlasSignals.id, id), eq(atlasSignals.ownerOpenId, ownerOpenId)));
  return result[0].affectedRows > 0;
}

export async function savePreferences(ownerOpenId: string, input: { quietHoursEnabled: boolean; quietStart: string; quietEnd: string; webuiNotifications: boolean; telegramDelivery: boolean }) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(atlasPreferences).values({ ownerOpenId, ...input }).onDuplicateKeyUpdate({ set: input });
  const rows = await db.select().from(atlasPreferences).where(eq(atlasPreferences.ownerOpenId, ownerOpenId)).limit(1);
  return rows[0] ?? null;
}

export async function getChatHistory(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  try { return await db.select().from(atlasChatMessages).where(eq(atlasChatMessages.ownerOpenId, ownerOpenId)).orderBy(desc(atlasChatMessages.createdAt)).limit(30); } catch { return []; }
}

export async function sendChat(ownerOpenId: string, message: string) {
  const db = await getDb();
  const history = db ? await getChatHistory(ownerOpenId) : [];
  const context = await getDashboard(ownerOpenId);
  const system = `You are Drip Advisor, a bounded personal intelligence assistant. Use only the provided context. Never claim to have sent, purchased, cancelled, edited, or scheduled anything. If data is missing, say so. Give a concise practical answer and suggest the relevant page when useful. Context: ${JSON.stringify({ tasks: context?.tasks ?? [], signals: context?.signals ?? [], wardrobe: context?.wardrobe ?? [], money: context?.money ?? [], sources: context?.sources ?? [] })}`;
  let reply = "I’m ready to help, but the live model is temporarily unavailable. Try the Overview or Research page while I reconnect.";
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: system },
        ...history.reverse().map((item) => ({ role: item.role as "user" | "assistant", content: item.content })),
        { role: "user", content: message },
      ],
      max_tokens: 500,
    });
    const content = response.choices[0]?.message.content;
    reply = typeof content === "string" ? content : content.map((part) => part.type === "text" ? part.text : "").join("");
  } catch (error) {
    console.warn("[Atlas] Chat fallback:", error);
    if (/focus|today|attention/i.test(message)) reply = "Start with the overdue task in your Inbox. I can prepare context, but I will not change or send anything without your approval.";
    else if (/wardrobe|outfit|look/i.test(message)) reply = "Your confirmed wardrobe includes an Oxford shirt, straight-leg trousers, leather sneakers, and a rain shell. Open Looks to compose a grounded outfit.";
    else if (/money|subscription|charge/i.test(message)) reply = "Money review currently has two recurring findings: SampleStream and CloudBox. Open Money review for the evidence and manual next steps.";
  }
  if (db) {
    try {
      await db.insert(atlasChatMessages).values([{ ownerOpenId, role: "user", content: message }, { ownerOpenId, role: "assistant", content: reply }]);
    } catch (error) { console.warn("[Atlas] Chat persistence skipped:", error); }
  }
  return { reply, liveModel: reply !== "I’m ready to help, but the live model is temporarily unavailable. Try the Overview or Research page while I reconnect." };
}

export async function searchResearch(query: string) {
  const key = process.env.ATLAS_SERPAPI_API_KEY || process.env.SERPAPI_API_KEY;
  const enabled = process.env.ATLAS_ENABLE_SERPAPI === "true" || process.env.ATLAS_ENABLE_SERPAPI === "1";
  if (key && enabled) {
    try {
      const params = new URLSearchParams({ engine: "google", q: query, api_key: key, num: "5" });
      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      if (response.ok) {
        const body = await response.json() as { organic_results?: Array<{ title?: string; link?: string; snippet?: string; source?: string }> };
        return (body.organic_results ?? []).slice(0, 5).map((item, index) => ({ title: item.title ?? query, source: item.source ?? item.link ?? "Search result", detail: item.snippet ?? "Source returned by SerpApi", tag: index < 3 ? "Shopping" : "Context", href: item.link ?? null }));
      }
    } catch (error) { console.warn("[Atlas] SerpApi fallback:", error); }
  }
  return [
    { title: query, source: "Configured research connector", detail: "Live source lookup is unavailable; this result is clearly marked as a fallback.", tag: "Fallback", href: null },
  ];
}

export const parseJson = safeJson;
