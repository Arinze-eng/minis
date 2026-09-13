import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, serializeSession, verifySession } from "@/lib/server/sessionCrypto";

/**
 * Session bootstrap (threat model §5.1): every request carries a server-verified
 * principal before any render or route handler runs. The cookie is minted here —
 * middleware is the one place that may set cookies outside Server Actions — so
 * server components can READ identity without ever mutating cookies (which
 * Next.js forbids in RSC).
 *
 * The browser never asserts an arbitrary user id: the uid is HMAC-signed and
 * verified server-side on every request.
 */
export async function middleware(request: NextRequest) {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (existing && (await verifySession(existing))) {
    return NextResponse.next();
  }

  const userId = crypto.randomUUID();
  const value = await serializeSession(userId);

  // Forward the new cookie into this same request's render, then persist it
  // on the response (the documented request+response cookie pattern).
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
