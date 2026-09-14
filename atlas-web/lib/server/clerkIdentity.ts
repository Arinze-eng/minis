import "server-only";

/**
 * Clerk integration seam. When NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and
 * CLERK_SECRET_KEY are configured, Clerk is the only identity authority: the
 * middleware verifies the Clerk session server-side and binds the verified
 * userId into the Atlas session cookie. When unconfigured, Atlas runs in the
 * labelled local single-principal mode and every surface says so honestly —
 * nothing simulates a signed-in user.
 *
 * Clerk's Google sign-in is authentication, NOT Gmail consent: Gmail access
 * has its own explicit, separately-revokable consent step (see
 * app/api/gmail/*). The two are never conflated.
 */

export function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}

/** ClerkProvider is mounted only when configured (honest unconfigured mode). */
export function clerkProviderEnabled(): boolean {
  return clerkConfigured();
}

/**
 * The Clerk userId for the current request, from Clerk's server-side auth().
 * Returns null when Clerk is unconfigured or the visitor is signed out.
 * Must be called from request-scoped server contexts (middleware, RSC, route
 * handlers) — Clerk's dynamic import keeps it out of unconfigured bundles.
 */
export async function clerkUserIdFromAuth(): Promise<string | null> {
  if (!clerkConfigured()) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    // auth() outside a clerkMiddleware context — treat as unauthenticated
    // rather than crashing the request.
    return null;
  }
}
