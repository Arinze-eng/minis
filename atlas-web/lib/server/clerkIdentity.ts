import "server-only";

/**
 * Clerk integration seam (`@clerk/nextjs` v7 / Clerk Core 3).
 *
 * When NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are configured,
 * Clerk is the only identity authority: the verified Clerk `userId` (resolved
 * server-side by `auth()` inside `clerkMiddleware`) is the Atlas principal.
 * When unconfigured, Atlas runs in the labelled local single-principal mode and
 * every surface says so honestly — nothing simulates a signed-in user.
 *
 * Core 3 notes (why this file looks the way it does):
 *  - `auth()` is async and only usable in Server Components, Route Handlers and
 *    Server Actions (middleware, which runs on the Edge runtime, uses the
 *    `clerkMiddleware` auth object instead).
 *  - `auth.protect()` redirects unauthenticated document requests to the
 *    sign-in route and returns 404 for non-document (API) requests.
 *  - `<SignedIn>` / `<SignedOut>` / `<Protect>` were removed in Core 3 and now
 *    throw at render; `<Show when="signed-in" | "signed-out">` replaces them.
 *
 * Clerk's Google sign-in is authentication, NOT Gmail consent: Gmail access has
 * its own explicit, separately-revocable consent step (see app/api/gmail/*).
 * The two are never conflated.
 */

function envValue(name: string): string | undefined {
  const raw = process.env[name];
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function clerkPublishableKey(): string | undefined {
  return envValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
}

/** Clerk is fully configured (both keys present) and is the identity authority. */
export function clerkConfigured(): boolean {
  return Boolean(clerkPublishableKey() && envValue("CLERK_SECRET_KEY"));
}

/** <ClerkProvider> mounts only when configured (honest unconfigured mode). */
export function clerkProviderEnabled(): boolean {
  return clerkConfigured();
}

/**
 * Where a signed-out visitor is sent. Clerk recommends environment variables
 * (https://clerk.com/docs/guides/development/clerk-environment-variables) and
 * reads them itself; these defaults only keep local development working.
 */
export function clerkSignInUrl(): string {
  return envValue("NEXT_PUBLIC_CLERK_SIGN_IN_URL") ?? "/sign-in";
}

export function clerkSignUpUrl(): string {
  return envValue("NEXT_PUBLIC_CLERK_SIGN_UP_URL") ?? "/sign-up";
}

/**
 * After a successful sign-in/up the visitor lands on the Inbox unless Clerk's
 * own `redirect_url` handling already sent them somewhere more specific.
 */
export function clerkSignInFallbackRedirectUrl(): string {
  return envValue("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL") ?? "/inbox";
}

export function clerkSignUpFallbackRedirectUrl(): string {
  return envValue("NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL") ?? "/inbox";
}

/** Canonical origin allowlist for Clerk's authorized-parties check. */
export function clerkAuthorizedParties(): string[] | undefined {
  const parties = envValue("ATLAS_PUBLIC_ORIGIN")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return parties?.length ? parties : undefined;
}

/**
 * The verified Clerk userId for the current request, or null when signed out.
 * Returns null (never throws) when Clerk is unconfigured. Requires the
 * `clerkMiddleware` request context — Server Components, Route Handlers and
 * Server Actions only.
 */
export async function clerkUserIdFromAuth(): Promise<string | null> {
  if (!clerkConfigured()) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    // `auth()` outside a clerkMiddleware request context — report "no
    // verified identity" rather than crashing the request.
    return null;
  }
}
