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
 * Server-only secret. Set ATLAS_SESSION_SECRET in production. The dev
 * fallback is a fixed, documented constant — adequate for the labelled
 * single-principal dev mode, never for a deployed instance.
 */
export function sessionSecret(): string {
  const explicit = process.env.ATLAS_SESSION_SECRET?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "ATLAS_SESSION_SECRET is not set — using the documented dev secret. Sessions are forgeable until this is configured.",
    );
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

/** Sign a principal id into a versioned, MAC-bound cookie value. */
export async function serializeSession(userId: string): Promise<string> {
  const payload = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ v: SESSION_VERSION, uid: userId })),
  );
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(mac))}`;
}

export interface VerifiedSession {
  userId: string;
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
    };
    if (parsed.v !== SESSION_VERSION || typeof parsed.uid !== "string" || !parsed.uid) {
      return null;
    }
    return { userId: parsed.uid };
  } catch {
    return null;
  }
}
