import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { encryptRefreshToken, decryptRefreshToken } = await import("@/lib/server/secretBox");
const { validateImageBytes } = await import("@/lib/server/imageValidation");
const { signedDeliveryUrl } = await import("@/lib/server/cloudinary");
const { deriveSignals } = await import("@/lib/server/signals");

describe("audit regressions", () => {
  it("decrypts tokens written under the previous key after rotation", () => {
    process.env.ENCRYPTION_KEY = "old-key";
    const envelope = encryptRefreshToken("refresh-123");
    process.env.ENCRYPTION_KEY = "new-key";
    process.env.ENCRYPTION_KEY_PREVIOUS = "old-key";
    expect(decryptRefreshToken(envelope)).toBe("refresh-123");
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(decryptRefreshToken(envelope)).toBeNull();
  });

  it("accepts HEIC uploads instead of failing the dimension check", () => {
    const heic = new Uint8Array(64);
    heic.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]); // ....ftypheic
    expect(validateImageBytes(heic, "image/heic")).toMatchObject({ ok: true, mime: "image/heic" });
    expect(validateImageBytes(heic, "image/png")).toMatchObject({ ok: false, reason: "mime_mismatch" });
  });

  it("builds an expiring private download URL", () => {
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" });
    const url = new URL(signedDeliveryUrl("atlas/garments/x/abc", "image/png"));
    expect(url.pathname).toBe("/v1_1/c/image/download");
    expect(url.searchParams.get("format")).toBe("png");
    expect(url.searchParams.get("type")).toBe("private");
    const ts = Number(url.searchParams.get("timestamp"));
    expect(Number(url.searchParams.get("expires_at"))).toBe(ts + 3600);
    expect(ts).toBeLessThan(1e11); // seconds, not milliseconds
  });

  it("keeps one unworn signal per garment across days, so dismissals stick", () => {
    const g = {
      id: "g1", principalId: "u1", name: "Coat", category: "outerwear", colors: [],
      warmth: 2, formality: 2, seasons: [], occasions: [], wearCount: 0, status: "confirmed",
      analysisProvider: "user", addedAt: "2026-01-01T00:00:00Z",
    };
    const day1 = deriveSignals([g], [], Date.parse("2026-09-01T12:00:00Z"));
    const day2 = deriveSignals([g], [], Date.parse("2026-09-02T12:00:00Z"));
    const key = (xs: typeof day1) => xs.find((s) => s.kind === "unworn")?.dedupKey;
    expect(key(day1)).toBeDefined();
    expect(key(day1)).toBe(key(day2));
  });
});
