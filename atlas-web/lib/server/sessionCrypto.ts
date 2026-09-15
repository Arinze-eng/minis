/**
 * Session token signing/verification shared by middleware (edge runtime) and
 * server modules. Uses WebCrypto only — no node builtins, no next/headers —
 * so the same implementation runs in both runtimes.
 *
 * Token shape: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 * The browser can read the payload (uid) but cannot forge the MAC.
 */

export const SESSION_COOKIE = "atlas_session";
const SESSION_VERSION = "v1";

/**
 * Server-only secret. Set ATLAS_SESSION_SECRET in production. Development
 * uses a fixed documented secret; production fails closed without one.
 */
export function sessionSecret(): string {
  const explicit = process.env.ATLAS_SESSION_SECRET?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error("session_secret_not_configured: production requires ATLAS_SESSION_SECRET");
  }
  return "atlas-dev-session-secret-do-not-deploy";
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Sign a principal id into a versioned, MAC-bound cookie value.
 * `source` records who verified the identity: "clerk" (real auth provider)
 * or "local" (labelled synthetic single-principal dev mode).
 */
export async function serializeSession(
  userId: string,
  source: "clerk" | "local" = "local",
): Promise<string> {
  const payload = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ v: SESSION_VERSION, uid: userId, sid: source })),
  );
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(mac))}`;
}

export interface VerifiedSession {
  userId: string;
  /** Who verified this identity: the auth provider or local dev mode. */
  source: "clerk" | "local";
}

/** Verify a cookie value; returns null for tampered, stale, or junk input. */
export async function verifySession(raw: string): Promise<VerifiedSession | null> {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      b64urlDecode(mac) as unknown as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as {
      v?: string;
      uid?: string;
      sid?: string;
    };
    if (parsed.v !== SESSION_VERSION || typeof parsed.uid !== "string" || !parsed.uid) {
      return null;
    }
    return { userId: parsed.uid, source: parsed.sid === "clerk" ? "clerk" : "local" };
  } catch {
    return null;
  }
}
