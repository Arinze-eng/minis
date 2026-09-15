import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { SESSION_COOKIE, serializeSession, verifySession } from "./sessionCrypto";
import { clerkConfigured } from "./clerkIdentity";

/**
 * Server-side identity for Atlas Web — read-only consumer of the middleware-
 * verified session. RSC pages call `principalFromCookies()`; route handlers
 * call `requirePrincipal()`.
 *
 * Identity authority (product contract §4): when Clerk is configured, the
 * Clerk-verified userId is the ONLY identity — no fallback principal is ever
 * minted client-side or server-side. When Clerk is unconfigured, Atlas runs in
 * the labelled local single-principal mode and principalSummary() says so on
 * every surface. The browser never asserts an arbitrary user id either way.
 */

export type IdentitySource = "clerk" | "local";

export interface Principal {
  userId: string;
  source: IdentitySource;
}

export async function principalFromCookies(): Promise<Principal> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const verified = await verifySession(raw);
    if (verified) {
      return { userId: verified.userId, source: verified.source };
    }
  }
  throw new Error(
    "no_session: the Atlas session cookie is missing or invalid. Reload the page so middleware can verify your session.",
  );
}

/**
 * Route-handler identity. When Clerk is configured and no verified session
 * exists, this throws — an unauthenticated request must never silently become
 * a synthetic principal. (Middleware's auth.protect() already blocks that path
 * for configured deployments; this is defense in depth.) In local labelled
 * mode it mints the synthetic session for direct API calls that bypassed
 * middleware.
 */
export async function requirePrincipal(): Promise<Principal> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const verified = await verifySession(raw);
    if (verified) {
      return { userId: verified.userId, source: verified.source };
    }
  }
  if (clerkConfigured()) {
    throw new Error("no_session: authentication required.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("auth_not_configured: production requires Clerk authentication.");
  }
  const userId = crypto.randomUUID();
  jar.set(SESSION_COOKIE, await serializeSession(userId, "local"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { userId, source: "local" };
}

/**
 * Honest identity summary for UI surfaces: which identity mode is active.
 * "local" is always labelled — it must never read as a real multi-user account.
 */
export function principalSummary(principal: Principal): {
  mode: IdentitySource;
  label: string;
  userIdHash: string;
} {
  const hash = createHmac("sha256", "atlas-principal-display")
    .update(principal.userId)
    .digest("hex")
    .slice(0, 8);
  return {
    mode: principal.source,
    label:
      principal.source === "clerk"
        ? "Clerk-verified account"
        : "Local dev principal (single-user, not a real account)",
    userIdHash: hash,
  };
}

/** Build an HMAC-scoped idempotency/dedup key bound to the principal. */
export function scopedKey(principal: Principal, kind: string, value: string): string {
  return createHmac("sha256", `${principal.userId}:${kind}`)
    .update(value)
    .digest("hex")
    .slice(0, 32);
}
