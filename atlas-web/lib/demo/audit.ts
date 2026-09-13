import type { MoneySummary, SubscriptionFinding } from "@/lib/audit";
import { annualizedAmount } from "@/lib/audit";

/**
 * Synthetic demo findings — sandbox-labelled, sanitized snippets only.
 * Mirrors `lib/demo/inbox.ts` rules: deterministic, never presented as live.
 */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function daysAhead(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

function finding(
  f: Omit<SubscriptionFinding, "annualized"> & { cadence: SubscriptionFinding["cadence"] },
): SubscriptionFinding {
  return { ...f, annualized: annualizedAmount(f.amount, f.cadence) };
}

const findings: SubscriptionFinding[] = [
  finding({
    id: "demo-rental-rotation",
    merchant: "ThreadRenew (demo merchant)",
    productName: "Rental rotation membership",
    amount: 29,
    currency: "USD",
    cadence: "monthly",
    nextRenewalDate: daysAhead(1),
    state: "active",
    confidence: 0.92,
    extractionVersion: "ext-2026.09",
    sources: [
      {
        kind: "transaction",
        reference: "sandbox-txn-4471",
        snippet: "Recurring card charge, $29.00",
        receivedAt: daysAgo(30),
      },
      {
        kind: "email",
        reference: "demo-thread-102",
        snippet: "Subject: Your rotation renews soon (snippet only)",
        receivedAt: daysAgo(2),
      },
    ],
  }),
  finding({
    id: "demo-streaming",
    merchant: "Streamly (demo merchant)",
    productName: "Standard plan",
    amount: 13.99,
    currency: "USD",
    cadence: "monthly",
    priceChangedAt: { from: 11.99, to: 13.99, detectedAt: daysAgo(9) },
    state: "active",
    confidence: 0.88,
    extractionVersion: "ext-2026.09",
    sources: [
      {
        kind: "transaction",
        reference: "sandbox-txn-4502",
        snippet: "Card charge, $13.99 (prior cycles $11.99)",
        receivedAt: daysAgo(9),
      },
    ],
  }),
  finding({
    id: "demo-cloud-storage",
    merchant: "CloudNest (demo merchant)",
    productName: "2TB storage",
    amount: 9.99,
    currency: "USD",
    cadence: "monthly",
    trialEndDate: daysAhead(2),
    state: "active",
    confidence: 0.79,
    extractionVersion: "ext-2026.09",
    sources: [
      {
        kind: "email",
        reference: "demo-thread-118",
        snippet: "Subject: Your free trial ends in 3 days (snippet only)",
        receivedAt: daysAgo(1),
      },
    ],
  }),
  finding({
    id: "demo-gym-unknown-cadence",
    merchant: "FitPlace (demo merchant)",
    productName: "Membership",
    amount: 45,
    currency: "USD",
    cadence: "unknown",
    state: "active",
    confidence: 0.44,
    extractionVersion: "ext-2026.09",
    sources: [
      {
        kind: "transaction",
        reference: "sandbox-txn-4380",
        snippet: "Card charge, $45.00 (cadence unclear)",
        receivedAt: daysAgo(21),
      },
    ],
  }),
];

export function demoMoney(): MoneySummary {
  const annualizedTotal = findings.reduce(
    (sum, f) => sum + (f.state === "ignored" ? 0 : (f.annualized ?? 0)),
    0,
  );
  return {
    mode: "demo",
    demoLabel: "Demo audit — sandbox fixtures with sanitized snippets, no mailbox connected",
    currency: "USD",
    findings,
    annualizedTotal,
    cadenceAssumption: "Annualized = amount × periods/year; unknown cadence is never annualized",
    refreshedAt: new Date().toISOString(),
  };
}

export { daysAgo, daysAhead };
