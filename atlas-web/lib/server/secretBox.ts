import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Application-layer secret box for provider refresh tokens (threat model §7):
 *
 *   envelope := "v1." + b64url(iv) + "." + b64url(AES-256-GCM ciphertext+tag)
 *   key      := HKDF-ish expansion of ENCRYPTION_KEY with a key-version label
 *
 * Key rotation: set ENCRYPTION_KEY (primary) and optionally
 * ENCRYPTION_KEY_PREVIOUS; decryption tries primary then previous so a
 * rotation window never breaks existing connections. A token re-encrypts
 * under the new key the next time the user reconnects.
 *
 * The plaintext never touches logs, responses, or the browser. The module is
 * `server-only`: importing it from client code is a build error.
 */

const VERSION_PREFIX = "v1";

export function tokenEncryptionConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY?.trim());
}

// The "current:" label is part of every stored envelope's key derivation, so
// it stays fixed; rotation changes only which master secret feeds it.
function deriveKeyMaterial(master: string): Buffer {
  return createHmac("sha256", `current:${master}`)
    .update("atlas:refresh-token:v1")
    .digest();
}

function mastersToTry(): string[] {
  const masters = [process.env.ENCRYPTION_KEY!.trim()];
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS?.trim();
  if (previous) masters.push(previous);
  return masters;
}

export function encryptRefreshToken(plaintext: string): string {
  const iv = randomBytes(12);
  const key = deriveKeyMaterial(process.env.ENCRYPTION_KEY!.trim());
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION_PREFIX,
    iv.toString("base64url"),
    Buffer.concat([enc, tag]).toString("base64url"),
  ].join(".");
}

export function decryptRefreshToken(envelope: string): string | null {
  const parts = envelope.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION_PREFIX) return null;
  let iv: Buffer;
  let data: Buffer;
  try {
    iv = Buffer.from(parts[1]!, "base64url");
    data = Buffer.from(parts[2]!, "base64url");
  } catch {
    return null;
  }
  for (const master of mastersToTry()) {
    try {
      const key = deriveKeyMaterial(master);
      const tag = data.subarray(data.length - 16);
      const ciphertext = data.subarray(0, data.length - 16);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      // try next key version
    }
  }
  return null;
}

/** CSRF state for the OAuth authorization redirect, bound to the principal. */
export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

/** PKCE code verifier (RFC 7636); Google supports S256 on web flows. */
export function randomCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  // RFC 7636 S256: BASE64URL(SHA256(verifier)) — no secret involved.
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Constant-time comparison for callback parameters. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
