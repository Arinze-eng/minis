import { describe, expect, it } from "vitest";
import {
  annualizedAmount,
  scanPercent,
  summarizeMoney,
  INITIAL_SCAN_PROGRESS,
  type SubscriptionFinding,
} from "@/lib/audit";

describe("annualized amount", () => {
  it("annualizes known cadences", () => {
    expect(annualizedAmount(10, "monthly")).toBe(120);
    expect(annualizedAmount(10, "weekly")).toBe(520);
    expect(annualizedAmount(120, "annual")).toBe(120);
    expect(annualizedAmount(30, "quarterly")).toBe(120);
  });

  it("never annualizes unknown cadence", () => {
    expect(annualizedAmount(10, "unknown")).toBeUndefined();
  });
});

describe("money summary", () => {
  const base = {
    currency: "USD",
    state: "active" as const,
    confidence: 0.9,
    extractionVersion: "x",
    sources: [],
  };

  const findings: SubscriptionFinding[] = [
    { ...base, id: "1", merchant: "A", amount: 10, cadence: "monthly", annualized: 120 },
    { ...base, id: "2", merchant: "B", amount: 100, cadence: "annual", annualized: 100 },
    { ...base, id: "3", merchant: "C", amount: 45, cadence: "unknown", annualized: undefined },
    { ...base, id: "4", merchant: "D", amount: 5, cadence: "monthly", annualized: 60, state: "ignored" },
  ];

  it("sums annualized values, skipping unknown cadence and ignored findings", () => {
    const { annualizedTotal } = summarizeMoney(findings);
    expect(annualizedTotal).toBe(220);
  });
});

describe("scan progress", () => {
  it("is zero before discovery", () => {
    expect(scanPercent(INITIAL_SCAN_PROGRESS)).toBe(0);
  });

  it("counts processed, skipped, deduplicated, and failed as done", () => {
    const p = {
      ...INITIAL_SCAN_PROGRESS,
      counters: { discovered: 100, processed: 40, skipped: 20, deduplicated: 10, failed: 5 },
    };
    expect(scanPercent(p)).toBe(75);
  });

  it("clamps at 100", () => {
    const p = {
      ...INITIAL_SCAN_PROGRESS,
      counters: { discovered: 10, processed: 12, skipped: 0, deduplicated: 0, failed: 0 },
    };
    expect(scanPercent(p)).toBe(100);
  });
});
