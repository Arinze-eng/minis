/**
 * Application-layer encryption for provider refresh tokens (AES-256-GCM, Web Crypto, so it runs in
 * Convex's default runtime). Envelope: "v1.<b64url iv>.<b64url ciphertext+tag>".
 *
 * Rotation: ENCRYPTION_KEY is the current master; ENCRYPTION_KEY_PREVIOUS is tried on decrypt, so
 * rotating never strands stored tokens (fixes the original atlas-web bug where "previous" was ignored).
 */

const PREFIX = "v1";

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function keyFor(master: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`atlas:refresh-token:v1:${master}`));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function masters(): string[] {
  const current = process.env.ENCRYPTION_KEY?.trim();
  if (!current) throw new Error("ENCRYPTION_KEY is not configured.");
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS?.trim();
  return previous ? [current, previous] : [current];
}

export function encryptionConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY?.trim());
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(masters()[0]!);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
  return [PREFIX, b64url(iv), b64url(cipher)].join(".");
}

/** Null for anything tampered, truncated or encrypted under an unknown key. */
export async function decryptSecret(envelope: string): Promise<string | null> {
  const [prefix, iv, data] = envelope.split(".");
  if (prefix !== PREFIX || !iv || !data) return null;
  for (const master of masters()) {
    try {
      const key = await keyFor(master);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, key, fromB64url(data));
      return new TextDecoder().decode(plain);
    } catch {
      // try the next key
    }
  }
  return null;
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** RFC 7636 S256 code challenge. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}
