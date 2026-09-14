import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import {
  buildAuthorizeUrl,
  gmailConfigured,
  gmailRedirectUri,
} from "@/lib/server/gmail";
import {
  codeChallenge,
  randomCodeVerifier,
  randomState,
  tokenEncryptionConfigured,
} from "@/lib/server/secretBox";

/**
 * Step 1 of the consent-gated Gmail connection (product contract §11):
 * generate cryptographically random state + PKCE verifier, persist them
 * server-side (10-minute TTL), and redirect to Google's consent screen.
 * The verifier never leaves the server; only the challenge travels in the URL.
 */
export async function GET(request: Request) {
  if (!gmailConfigured()) {
    return NextResponse.json(
      {
        error: "gmail_not_configured",
        message:
          "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Gmail connection. Atlas will not simulate a connection.",
      },
      { status: 503 },
    );
  }
  if (!tokenEncryptionConfigured()) {
    return NextResponse.json(
      {
        error: "encryption_not_configured",
        message:
          "Set ENCRYPTION_KEY before connecting Gmail — refresh tokens are encrypted at the application layer before storage.",
      },
      { status: 503 },
    );
  }

  const principal = await requirePrincipal();
  const { store } = getStore();

  const state = randomState();
  const verifier = randomCodeVerifier();
  await store.createOauthState(state, principal.userId, "gmail_connect", verifier, 600);

  const origin = new URL(request.url).origin;
  const authorizeUrl = buildAuthorizeUrl({
    state,
    codeChallenge: codeChallenge(verifier),
    redirectUri: gmailRedirectUri(origin),
  });

  return NextResponse.redirect(authorizeUrl);
}
