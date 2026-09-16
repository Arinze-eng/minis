import { randomUUID } from "node:crypto";
import { getStore } from "@/lib/server/store";
import { deriveSignals } from "@/lib/server/signals";

/**
 * Post-write sync: re-derive signals and notifications from the principal's
 * current garments and findings. Empty real accounts remain empty; this module
 * never creates demo fixtures.
 */
export async function syncSignalsAndNotifications(principalId: string): Promise<void> {
  const { store } = getStore();
  const [garments, findings] = await Promise.all([
    store.listGarments(principalId),
    store.listFindings(principalId),
  ]);

  const derived = deriveSignals(garments, findings);
  for (const signal of derived) {
    await store.upsertSignal(principalId, signal);
  }

  const createdAt = new Date().toISOString();
  const renewalSignals = derived.filter(
    (signal) => signal.kind === "renewal" || signal.kind === "price_change",
  );
  for (const signal of renewalSignals.slice(0, 2)) {
    await store.upsertNotification(principalId, {
      id: randomUUID(),
      principalId,
      category: "renewals",
      title: signal.title,
      detail: signal.implication,
      action: { kind: "link", label: signal.primaryAction.label, href: signal.primaryAction.href },
      urgency: signal.urgency,
      read: false,
      createdAt,
      dedupKey: `notif:${signal.dedupKey}`,
    });
  }

  const closetSignals = derived.filter((signal) => signal.domains.includes("wardrobe"));
  for (const signal of closetSignals.slice(0, 2)) {
    await store.upsertNotification(principalId, {
      id: randomUUID(),
      principalId,
      category: "closet",
      title: signal.title,
      detail: signal.implication,
      action: { kind: "link", label: signal.primaryAction.label, href: signal.primaryAction.href },
      urgency: signal.urgency,
      read: false,
      createdAt,
      dedupKey: `notif:${signal.dedupKey}`,
    });
  }
}
