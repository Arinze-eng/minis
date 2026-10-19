import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { packFor, type Day } from "./model/pack";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw appError("UPSTREAM_FAILED", "The weather service didn't answer. Try again shortly.");
  return response.json();
}

/** Forecast from Open-Meteo (free, no key). Only the destination name leaves Atlas — never wardrobe data. */
async function forecast(destination: string, start: string, end: string): Promise<{ place: string; days: Day[] }> {
  const geo = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(destination)}`)) as {
    results?: { name: string; country?: string; latitude: number; longitude: number }[];
  };
  const hit = geo.results?.[0];
  if (!hit) throw appError("INVALID_INPUT", `Couldn't find “${destination}”. Try a city name.`);
  const place = hit.country ? `${hit.name}, ${hit.country}` : hit.name;
  const horizon = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
  if (start > horizon) return { place, days: [] };
  const data = (await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&timezone=auto` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&start_date=${start}&end_date=${end < horizon ? end : horizon}`,
  )) as { daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] } };
  const d = data.daily;
  const days = d ? d.time.map((date, i) => ({ date, maxC: d.temperature_2m_max[i]!, minC: d.temperature_2m_min[i]!, rainChance: d.precipitation_probability_max[i] ?? 0 })) : [];
  return { place, days };
}

export const plan = action({
  args: { destination: v.string(), startDate: v.string(), endDate: v.string() },
  returns: v.id("tripPlans"),
  handler: async (ctx, { destination, startDate, endDate }): Promise<Id<"tripPlans">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to plan a trip.");
    const name = destination.trim().slice(0, 80);
    const today = new Date().toISOString().slice(0, 10);
    if (!name) throw appError("INVALID_INPUT", "Where are you going?");
    if (!DATE.test(startDate) || !DATE.test(endDate) || endDate < startDate) throw appError("INVALID_INPUT", "Pick a start and end date.");
    if (endDate < today) throw appError("INVALID_INPUT", "Those dates are in the past.");
    if ((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 > 30) throw appError("INVALID_INPUT", "Trips can be up to 30 days.");
    const { place, days } = await forecast(name, startDate, endDate);
    return ctx.runMutation(internal.travel.savePlan, { subject: identity.subject, destination: place, startDate, endDate, forecast: days });
  },
});

export const savePlan = internalMutation({
  args: {
    subject: v.string(),
    destination: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    forecast: v.array(v.object({ date: v.string(), maxC: v.number(), minC: v.number(), rainChance: v.number() })),
  },
  returns: v.id("tripPlans"),
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", args.subject)).unique();
    if (!user) throw appError("UNAUTHENTICATED", "Sign in to plan a trip.");
    const items = await ctx.db.query("items").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "ready")).take(1500);
    const nights = Math.round((Date.parse(args.endDate) - Date.parse(args.startDate)) / 86_400_000) || 1;
    const packing = packFor(items, args.forecast, nights);
    return ctx.db.insert("tripPlans", {
      userId: user._id,
      destination: args.destination,
      startDate: args.startDate,
      endDate: args.endDate,
      forecast: args.forecast,
      ...packing,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const plans = await ctx.db.query("tripPlans").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(20);
    return Promise.all(
      plans.map(async (p) => ({
        ...p,
        items: (
          await Promise.all(
            p.itemIds.map(async (id) => {
              const item = await ctx.db.get(id);
              return item && { _id: item._id, name: item.name, category: item.category, url: item.storageId ? await ctx.storage.getUrl(item.storageId) : null };
            }),
          )
        ).filter((i) => i !== null),
      })),
    );
  },
});

export const remove = mutation({
  args: { planId: v.id("tripPlans") },
  returns: v.null(),
  handler: async (ctx, { planId }) => {
    const user = await requireUser(ctx);
    const plan = assertOwner(await ctx.db.get(planId), user, "trip");
    await ctx.db.delete(plan._id);
    return null;
  },
});
