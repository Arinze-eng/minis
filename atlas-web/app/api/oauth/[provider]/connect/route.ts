import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexAsUser } from "@/lib/server/convexToken";
import { isOAuthProvider } from "@/lib/server/oauthProviders";

/** Step 1: Convex creates the single-use PKCE state for this user and returns Google's consent URL. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const back = (marker: string) => NextResponse.redirect(new URL(`/sources?${provider}=${encodeURIComponent(marker)}`, url.origin));
  if (!isOAuthProvider(provider)) return NextResponse.json({ error: "Unknown source." }, { status: 404 });
  const convex = await convexAsUser();
  if (!convex) return NextResponse.redirect(new URL("/sign-in", url.origin));
  try {
    const target = await convex.action(api.sources.startOAuth, { provider, redirectUri: `${url.origin}/api/oauth/${provider}/callback` });
    return NextResponse.redirect(target);
  } catch {
    return back("not_configured");
  }
}
