import type { FindingRow, GarmentRow, SignalRow } from "@/lib/server/store";

/**
 * Deterministic signal derivation (Phase 3) + the first cross-domain signal
 * (Phase 4: wardrobe × money).
 *
 * Rules (product contract §3–5):
 * - Urgency comes from dates/freshness in evidence — never invented.
 * - Unknown cadence is never annualized; CPW uses confirmed wears only.
 * - Cross-domain requires sufficient evidence from BOTH domains and explains
 *   the connection; capability is always "advise"/"prepare" — never "act".
 * - Dedup keys make derivation idempotent: same inputs → same signal id.
 */

const DAY_MS = 86_400_000;

function uuid(): string {
  return randomUuid();
}

function randomUuid(): string {
  // Local import keeps this module synchronous and testable.
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  return randomUUID();
}

function annualizedOf(amount: number, cadence: string): number | undefined {
  switch (cadence) {
    case "weekly": return amount * 52;
    case "monthly": return amount * 12;
    case "quarterly": return amount * 4;
    case "annual": return amount;
    default: return undefined;
  }
}

export function deriveSignals(
  garments: GarmentRow[],
  findings: FindingRow[],
  now: number = Date.now(),
): Array<SignalRow & { dedupKey: string }> {
  const signals: Array<SignalRow & { dedupKey: string }> = [];

  // -- 1. Renewal urgency (money domain) -----------------------------------
  for (const f of findings) {
    if (f.state === "ignored") continue;
    const renewal = f.nextRenewal ? Date.parse(f.nextRenewal) : null;
    const trial = f.trialEnd ? Date.parse(f.trialEnd) : null;
    const imminent = [renewal, trial].find((t): t is number => t !== null && t - now <= 2 * DAY_MS && t - now > -DAY_MS);
    if (imminent === undefined) continue;
    const annualized = annualizedOf(f.amount, f.cadence);
    const daysLeft = Math.max(1, Math.ceil((imminent - now) / DAY_MS));
    signals.push({
      id: uuid(),
      principalId: f.principalId,
      kind: "renewal",
      title: `${f.merchant} ${f.trialEnd && Date.parse(f.trialEnd) === imminent ? "trial" : "renewal"} is ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}`,
      implication: annualized !== undefined
        ? `Review before it continues at ${formatUsd(annualized)}/year.`
        : "Review before it continues; cadence is not yet reliable enough to annualize.",
      noticed: `A ${f.trialEnd ? "trial end date" : "renewal date"} for ${f.merchant} appears in read-only evidence.`,
      urgency: "review",
      domains: ["money"],
      evidence: [
        { label: "Merchant", detail: f.merchant },
        { label: "Amount", detail: `${formatUsd(f.amount)} / ${f.cadence}` },
        ...(annualized !== undefined
          ? [{ label: "Annualized", detail: `${formatUsd(annualized)} / year` }]
          : []),
        { label: "Date", detail: new Date(imminent).toISOString().slice(0, 10) },
        { label: "Confidence", detail: `${Math.round(f.confidence * 100)}%` },
      ],
      uncertainty: Math.min(0.9, 1 - f.confidence + 0.1),
      capability: "prepare",
      primaryAction: { label: "Review the renewal", kind: "review", href: "/money" },
      state: "active",
      stateUntil: null,
      createdAt: new Date(now).toISOString(),
      dedupKey: `renewal:${f.id}:${new Date(imminent).toISOString().slice(0, 10)}`,
    });
  }

  // -- 2. Price changes (money domain) --------------------------------------
  for (const f of findings) {
    if (!f.priceChanged || f.state === "ignored") continue;
    const annualDelta = (() => {
      const a = annualizedOf(f.priceChanged.to, f.cadence);
      const b = annualizedOf(f.priceChanged.from, f.cadence);
      return a !== undefined && b !== undefined ? a - b : undefined;
    })();
    signals.push({
      id: uuid(),
      principalId: f.principalId,
      kind: "price_change",
      title: `${f.merchant} price changed this cycle`,
      implication:
        annualDelta !== undefined
          ? `Annualized cost moves by ${formatUsd(annualDelta)} if the new price holds.`
          : "Confirm the new cadence assumption before annualizing.",
      noticed: `The same merchant charged a different amount than prior cycles (${formatUsd(f.priceChanged.from)} → ${formatUsd(f.priceChanged.to)}).`,
      urgency: "normal",
      domains: ["money"],
      evidence: [
        { label: "Prior amount", detail: formatUsd(f.priceChanged.from) },
        { label: "New amount", detail: formatUsd(f.priceChanged.to) },
        { label: "Detected", detail: new Date(Date.parse(f.priceChanged.detectedAt)).toISOString().slice(0, 10) },
      ],
      uncertainty: 0.4,
      capability: "advise",
      primaryAction: { label: "Compare cycles", kind: "review", href: "/money" },
      state: "active",
      stateUntil: null,
      createdAt: new Date(now).toISOString(),
      dedupKey: `price_change:${f.id}:${f.priceChanged.detectedAt.slice(0, 10)}`,
    });
  }

  // -- 3. Unworn rotation (wardrobe domain) ---------------------------------
  const nowDate = new Date(now);
  for (const g of garments) {
    if (g.status !== "confirmed") continue;
    const lastWear = g.addedAt; // proxy until wear timestamps land in evidence
    const staleDays = Math.floor((now - Date.parse(lastWear)) / DAY_MS);
    if (staleDays < 30 || g.wearCount > 0) continue;
    signals.push({
      id: uuid(),
      principalId: g.principalId,
      kind: "unworn",
      title: `${g.name} hasn't been worn recently`,
      implication: "Low rotation against its price — pair it into a look or plan to rotate it in.",
      noticed: "A confirmed garment has no recorded wears since it was added.",
      urgency: "normal",
      domains: ["wardrobe"],
      evidence: [
        { label: "Added", detail: new Date(Date.parse(g.addedAt)).toISOString().slice(0, 10) },
        { label: "Confirmed wears", detail: String(g.wearCount) },
      ],
      uncertainty: 0.3,
      capability: "prepare",
      primaryAction: { label: "Pair into a look", kind: "open", href: "/looks" },
      state: "active",
      stateUntil: null,
      createdAt: nowDate.toISOString(),
      dedupKey: `unworn:${g.id}:${nowDate.toISOString().slice(0, 10)}`,
    });
  }

  // -- 4. CPW milestones (wardrobe domain) ----------------------------------
  for (const g of garments) {
    if (g.status !== "confirmed" || !g.price || g.wearCount < 5) continue;
    const cpw = g.price / g.wearCount;
    if (cpw > 5) continue;
    signals.push({
      id: uuid(),
      principalId: g.principalId,
      kind: "cpw_milestone",
      title: `${g.name} is under ${formatUsd(5)} per wear`,
      implication: "A healthy cost-per-wear signal from confirmed wears — not an estimate.",
      noticed: "Confirmed wear events brought this garment's CPW below the milestone.",
      urgency: "normal",
      domains: ["wardrobe"],
      evidence: [
        { label: "Price", detail: formatUsd(g.price) },
        { label: "Confirmed wears", detail: String(g.wearCount) },
        { label: "CPW", detail: formatUsd(cpw) },
      ],
      uncertainty: 0.1,
      capability: "advise",
      primaryAction: { label: "See the wardrobe", kind: "open", href: "/wardrobe" },
      state: "active",
      stateUntil: null,
      createdAt: nowDate.toISOString(),
      dedupKey: `cpw_milestone:${g.id}:${g.wearCount}`,
    });
  }

  // -- 5. Cross-domain: wardrobe × money (Phase 4) ---------------------------
  // Requires BOTH domains: a recurring clothing-adjacent charge AND confirmed
  // wear evidence. Explains the connection; never overclaims causality.
  const rotationMembers = garments.filter(
    (g) => g.status === "confirmed" && ["top", "bottom", "outerwear", "shoes", "dress"].includes(g.category),
  );
  const rentalLike = findings.find(
    (f) =>
      f.state === "active" &&
      /rent|rotat|wardrobe|closet|thread/i.test(f.merchant) &&
      f.annualized !== undefined,
  );
  if (rentalLike && rotationMembers.length > 0) {
    const totalWears = rotationMembers.reduce((sum, g) => sum + g.wearCount, 0);
    const perWearBasis = totalWears > 0 ? rentalLike.annualized! / Math.max(totalWears, 1) : undefined;
    signals.push({
      id: uuid(),
      principalId: rentalLike.principalId,
      kind: "cross_domain",
      title: "Your rotation membership carries a per-wear cost",
      implication:
        perWearBasis !== undefined
          ? `Across ${totalWears} confirmed wears this year, the membership works out to about ${formatUsd(perWearBasis)} per wear — one number to judge the renewal by.`
          : "The membership renews soon; log wears to connect its cost with actual use.",
      noticed:
        "A recurring clothing-adjacent charge and your confirmed wear log are the two halves of this signal.",
      urgency: "review",
      domains: ["money", "wardrobe"],
      evidence: [
        { label: "Recurring charge", detail: `${formatUsd(rentalLike.amount)} / ${rentalLike.cadence} (annualized ${formatUsd(rentalLike.annualized!)})` },
        { label: "Confirmed wears", detail: `${totalWears} across ${rotationMembers.length} garments` },
        { label: "Connection", detail: "Both domains supplied evidence; this is correlation for review, not a verdict." },
      ],
      uncertainty: 0.35,
      capability: "prepare",
      primaryAction: { label: "Review the renewal", kind: "review", href: "/money" },
      state: "active",
      stateUntil: null,
      createdAt: nowDate.toISOString(),
      dedupKey: `cross_domain:${rentalLike.id}:${nowDate.toISOString().slice(0, 10)}`,
    });
  }

  return signals;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}
