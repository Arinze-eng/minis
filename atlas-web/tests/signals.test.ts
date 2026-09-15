import { describe, expect, it } from "vitest";
import { deriveSignals } from "@/lib/server/signals";
import type { FindingRow, GarmentRow } from "@/lib/server/store";

const NOW = Date.parse("2026-09-13T12:00:00Z");

function garment(overrides: Partial<GarmentRow> = {}): GarmentRow {
  return {
    id: "g1",
    principalId: "u1",
    name: "Test Top",
    category: "top",
    colors: ["blue"],
    material: null,
    pattern: null,
    warmth: 1,
    formality: 1,
    seasons: ["spring"],
    occasions: ["casual"],
    price: 100,
    currency: "USD",
    wearCount: 10,
    status: "confirmed",
    analysisProvider: "user",
    addedAt: new Date(NOW - 90 * 86_400_000).toISOString(),
    ...overrides,
  };
}

function finding(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    id: "f1",
    principalId: "u1",
    merchant: "ThreadRenew",
    productName: null,
    amount: 29,
    currency: "USD",
    cadence: "monthly",
    annualized: 348,
    nextRenewal: new Date(NOW + 86_400_000).toISOString(),
    trialEnd: null,
    priceChanged: null,
    state: "active",
    confidence: 0.9,
    extractionVersion: "ext-test",
    sources: [],
    ...overrides,
  };
}

describe("deriveSignals", () => {
  it("flags renewals within 48h with annualized evidence", () => {
    const signals = deriveSignals([garment()], [finding()], NOW);
    const renewal = signals.find((s) => s.kind === "renewal");
    expect(renewal).toBeTruthy();
    expect(renewal?.urgency).toBe("review");
    expect(JSON.stringify(renewal?.evidence)).toContain("$348");
  });

  it("stays silent for renewals beyond the window", () => {
    const signals = deriveSignals([], [finding({ nextRenewal: new Date(NOW + 30 * 86_400_000).toISOString() })], NOW);
    expect(signals.find((s) => s.kind === "renewal")).toBeUndefined();
  });

  it("explains price changes with annualized delta", () => {
    const signals = deriveSignals([], [
      finding({
        nextRenewal: null,
        priceChanged: { from: 11.99, to: 13.99, detectedAt: new Date(NOW - 86_400_000).toISOString() },
      }),
    ], NOW);
    const change = signals.find((s) => s.kind === "price_change");
    expect(change).toBeTruthy();
    expect(change?.implication).toContain("$24");
  });

  it("derives cross-domain only when both domains supply evidence", () => {
    const rental = finding({ merchant: "RotationRent", annualized: 348 });
    const confirmedWorn = garment({ category: "outerwear", wearCount: 12 });

    const withoutWardrobe = deriveSignals([], [rental], NOW);
    expect(withoutWardrobe.find((s) => s.kind === "cross_domain")).toBeUndefined();

    const withBoth = deriveSignals([confirmedWorn], [rental], NOW);
    const cross = withBoth.find((s) => s.kind === "cross_domain");
    expect(cross).toBeTruthy();
    expect(cross?.domains).toEqual(expect.arrayContaining(["money", "wardrobe"]));
    expect(cross?.capability).toBe("prepare");
  });

  it("ignores ignored findings and unconfirmed garments", () => {
    const signals = deriveSignals(
      [garment({ status: "needs_confirmation" })],
      [finding({ state: "ignored" })],
      NOW,
    );
    expect(signals.filter((s) => s.kind === "renewal" || s.kind === "unworn")).toHaveLength(0);
  });

  it("is idempotent: same inputs produce identical dedup keys", () => {
    const inputs = { garments: [garment()], findings: [finding()] };
    const a = deriveSignals(inputs.garments, inputs.findings, NOW).map((s) => s.dedupKey).sort();
    const b = deriveSignals(inputs.garments, inputs.findings, NOW).map((s) => s.dedupKey).sort();
    expect(a).toEqual(b);
  });
});
