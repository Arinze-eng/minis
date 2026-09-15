import { NextFetchEvent, NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, serializeSession, verifySession } from "@/lib/server/sessionCrypto";

/**
 * Session bootstrap. Every request carries a server-verified principal before
 * any render or route handler runs. Identity has two sources, resolved here:
 *
 *  1. Clerk (when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY are
 *     set): the Clerk session is verified server-side and the verified userId
 *     is bound into the Atlas session cookie. The browser cannot assert an
 *     arbitrary user id.
 *  2. Labelled local single-principal mode (otherwise): a synthetic uuid
 *     principal, clearly surfaced as such by principalSummary(). This mode is
 *     for development only — not a multi-user claim.
 *
 * The cookie is minted here because middleware is the one place that may set
 * cookies outside Server Actions, so RSC pages can READ identity without ever
 * mutating cookies (which Next.js forbids in RSC).
 *
 * Dynamic imports keep Clerk out of the bundle when unconfigured.
 */
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  // Production must never fall back to a forgeable or synthetic principal.
  if (
    process.env.NODE_ENV === "production" &&
    !(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
  ) {
    return new NextResponse("Authentication is not configured.", { status: 503 });
  }
  // --- Clerk path: real auth provider is the sole identity authority --------
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) {
    try {
      const { clerkMiddleware, createRouteMatcher } = await import("@clerk/nextjs/server");
      const authorizedParties = process.env.ATLAS_PUBLIC_ORIGIN
        ?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      const isProtected = createRouteMatcher([
        "/inbox(.*)",
        "/wardrobe(.*)",
        "/looks(.*)",
        "/money(.*)",
        "/sources(.*)",
        "/signals(.*)",
        "/notifications(.*)",
        "/settings(.*)",
        "/api/wardrobe(.*)",
        "/api/signals(.*)",
        "/api/money(.*)",
        "/api/notifications(.*)",
        "/api/privacy(.*)",
        "/api/consent(.*)",
        "/api/assets(.*)",
        "/api/gmail(.*)",
      ]);
      return clerkMiddleware(
        async (auth0, req, evt) => {
          if (isProtected(req)) await auth0.protect();
          // Reuse the userId resolved by this Clerk middleware invocation.
          // Calling auth() again while constructing a second NextResponse can
          // lose Clerk's handshake headers and cause repeated re-auth redirects.
          const clerkAuth = await auth0();
          return sessionBootstrap(req, evt, clerkAuth.userId ?? null);
        },
        {
          authorizedParties: authorizedParties?.length ? authorizedParties : undefined,
          signInUrl: "/sign-in",
          signUpUrl: "/sign-up",
        },
      )(request, event);
    } catch (e) {
      // Never let auth-provider failures produce a 500 — fail honestly.
      console.error("clerk middleware failure", e);
      return new NextResponse("Authentication is temporarily unavailable.", { status: 503 });
    }
  }

  // --- Local labelled mode: session bootstrap only --------------------------
  return sessionBootstrap(request);
}

/** Mint/verify the Atlas session cookie bound to the verified principal. */
async function sessionBootstrap(
  request: NextRequest,
  _event?: NextFetchEvent,
  clerkUserId: string | null = null,
) {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const verified = existing ? await verifySession(existing) : null;

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) {
    // Clerk configured: the cookie must mirror the Clerk-verified identity.
    if (clerkUserId) {
      if (verified?.source === "clerk" && verified.userId === clerkUserId) {
        return NextResponse.next();
      }
      const value = await serializeSession(clerkUserId, "clerk");
      request.cookies.set(SESSION_COOKIE, value);
      const response = NextResponse.next({ request });
      response.cookies.set(SESSION_COOKIE, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    }
    // Clerk configured but visitor signed out: no session identity is minted.
    // Protected routes have already been redirected by auth.protect(); public
    // pages render and surfaces must show "signed out" honestly.
    return NextResponse.next();
  }

  // Local mode: mint/reuse a synthetic (labelled) principal.
  if (verified) {
    return NextResponse.next();
  }
  const userId = crypto.randomUUID();
  const value = await serializeSession(userId, "local");
  request.cookies.set(SESSION_COOKIE, value);
  const response = NextResponse.next({ request });
  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the PWA shell files.
    "/((?!_next/static|_next/image|sw.js|manifest.webmanifest|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|ico|svg|webp|txt|xml)$).*)",
  ],
};
