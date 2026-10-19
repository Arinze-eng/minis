import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { clerkConfigured } from "./clerkIdentity";
import { devAuthEnabled, signDevToken } from "./devAuth";
import { requirePrincipal } from "./identity";

/**
 * The signed-in user's Convex token for server-side calls (OAuth callbacks, the stylist). Clerk issues
 * it in production (JWT template "convex"); local dev uses the dev issuer. Null when signed out.
 */
export async function convexTokenForRequest(): Promise<string | null> {
  if (clerkConfigured()) {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    return (await session.getToken({ template: "convex" })) ?? null;
  }
  if (!devAuthEnabled()) return null;
  try {
    const principal = await requirePrincipal();
    return signDevToken(`local:${principal.userId}`);
  } catch {
    return null;
  }
}

/** A Convex client acting as the current user, so every Convex permission check applies. */
export async function convexAsUser(): Promise<ConvexHttpClient | null> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const token = await convexTokenForRequest();
  if (!url || !token) return null;
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return client;
}
