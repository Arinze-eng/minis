import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexAsUser } from "@/lib/server/convexToken";
import { isOAuthProvider } from "@/lib/server/oauthProviders";

/** Step 2: Convex consumes the state (same user, same provider, 10 min), exchanges and encrypts the token. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const back = (marker: string) => NextResponse.redirect(new URL(`/sources?${provider}=${encodeURIComponent(marker)}`, url.origin));
  if (!isOAuthProvider(provider)) return NextResponse.json({ error: "Unknown source." }, { status: 404 });
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("invalid_callback");
  const convex = await convexAsUser();
  if (!convex) return back("invalid_state");
  try {
    await convex.action(api.sources.completeOAuth, { provider, code, state, redirectUri: `${url.origin}/api/oauth/${provider}/callback` });
    return back("connected");
  } catch (error) {
    const code = error instanceof ConvexError && typeof error.data === "object" ? (error.data as { code?: string }).code : undefined;
    return back(code === "FORBIDDEN" ? "invalid_state" : "failed");
  }
}
