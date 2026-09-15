import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  serializeSession,
  verifySession,
} from "@/lib/server/sessionCrypto";

/**
 * The Atlas session cookie is the labelled *local* principal only: on a Clerk
 * deployment identity comes from Clerk's `auth()`, never from this cookie
 * (see lib/server/identity.ts). These tests pin the cryptographic contract that
 * keeps a local dev cookie from being forged.
 */
describe("atlas session cookie", () => {
  it("names the cookie consistently", () => {
    expect(SESSION_COOKIE).toBe("atlas_session");
  });

  it("round-trips a local principal", async () => {
    const value = await serializeSession("11111111-2222-3333-4444-555555555555", "local");
    const verified = await verifySession(value);
    expect(verified).toEqual({
      userId: "11111111-2222-3333-4444-555555555555",
      source: "local",
    });
  });

  it("records that Clerk verified the identity when it did", async () => {
    const value = await serializeSession("user_2abc", "clerk");
    const verified = await verifySession(value);
    expect(verified?.source).toBe("clerk");
    expect(verified?.userId).toBe("user_2abc");
  });

  it("rejects a tampered payload", async () => {
    const value = await serializeSession("user_2abc", "clerk");
    const [payload, mac] = value.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: "v1", uid: "attacker", sid: "clerk" }),
    )
      .toString("base64url");
    const forged = `${forgedPayload}.${mac}`;
    expect(forgedPayload).not.toBe(payload);
    expect(await verifySession(forged)).toBeNull();
  });

  it("rejects junk, empty, and truncated values", async () => {
    for (const junk of ["", ".", "not-a-token", "abc.", ".abc", "a.b.c"]) {
      expect(await verifySession(junk)).toBeNull();
    }
  });

  it("rejects a payload without a user id", async () => {
    const payload = Buffer.from(JSON.stringify({ v: "v1", uid: "", sid: "local" })).toString(
      "base64url",
    );
    expect(await verifySession(`${payload}.nonsense`)).toBeNull();
  });
});
