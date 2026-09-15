import { getStore } from "@/lib/server/store";
import { deriveSignals } from "@/lib/server/signals";

/**
 * Post-write sync: deterministically re-derive signals and notifications
 * from the principal's current garments + findings. Idempotent via dedup
 * keys — safe to run after every mutation. Demo rows are seeded once with
 * clearly synthetic merchants so first-run surfaces are never empty; the
 * seed also carries the "demo" provenance in analysisProvider/labels.
 */

export async function syncSignalsAndNotifications(principalId: string): Promise<void> {
  const { store } = getStore();
  const [garments, findings] = await Promise.all([
    store.listGarments(principalId),
    store.listFindings(principalId),
  ]);

  // Synthetic fixtures are opt-in for local demos only. Production
  // notifications must come from actual connected sources or user data.
  const allowDemoData = process.env.NODE_ENV !== "production" && process.env.ATLAS_ALLOW_DEMO_DATA === "true";
  if (allowDemoData && findings.length === 0) {
    const now = new Date();
    const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
    await store.upsertFinding(principalId, {
      id: cryptoId(),
      principalId,
      merchant: "ThreadRenew (demo merchant)",
      productName: "Rental rotation membership",
      amount: 29,
      currency: "USD",
      cadence: "monthly",
      annualized: 348,
      nextRenewal: inDays(1),
      trialEnd: null,
      priceChanged: null,
      state: "active",
      confidence: 0.92,
      extractionVersion: "ext-2026.09",
      sources: [{ kind: "transaction", reference: "sandbox-txn-4471", snippet: "Recurring card charge, $29.00 (sandbox fixture)" }],
      dedupKey: "seed:threadrenew",
    });
    await store.upsertFinding(principalId, {
      id: cryptoId(),
      principalId,
      merchant: "Streamly (demo merchant)",
      productName: "Standard plan",
      amount: 13.99,
      currency: "USD",
      cadence: "monthly",
      annualized: 167.88,
      nextRenewal: inDays(12),
      trialEnd: null,
      priceChanged: { from: 11.99, to: 13.99, detectedAt: inDays(-9) },
      state: "active",
      confidence: 0.88,
      extractionVersion: "ext-2026.09",
      sources: [{ kind: "transaction", reference: "sandbox-txn-4502", snippet: "Card charge, $13.99 (prior cycles $11.99) (sandbox fixture)" }],
      dedupKey: "seed:streamly",
    });
    await store.upsertFinding(principalId, {
      id: cryptoId(),
      principalId,
      merchant: "CloudNest (demo merchant)",
      productName: "2TB storage",
      amount: 9.99,
      currency: "USD",
      cadence: "monthly",
      annualized: 119.88,
      nextRenewal: null,
      trialEnd: inDays(2),
      priceChanged: null,
      state: "active",
      confidence: 0.79,
      extractionVersion: "ext-2026.09",
      sources: [{ kind: "email", reference: "demo-thread-118", snippet: "Subject: Your free trial ends in 3 days (snippet only, fixture)" }],
      dedupKey: "seed:cloudnest",
    });
  }

  const derived = deriveSignals(garments, await store.listFindings(principalId));
  for (const s of derived) {
    await store.upsertSignal(principalId, s);
  }

  // Notifications: mirror the two most urgent derived signals + wear hints.
  const nowIso = new Date().toISOString();
  const renewalSignals = derived.filter((s) => s.kind === "renewal" || s.kind === "price_change");
  for (const s of renewalSignals.slice(0, 2)) {
    await store.upsertNotification(principalId, {
      // Fresh id per upsert attempt: idempotency is owned by dedupKey, not id
      // (deriving id from dedupKey slices caused PK collisions across signals
      // that share a date suffix).
      id: cryptoId(),
      principalId,
      category: "renewals",
      title: s.title,
      detail: s.implication,
      action: { kind: "link", label: s.primaryAction.label, href: s.primaryAction.href },
      urgency: s.urgency,
      read: false,
      createdAt: nowIso,
      dedupKey: `notif:${s.dedupKey}`,
    });
  }
  const closetSignals = derived.filter((s) => s.domains.includes("wardrobe"));
  for (const s of closetSignals.slice(0, 2)) {
    await store.upsertNotification(principalId, {
      id: cryptoId(),
      principalId,
      category: "closet",
      title: s.title,
      detail: s.implication,
      action: { kind: "link", label: s.primaryAction.label, href: s.primaryAction.href },
      urgency: s.urgency,
      read: false,
      createdAt: nowIso,
      dedupKey: `notif:${s.dedupKey}`,
    });
  }
}

function cryptoId(): string {
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  return randomUUID();
}
