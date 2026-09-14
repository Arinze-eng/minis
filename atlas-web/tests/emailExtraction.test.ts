import { describe, expect, it } from "vitest";
import { annualize, extractFinding, EXTRACTION_VERSION } from "@/lib/server/emailExtraction";

const meta = (subject: string, from = '"Spotify" <no-reply@spotify.com>') =>
  extractFinding({
    messageId: "msg_test_1",
    headers: { subject, from },
    occurredAt: "2026-09-14T10:00:00Z",
  });

describe("emailExtraction — bounded metadata extraction", () => {
  it("extracts a recurring charge with amount, cadence, and merchant", () => {
    const f = meta("Your receipt: Spotify Premium $10.99/mo");
    expect(f).not.toBeNull();
    expect(f!.merchant).toBe("Spotify");
    expect(f!.amount).toBeCloseTo(10.99);
    expect(f!.currency).toBe("USD");
    expect(f!.cadence).toBe("monthly");
    expect(f!.kind).toBe("recurring_charge");
    expect(f!.extractionVersion).toBe(EXTRACTION_VERSION);
  });

  it("recognizes a trial notice and derives a renewal date", () => {
    const f = meta("Your trial ends 2026-09-30 — $14.99/mo after");
    expect(f!.kind).toBe("trial_notice");
    expect(f!.nextRenewal).toBe("2026-09-30T00:00:00.000Z");
  });

  it("falls back to provider host filtering when From has no display name", () => {
    const f = meta("Monthly invoice €12,00", "<billing@some-service.co>");
    expect(f!.merchant).toBe("Some-service");
    expect(f!.currency).toBe("EUR");
  });

  it("rejects provider-hosted senders without a usable display name", () => {
    const f = meta("Monthly invoice $9/mo", "<noreply@gmail.com>");
    expect(f).toBeNull();
  });

  it("returns null for messages with no subscription/receipt signal", () => {
    expect(meta("Lunch tomorrow?")).toBeNull();
    expect(meta("")).toBeNull();
  });

  it("never lets confidence exceed the 0.9 bound", () => {
    const f = meta(
      "Trial renews 2026-10-01 — recurring charge $19.99/mo (receipt included)",
      '"Acme Media" <billing@acme.example>',
    );
    expect(f!.confidence).toBeLessThanOrEqual(0.9);
    expect(f!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("annualizes only when cadence is reliable", () => {
    expect(annualize(10, "monthly")).toBe(120);
    expect(annualize(100, "yearly")).toBe(100);
    expect(annualize(5, "weekly")).toBe(260);
    expect(annualize(10, "mystery")).toBeNull();
  });

  it("bounded snippet: never longer than 120 chars regardless of subject", () => {
    const f = meta("receipt " + "x".repeat(500) + " $5/mo");
    expect(f!.snippet!.length).toBeLessThanOrEqual(120);
  });
});
