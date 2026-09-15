import { NextFetchEvent, NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, serializeSession, verifySession } from "@/lib/server/sessionCrypto";

/**
 * Request bootstrap. Resolves *transport* concerns only: it never decides who
 * the user is for data access — that happens in each page/route handler via
 * Clerk's `auth()` helper (see lib/server/identity.ts), which is where Clerk
 * recommends protecting data.
 *
 * Two honest modes:
 *
 *  1. Clerk configured (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY):
 *     Clerk is the identity authority. `clerkMiddleware()` verifies the session
 *     server-side, and Atlas API routes answer 401 for signed-out callers
 *     instead of leaking a synthetic principal. The legacy `atlas_session`
 *     cookie is cleared, never minted, so a signed-out browser can never carry
 *     a stale Atlas identity forward.
 *
 *  2. Clerk unconfigured: a clearly labelled local single-principal session
 *     (development only). Production fails closed with 503 rather than
 *     inventing an identity.
 *
 * `createRouteMatcher()` is intentionally not used: Clerk deprecated it in
 * favour of resource-based checks, and path lists belong in `config.matcher`.
 */

function envValue(name: string): string | undefined {
  const raw = process.env[name];
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function clerkKeysPresent(): boolean {
  return Boolean(envValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") && envValue("CLERK_SECRET_KEY"));
}

/** Atlas API surface that requires a verified principal. */
function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Public surfaces must remain reachable before a visitor signs in. */
function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/sign-in" || pathname.startsWith("/sign-in/") || pathname === "/sign-up" || pathname.startsWith("/sign-up/");
}

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<Response | null | undefined | void> {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  if (!clerkKeysPresent()) {
    // Production must never fall back to a forgeable or synthetic principal.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Authentication is not configured.", { status: 503 });
    }
    return localSessionBootstrap(request);
  }

  try {
    const { clerkMiddleware } = await import("@clerk/nextjs/server");
    const parties = envValue("ATLAS_PUBLIC_ORIGIN")
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    return clerkMiddleware(
      async (auth, req) => {
        const { isAuthenticated } = await auth();

        // Early, coarse rejection for the API surface. Every handler still
        // re-checks identity with requirePrincipal() before touching data.
        if (isApiPath(req.nextUrl.pathname) && !isAuthenticated) {
          return NextResponse.json(
            { error: "unauthenticated", message: "Sign in to continue." },
            { status: 401 },
          );
        }

        // Identity now comes from Clerk alone: retire any Atlas session cookie
        // left behind by a previous build or a signed-out browser.
        if (req.cookies.get(SESSION_COOKIE)) {
          const response = NextResponse.next({ request: req });
          response.cookies.delete(SESSION_COOKIE);
          return response;
        }

        return NextResponse.next();
      },
      {
        authorizedParties: parties?.length ? parties : undefined,
        signInUrl: envValue("NEXT_PUBLIC_CLERK_SIGN_IN_URL") ?? "/sign-in",
        signUpUrl: envValue("NEXT_PUBLIC_CLERK_SIGN_UP_URL") ?? "/sign-up",
        debug: process.env.NODE_ENV === "development",
      },
    )(request, event);
  } catch (e) {
    // Never let auth-provider failures produce a 500 — fail honestly.
    console.error("clerk middleware failure", e);
    return new NextResponse("Authentication is temporarily unavailable.", { status: 503 });
  }
}

/** Labelled local single-principal session (development only). */
async function localSessionBootstrap(request: NextRequest): Promise<Response> {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const verified = existing ? await verifySession(existing) : null;
  if (verified) return NextResponse.next();

  const value = await serializeSession(crypto.randomUUID(), "local");
  request.cookies.set(SESSION_COOKIE, value);
  const response = NextResponse.next({ request });
  response.cookies.set(SESSION_COOKIE, value, SESSION_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes and Clerk's frontend API routes.
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
