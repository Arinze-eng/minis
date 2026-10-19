import "server-only";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clerkConfigured } from "./clerkIdentity";

/**
 * Local-development token issuer so Convex works without Clerk keys. Off in production and whenever
 * Clerk is configured; Convex trusts it only if ATLAS_DEV_JWT_ISSUER is set on that deployment.
 *
 * shortcut: the RSA key lives in a gitignored file per checkout, fine for dev only; production
 * identity is always Clerk.
 */

export const DEV_KID = "atlas-dev";

export function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !clerkConfigured();
}

export function devIssuer(): string {
  return (process.env.ATLAS_DEV_JWT_ISSUER?.trim() || "http://localhost:3100/api/dev-auth").replace(/\/$/, "");
}

let cached: { privateKey: KeyObject; publicKey: KeyObject } | null = null;

function keys() {
  if (cached) return cached;
  const dir = join(process.cwd(), ".atlas-dev");
  const file = join(dir, "jwt-key.pem");
  let pem: string;
  try {
    pem = readFileSync(file, "utf8");
  } catch {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, pem, { mode: 0o600 });
  }
  const privateKey = createPrivateKey(pem);
  cached = { privateKey, publicKey: createPublicKey(privateKey) };
  return cached;
}

export function devJwks() {
  const jwk = keys().publicKey.export({ format: "jwk" });
  return { keys: [{ ...jwk, kid: DEV_KID, alg: "RS256", use: "sig" }] };
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** A one-hour RS256 token for the labelled local principal. */
export function signDevToken(subject: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: DEV_KID }));
  const payload = b64url(
    JSON.stringify({ iss: devIssuer(), sub: subject, aud: "convex", iat: now, exp: now + 3600, name: "Local developer" }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), keys().privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}
