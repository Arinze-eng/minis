import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { buildGoogleTasksAuthorizeUrl, googleTasksConfigured, googleTasksRedirectUri } from "@/lib/server/googleTasks";
import { codeChallenge, randomCodeVerifier, randomState, tokenEncryptionConfigured } from "@/lib/server/secretBox";

export async function GET(request: Request) {
  if (!googleTasksConfigured()) return NextResponse.json({ error: "google_tasks_not_configured" }, { status: 503 });
  if (!tokenEncryptionConfigured()) return NextResponse.json({ error: "encryption_not_configured" }, { status: 503 });
  const principal = await requirePrincipal();
  const { store } = getStore();
  const state = randomState();
  const verifier = randomCodeVerifier();
  await store.createOauthState(state, principal.userId, "google_tasks_connect", verifier, 600);
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(buildGoogleTasksAuthorizeUrl({
    state,
    codeChallenge: codeChallenge(verifier),
    redirectUri: googleTasksRedirectUri(origin),
  }));
}
