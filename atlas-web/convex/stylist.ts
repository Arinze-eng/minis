import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fileApproval } from "./approvals";
import { limits } from "./limits";
import { assertOwner, requireUser } from "./lib/auth";
import { appError, isAppError } from "./lib/errors";
import { outfitView } from "./outfits";
import { validateSlots, type OutfitSlots } from "./model/outfits";
import { CATEGORIES } from "./shared/domain";
import { DEFAULT_PREFS } from "./shared/validators";

const BUSY_MS = 3 * 60_000;
const HISTORY = 20;

export const threads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db.query("threads").withIndex("by_user_last", (q) => q.eq("userId", user._id)).order("desc").take(50);
  },
});

/** Messages with their proposed outfits and approval inlined, oldest first. */
export const thread = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const user = await requireUser(ctx);
    const id = ctx.db.normalizeId("threads", threadId);
    const thread = id ? await ctx.db.get(id) : null;
    if (!thread || thread.userId !== user._id) return null;
    const rows = await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", thread._id)).order("desc").take(100);
    const messages = await Promise.all(
      rows.reverse().map(async (m) => {
        const outfits = [];
        for (const outfitId of m.outfitIds ?? []) {
          const outfit = await ctx.db.get(outfitId);
          if (outfit) outfits.push(await outfitView(ctx, outfit));
        }
        const approval = m.approvalId ? await ctx.db.get(m.approvalId) : null;
        return { ...m, outfits, approval };
      }),
    );
    return { thread: { ...thread, busy: thread.busy && Date.now() - thread.lastMessageAt < BUSY_MS }, messages };
  },
});

export const send = mutation({
  args: { threadId: v.optional(v.id("threads")), text: v.string() },
  returns: v.id("threads"),
  handler: async (ctx, { threadId, text }) => {
    const user = await requireUser(ctx);
    const body = text.trim();
    if (!body || body.length > 2000) throw appError("INVALID_INPUT", "Write a message of up to 2,000 characters.");
    const burst = await limits.limit(ctx, "stylistBurst", { key: user._id });
    if (!burst.ok) throw appError("RATE_LIMITED", "Slow down a little — try again in a few seconds.");
    const daily = await limits.limit(ctx, "stylistMessagesPerUser", { key: user._id });
    if (!daily.ok) throw appError("RATE_LIMITED", "You've reached today's stylist limit. Try again tomorrow.");

    const now = Date.now();
    let id: Id<"threads">;
    if (threadId) {
      const thread = assertOwner(await ctx.db.get(threadId), user, "conversation");
      if (thread.busy && now - thread.lastMessageAt < BUSY_MS) throw appError("CONFLICT", "Atlas is still answering.");
      id = thread._id;
      await ctx.db.patch(id, { busy: true, lastMessageAt: now });
    } else {
      id = await ctx.db.insert("threads", { userId: user._id, title: body.slice(0, 60), busy: true, lastMessageAt: now, createdAt: now });
    }
    await ctx.db.insert("messages", { userId: user._id, threadId: id, role: "user", text: body, createdAt: now });
    await ctx.scheduler.runAfter(0, internal.ai.stylist.reply, { threadId: id });
    return id;
  },
});

export const removeThread = mutation({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    const user = await requireUser(ctx);
    const thread = assertOwner(await ctx.db.get(threadId), user, "conversation");
    for (const m of await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", thread._id)).take(1000)) await ctx.db.delete(m._id);
    for (const o of await ctx.db.query("outfits").withIndex("by_thread", (q) => q.eq("threadId", thread._id)).take(500)) {
      if (!o.savedAt) await ctx.db.delete(o._id);
    }
    await ctx.db.delete(thread._id);
    return null;
  },
});

// ---- Internal: what the agent action reads and writes. userId always comes from the thread row. ----

export const turnContext = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const thread = await ctx.db.get(threadId);
    const user = thread ? await ctx.db.get(thread.userId) : null;
    if (!thread || !user) return null;
    const rows = await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).order("desc").take(HISTORY);
    return {
      userId: user._id,
      name: user.name,
      prefs: { ...DEFAULT_PREFS, ...user.prefs },
      history: rows.reverse().map((m) => ({ role: m.role, text: m.text })),
    };
  },
});

export const finishTurn = internalMutation({
  args: {
    threadId: v.id("threads"),
    text: v.string(),
    tools: v.array(v.string()),
    outfitIds: v.array(v.id("outfits")),
    approvalId: v.optional(v.id("approvals")),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, text, tools, outfitIds, approvalId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) return null;
    const now = Date.now();
    await ctx.db.insert("messages", {
      userId: thread.userId,
      threadId,
      role: "assistant",
      text: text.slice(0, 8000),
      tools: tools.length ? tools : undefined,
      outfitIds: outfitIds.length ? outfitIds : undefined,
      approvalId,
      createdAt: now,
    });
    await ctx.db.patch(threadId, { busy: false, lastMessageAt: now });
    return null;
  },
});

const compact = (item: { _id: Id<"items">; name: string; category: string; colours: { primary: string }; formality: string; seasons: string[]; laundry: string; wearCount: number; lastWornAt?: number }) => ({
  id: item._id,
  name: item.name,
  category: item.category,
  colour: item.colours.primary,
  formality: item.formality,
  seasons: item.seasons,
  laundry: item.laundry,
  wears: item.wearCount,
  daysSinceWorn: item.lastWornAt ? Math.floor((Date.now() - item.lastWornAt) / 86_400_000) : null,
});

export const toolWardrobe = internalQuery({
  args: { userId: v.id("users"), category: v.optional(v.string()) },
  handler: async (ctx, { userId, category }) => {
    const rows = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "ready")).take(400);
    const wanted = category && (CATEGORIES as readonly string[]).includes(category) ? category : undefined;
    // shortcut: first 150 items only, page by category once wardrobes outgrow it.
    return rows.filter((i) => !wanted || i.category === wanted).slice(0, 150).map(compact);
  },
});

export const toolSearch = internalQuery({
  args: { userId: v.id("users"), text: v.string() },
  handler: async (ctx, { userId, text }) => {
    const term = text.trim().toLowerCase().slice(0, 64);
    if (!term) return [];
    const rows = await ctx.db
      .query("items")
      .withSearchIndex("search_text", (q) => q.search("searchText", term).eq("userId", userId).eq("status", "ready"))
      .take(25);
    return rows.map(compact);
  },
});

const vLooseSlots = v.object({
  outerwear: v.optional(v.string()),
  top: v.optional(v.string()),
  bottom: v.optional(v.string()),
  dress: v.optional(v.string()),
  shoes: v.optional(v.string()),
  accessories: v.optional(v.array(v.string())),
});

/** Validates model-supplied ids against the user's wardrobe; returns problems instead of throwing. */
export const toolPropose = internalMutation({
  args: { threadId: v.id("threads"), name: v.string(), occasion: v.optional(v.string()), reasoning: v.string(), slots: vLooseSlots },
  handler: async (ctx, { threadId, name, occasion, reasoning, slots }): Promise<{ outfitId?: Id<"outfits">; problems: string[] }> => {
    const thread = await ctx.db.get(threadId);
    const user = thread ? await ctx.db.get(thread.userId) : null;
    if (!thread || !user) return { problems: ["conversation not found"] };
    const id = (raw?: string) => (raw ? (ctx.db.normalizeId("items", raw) ?? undefined) : undefined);
    const bad = [slots.outerwear, slots.top, slots.bottom, slots.dress, slots.shoes, ...(slots.accessories ?? [])].filter((raw) => raw && !id(raw));
    if (bad.length) return { problems: bad.map((raw) => `"${raw}" is not an item id from the wardrobe tools`) };
    const clean: OutfitSlots = {
      outerwear: id(slots.outerwear),
      top: id(slots.top),
      bottom: id(slots.bottom),
      dress: id(slots.dress),
      shoes: id(slots.shoes),
      accessories: (slots.accessories ?? []).map((raw) => id(raw)!),
    };
    const problems = await validateSlots(ctx, user, clean, true);
    if (problems.length) return { problems };
    const now = Date.now();
    const outfitId = await ctx.db.insert("outfits", {
      userId: user._id,
      name: name.trim().slice(0, 60) || "Suggested outfit",
      slots: clean,
      occasion: occasion?.trim().slice(0, 60) || undefined,
      reasoning: reasoning.trim().slice(0, 600),
      source: "agent",
      threadId,
      wearCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { outfitId, problems: [] };
  },
});

export const toolRequestTryOn = internalMutation({
  args: { threadId: v.id("threads"), outfitId: v.string() },
  handler: async (ctx, { threadId, outfitId }): Promise<{ approvalId?: Id<"approvals">; problem?: string }> => {
    const thread = await ctx.db.get(threadId);
    const user = thread ? await ctx.db.get(thread.userId) : null;
    const id = ctx.db.normalizeId("outfits", outfitId);
    if (!thread || !user || !id) return { problem: "unknown outfit id" };
    try {
      return { approvalId: await fileApproval(ctx, user, id, threadId) };
    } catch (error) {
      return { problem: isAppError(error) ? error.data.message : "could not file the request" };
    }
  },
});
