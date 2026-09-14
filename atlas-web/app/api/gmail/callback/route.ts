import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import {
  exchangeCodeForTokens,
  gmailConfigured,
  gmailRedirectUri,
  GMAIL_SCOPE,
} from "@/lib/server/gmail";
import { encryptRefreshToken, tokenEncryptionConfigured } from "@/lib/server/secretBox";

/**
 * Step 2 of the consent-gated Gmail connection. Google returns here with
 * `code` + `state`. The state is consumed atomically (single-use, TTL-bound)
 * and carries the principal id + PKCE verifier — so the connection is bound to
 * the user who started it, verified server-side, never by client-supplied ids.
 *
 * Failure modes land on /sources with an honest error marker; success lands
 * there with the connection active.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const back = (marker: string) =>
    NextResponse.redirect(new URL(`/sources?gmail=${encodeURIComponent(marker)}`, url.origin));

  if (oauthError) return back("denied");
  if (!gmailConfigured()) return back("not_configured");
  if (!tokenEncryptionConfigured()) return back("encryption_missing");
  if (!code || !state) return back("invalid_callback");

  const { store } = getStore();
  const consumed = await store.consumeOauthState(state);
  if (!consumed) return back("expired_state"); // replayed, forged, or older than 10 min
  if (consumed.action !== "gmail_connect") return back("invalid_state");

  try {
    const origin = url.origin;
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: consumed.codeVerifier,
      redirectUri: gmailRedirectUri(origin),
    });

    // Scope guard: Google must have granted exactly the read-only scope we asked for.
    const scopes = tokens.scope.split(" ").filter(Boolean);
    if (!scopes.includes(GMAIL_SCOPE)) return back("scope_rejected");

    if (!tokens.refreshToken) {
      // access_type=offline + prompt=consent should always yield one; refuse
      // silently-degrading sessions.
      return back("no_refresh_token");
    }

    const encrypted = encryptRefreshToken(tokens.refreshToken);
    await store.upsertSourceConnection(consumed.principalId, "gmail", {
      status: "connected",
      scopes: [GMAIL_SCOPE],
      encryptedRefreshToken: encrypted,
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
      lastError: null,
    });
    await store.audit(consumed.principalId, "gmail_connected", null, {
      scopes,
      // Note: no token material, no account email unless we later fetch it via
      // userinfo — we deliberately skip the extra request/scope.
    });
    return back("connected");
  } catch (e) {
    const message = e instanceof Error ? e.message : "callback_failed";
    return back(`error:${encodeURIComponent(message.slice(0, 120))}`);
  }
}
