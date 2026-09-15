import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { SESSION_COOKIE, serializeSession, verifySession } from "./sessionCrypto";
import { clerkConfigured } from "./clerkIdentity";

/**
 * Server-side identity for Atlas Web.
 *
 * Identity authority (product contract §4): when Clerk is configured, the
 * Clerk-verified `userId` is the ONLY identity. The browser can never assert a
 * principal, and no synthetic fallback is minted. When Clerk is unconfigured,
 * Atlas runs in the labelled local single-principal mode and
 * `principalSummary()` says so on every surface.
 *
 * Core 3 note: identity is resolved with Clerk's `auth()` helper *inside the
 * resource that needs it* (page, layout, route handler), which is where Clerk
 * recommends protecting data — middleware only bootstraps the request.
 *
 *  - `principalFromCookies()` → Server Components (pages/layouts). Signed-out
 *    document requests are redirected to the sign-in route by
 *    `auth.protect()`.
 *  - `requirePrincipal()` → Route Handlers. Throws `AuthRequiredError` when
 *    unauthenticated so handlers can answer with an explicit 401 instead of
 *    Clerk's API-shaped 404.
 */

export type IdentitySource = "clerk" | "local";

export interface Principal {
  userId: string;
  source: IdentitySource;
}

/** Raised when a route handler runs without a verified principal. */
export class AuthRequiredError extends Error {
  readonly code = "auth_required";
  constructor(message = "no_session: authentication required.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** True when a thrown error means "this request is not signed in". */
export function isAuthRequiredError(error: unknown): error is AuthRequiredError {
  return error instanceof AuthRequiredError || (error as { code?: string })?.code === "auth_required";
}

/** Clerk-verified principal, or null when unconfigured or signed out. */
async function clerkPrincipal(): Promise<Principal | null> {
  if (!clerkConfigured()) return null;
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId ? { userId, source: "clerk" } : null;
}

/** Labelled local principal from the middleware-minted cookie (dev only). */
async function localPrincipal(): Promise<Principal | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const verified = await verifySession(raw);
  return verified ? { userId: verified.userId, source: verified.source } : null;
}

/**
 * Server Component identity. Clerk-first: a signed-out visitor on a Clerk
 * deployment is redirected to sign-in (never shown a synthetic identity).
 */
export async function principalFromCookies(): Promise<Principal> {
  if (clerkConfigured()) {
    const principal = await clerkPrincipal();
    if (principal) return principal;
    // Redirects unauthenticated document requests to the sign-in route and
    // returns the signed-in auth object otherwise. It never falls through with
    // an unauthenticated identity.
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth.protect();
    return { userId, source: "clerk" };
  }

  const principal = await localPrincipal();
  if (principal) return principal;

  throw new Error(
    "no_session: the Atlas session cookie is missing or invalid. Reload the page so middleware can verify your session.",
  );
}

/**
 * Layout-level guard for the authenticated app shell.
 *
 * Clerk's documentation is explicit that a layout check is an addition, not a
 * replacement: layouts do not re-run on client-side navigation, so every page
 * and route handler protects its own data as well. This guard's job is to keep
 * the shell itself (navigation, notifications, identity control) from ever
 * rendering for a signed-out visitor.
 */
export async function assertSignedIn(): Promise<void> {
  if (!clerkConfigured()) return; // labelled local mode: middleware minted the dev principal
  const { auth } = await import("@clerk/nextjs/server");
  await auth.protect();
}

/**
 * Route-handler identity. On a Clerk deployment an unauthenticated request
 * throws `AuthRequiredError` (surfaced as 401 by the caller) — it must never
 * silently become a synthetic principal. In local labelled mode it mints the
 * synthetic session for direct API calls that bypassed middleware.
 */
export async function requirePrincipal(): Promise<Principal> {
  if (clerkConfigured()) {
    const principal = await clerkPrincipal();
    if (principal) return principal;
    throw new AuthRequiredError();
  }

  const principal = await localPrincipal();
  if (principal) return principal;

  if (process.env.NODE_ENV === "production") {
    throw new Error("auth_not_configured: production requires Clerk authentication.");
  }

  const userId = crypto.randomUUID();
  const jar = await cookies();
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
