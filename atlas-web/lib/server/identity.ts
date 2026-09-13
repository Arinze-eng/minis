import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { SESSION_COOKIE, serializeSession, verifySession } from "./sessionCrypto";

/**
 * Server-side identity for Atlas Web — read-only consumer of the middleware-
 * minted session. RSC pages call `principalFromCookies()`; route handlers may
 * additionally call `requirePrincipal()` which can mint a fallback session if
 * middleware was bypassed (direct API call without visiting a page first).
 */

export interface Principal {
  userId: string;
  mode: "local_single_user";
}

/** Read the verified principal. Requires the middleware to have run. */
export async function principalFromCookies(): Promise<Principal> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const verified = await verifySession(raw);
    if (verified) {
      return { userId: verified.userId, mode: "local_single_user" };
    }
  }
  throw new Error(
    "no_session: the Atlas session cookie is missing or invalid. Reload the page so middleware can mint a session.",
  );
}

/**
 * Route-handler identity: like the above, but if no valid cookie exists
 * (direct API call that never hit middleware — unusual), mint and set a
 * fresh signed session so the call stays functional.
 */
export async function requirePrincipal(): Promise<Principal> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const verified = await verifySession(raw);
    if (verified) {
      return { userId: verified.userId, mode: "local_single_user" };
    }
  }
  const userId = crypto.randomUUID();
  jar.set(SESSION_COOKIE, await serializeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { userId, mode: "local_single_user" };
}

/** Build an HMAC-scoped idempotency/dedup key bound to the principal. */
export function scopedKey(principal: Principal, kind: string, value: string): string {
  return createHmac("sha256", `${principal.userId}:${kind}`)
    .update(value)
    .digest("hex")
    .slice(0, 32);
}
