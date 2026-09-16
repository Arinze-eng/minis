import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { encryptRefreshToken, tokenEncryptionConfigured } from "@/lib/server/secretBox";
import { GOOGLE_TASKS_SCOPE, exchangeCodeForTokens, googleTasksConfigured, googleTasksRedirectUri } from "@/lib/server/googleTasks";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (marker: string) => NextResponse.redirect(new URL(`/tasks?google_tasks=${encodeURIComponent(marker)}`, url.origin));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("denied");
  if (!googleTasksConfigured()) return back("not_configured");
  if (!tokenEncryptionConfigured()) return back("encryption_missing");
  if (!code || !state) return back("invalid_callback");

  const { store } = getStore();
  const consumed = await store.consumeOauthState(state);
  if (!consumed || consumed.action !== "google_tasks_connect") return back("invalid_state");

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: consumed.codeVerifier,
      redirectUri: googleTasksRedirectUri(url.origin),
    });
    const scopes = tokens.scope.split(" ").filter(Boolean);
    if (!scopes.includes(GOOGLE_TASKS_SCOPE)) return back("scope_rejected");
    if (!tokens.refreshToken) return back("no_refresh_token");
    await store.upsertSourceConnection(consumed.principalId, "google_tasks", {
      status: "connected",
      scopes: [GOOGLE_TASKS_SCOPE],
      encryptedRefreshToken: encryptRefreshToken(tokens.refreshToken),
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
      lastError: null,
    });
    await store.audit(consumed.principalId, "google_tasks_connected", null, { scopes });
    return back("connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : "callback_failed";
    return back(`error:${encodeURIComponent(message.slice(0, 120))}`);
  }
}
