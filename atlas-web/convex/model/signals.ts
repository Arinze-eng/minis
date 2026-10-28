import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { LIMITS } from "../shared/domain";

/**
 * Deterministic signal derivation (ported from atlas-web lib/server/signals.ts). Urgency comes only
 * from dates in evidence; unknown cadence is never annualized; cost-per-wear uses confirmed wears.
 * Dedup keys make derivation idempotent, so a dismissed signal stays dismissed.
 */

const DAY_MS = 86_400_000;
const DECLUTTER_DAYS = 90;

export type DerivedSignal = Omit<Doc<"signals">, "_id" | "_creationTime" | "userId" | "state" | "createdAt" | "updatedAt">;

export function annualizedOf(amount: number, cadence: string): number | undefined {
  switch (cadence) {
    case "weekly":
      return amount * 52;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "yearly":
    case "annual":
      return amount;
    default:
      return undefined;
  }
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function deriveSignals(items: Doc<"items">[], findings: Doc<"moneyFindings">[], now = Date.now()): DerivedSignal[] {
  const out: DerivedSignal[] = [];

  for (const f of findings) {
    if (f.state === "ignored") continue;
    const imminent = [f.nextRenewal, f.trialEnd].find(
      (t): t is number => t !== undefined && t - now <= 2 * DAY_MS && t - now > -DAY_MS,
    );
    if (imminent === undefined) continue;
    const annualized = annualizedOf(f.amount, f.cadence);
    const daysLeft = Math.max(1, Math.ceil((imminent - now) / DAY_MS));
    const isTrial = f.trialEnd === imminent;
    out.push({
      kind: "renewal",
      title: `${f.merchant} ${isTrial ? "trial" : "renewal"} is ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}`,
      implication:
        annualized !== undefined
          ? `Review before it continues at ${formatUsd(annualized)}/year.`
          : "Review before it continues; the cadence isn't reliable enough to annualize yet.",
      noticed: `A ${isTrial ? "trial end date" : "renewal date"} for ${f.merchant} appears in read-only evidence.`,
      urgency: "review",
      domains: ["money"],
      evidence: [
        { label: "Merchant", detail: f.merchant },
        { label: "Amount", detail: `${formatUsd(f.amount)} / ${f.cadence}` },
        ...(annualized !== undefined ? [{ label: "Annualized", detail: `${formatUsd(annualized)} / year` }] : []),
        { label: "Date", detail: isoDay(imminent) },
        { label: "Confidence", detail: `${Math.round(f.confidence * 100)}%` },
      ],
      uncertainty: Math.min(0.9, 1 - f.confidence + 0.1),
      capability: "prepare",
      primaryAction: { label: "Review the renewal", href: "/money" },
      dedupKey: `renewal:${f._id}:${isoDay(imminent)}`,
    });
  }

  for (const f of findings) {
    if (!f.priceChanged || f.state === "ignored") continue;
    const to = annualizedOf(f.priceChanged.to, f.cadence);
    const from = annualizedOf(f.priceChanged.from, f.cadence);
    const delta = to !== undefined && from !== undefined ? to - from : undefined;
    out.push({
      kind: "price_change",
      title: `${f.merchant} price changed this cycle`,
      implication:
        delta !== undefined ? `Annualized cost moves by ${formatUsd(delta)} if the new price holds.` : "Confirm the cadence before annualizing.",
      noticed: `The same merchant charged a different amount than before (${formatUsd(f.priceChanged.from)} → ${formatUsd(f.priceChanged.to)}).`,
      urgency: "normal",
      domains: ["money"],
      evidence: [
        { label: "Prior amount", detail: formatUsd(f.priceChanged.from) },
        { label: "New amount", detail: formatUsd(f.priceChanged.to) },
        { label: "Detected", detail: isoDay(f.priceChanged.detectedAt) },
      ],
      uncertainty: 0.4,
      capability: "advise",
      primaryAction: { label: "Compare cycles", href: "/money" },
      dedupKey: `price_change:${f._id}:${isoDay(f.priceChanged.detectedAt)}`,
    });
  }

  for (const item of items) {
    if (item.status !== "ready") continue;
    const since = item.lastWornAt ?? item.createdAt;
    const idleDays = Math.floor((now - since) / DAY_MS);
    if (idleDays >= DECLUTTER_DAYS) {
      out.push({
        kind: "declutter",
        title: `${item.name} hasn't been worn in ${idleDays} days`,
        implication: "Rotate it into a look this week — or decide to donate or resell it.",
        noticed: item.lastWornAt ? "Its last recorded wear is over three months old." : "It has no recorded wears since it was added.",
        urgency: "normal",
        domains: ["wardrobe"],
        evidence: [
          { label: item.lastWornAt ? "Last worn" : "Added", detail: isoDay(since) },
          { label: "Confirmed wears", detail: String(item.wearCount) },
        ],
        uncertainty: 0.3,
        capability: "prepare",
        primaryAction: { label: "Style it", href: `/wardrobe/${item._id}` },
        dedupKey: `declutter:${item._id}:${Math.floor(idleDays / DECLUTTER_DAYS)}`,
      });
    }
    if (item.price && item.wearCount >= 5 && item.price / item.wearCount <= 5) {
      const cpw = item.price / item.wearCount;
      out.push({
        kind: "cpw_milestone",
        title: `${item.name} is under ${formatUsd(5)} per wear`,
        implication: "A healthy cost-per-wear from confirmed wears — not an estimate.",
        noticed: "Logged wears brought this piece's cost per wear below the milestone.",
        urgency: "normal",
        domains: ["wardrobe", "money"],
        evidence: [
          { label: "Price", detail: formatUsd(item.price) },
          { label: "Confirmed wears", detail: String(item.wearCount) },
          { label: "Cost per wear", detail: formatUsd(cpw) },
        ],
        uncertainty: 0.1,
        capability: "advise",
        primaryAction: { label: "Open the piece", href: `/wardrobe/${item._id}` },
        dedupKey: `cpw:${item._id}:${item.wearCount}`,
      });
    }
  }

  const worn = items.filter((i) => i.status === "ready" && i.laundry === "worn");
  if (worn.length >= 6) {
    out.push({
      kind: "laundry",
      title: `${worn.length} pieces are waiting for a wash`,
      implication: "Atlas leaves worn pieces out of outfit suggestions until they're marked clean.",
      noticed: "Wear logs marked these pieces as worn.",
      urgency: "normal",
      domains: ["wardrobe"],
      evidence: worn.slice(0, 5).map((i) => ({ label: "Worn", detail: i.name })),
      uncertainty: 0.05,
      capability: "advise",
      primaryAction: { label: "Mark washed", href: "/wardrobe?laundry=worn" },
      dedupKey: `laundry:${isoDay(now)}`,
    });
  }

  return out;
}

/** Re-derives signals + notifications for one user after any write that changes their inputs. */
export async function syncSignals(ctx: MutationCtx, userId: Id<"users">, now = Date.now()): Promise<void> {
  const items = await ctx.db
    .query("items")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "ready"))
    .take(LIMITS.maxItemsPerUser);
  const findings = await ctx.db
    .query("moneyFindings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(500);

  let notified = 0;
  for (const signal of deriveSignals(items, findings, now)) {
    const existing = await ctx.db
      .query("signals")
      .withIndex("by_user_dedup", (q) => q.eq("userId", userId).eq("dedupKey", signal.dedupKey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...signal, updatedAt: now });
      continue;
    }
    await ctx.db.insert("signals", { ...signal, userId, state: "active", createdAt: now, updatedAt: now });
    // At most 3 new notifications per sync, so a first scan doesn't flood the bell.
    if ((signal.urgency === "review" || signal.kind === "declutter") && notified < 3) {
      notified += 1;
      await notify(ctx, userId, {
        category: signal.domains.includes("money") ? "renewals" : "closet",
        title: signal.title,
        detail: signal.implication,
        action: signal.primaryAction,
        urgency: signal.urgency,
        dedupKey: `notif:${signal.dedupKey}`,
      });
    }
  }
}

export async function notify(
  ctx: MutationCtx,
  userId: Id<"users">,
  n: Pick<Doc<"notifications">, "category" | "title" | "detail" | "action" | "urgency" | "dedupKey">,
): Promise<void> {
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_user_dedup", (q) => q.eq("userId", userId).eq("dedupKey", n.dedupKey))
    .unique();
  if (existing) return;
  await ctx.db.insert("notifications", { ...n, userId, read: false, createdAt: Date.now() });
}
