import { describe, expect, it } from "vitest";
import { demoInbox } from "@/app/inbox/demoData";

/**
 * Pins the demo-labelling contract (product contract §7):
 * demo data must always identify itself; nothing may claim to be live or
 * private; the payload must be safe to render without a signed-in user.
 */
describe("demo inbox labelling", () => {
  const payload = demoInbox();

  it("declares demo mode with a visible label", () => {
    expect(payload.mode).toBe("demo");
    expect(payload.demoLabel).toBeTruthy();
    expect(payload.demoLabel).toMatch(/demo/i);
    expect(payload.demoLabel).toMatch(/synthetic/i);
  });

  it("marks every source as demo, never claiming live connections", () => {
    for (const source of payload.sources) {
      expect(source.mode).toBe("demo");
      if (!source.connected) {
        expect(source.detail).toMatch(/not connected|sandbox|sample|demo/i);
      }
    }
  });

  it("keeps signals honest: capability never exceeds prepare", () => {
    for (const card of payload.cards) {
      expect(["advise", "prepare"]).toContain(card.capability);
      expect(card.uncertainty).toBeGreaterThanOrEqual(0);
      expect(card.uncertainty).toBeLessThanOrEqual(1);
    }
  });

  it("uses stable ids and fresh timestamps", () => {
    const ids = payload.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of payload.cards) {
      expect(Date.parse(card.createdAt)).not.toBeNaN();
      expect(Date.now() - Date.parse(card.createdAt)).toBeLessThan(7 * 24 * 3_600_000);
    }
  });

  it("is deterministic across calls (no hidden randomness in shape)", () => {
    const again = demoInbox();
    expect(again.cards.map((c) => c.id)).toEqual(payload.cards.map((c) => c.id));
    expect(again.sources.map((s) => s.name)).toEqual(payload.sources.map((s) => s.name));
  });
});
