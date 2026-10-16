import "server-only";

/**
 * Gmail connector (server-only). Implements the authorization-code flow with
 * PKCE against Google's OAuth endpoints, metadata-only message reads, and
 * bounded deterministic extraction. Raw payloads and full bodies are never
 * persisted — only the bounded fields below survive a scan.
 */

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks.readonly";

export function gmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

/** Where Google must return the user. Registered exactly in Google Cloud. */
export function gmailRedirectUri(origin: string): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;

  const publicOrigin = process.env.ATLAS_PUBLIC_ORIGIN?.split(",")[0]?.trim();
  if (publicOrigin) return `${publicOrigin.replace(/\/$/, "")}/api/gmail/callback`;

  return `${origin}/api/gmail/callback`;
}

export function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID!.trim();
}

export function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET!.trim();
}

// ---------------------------------------------------------------------------
// OAuth: authorize URL + code exchange
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  scope?: string;
  loginHint?: string | null;
}): string {
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scope ?? GMAIL_SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Refresh token is required for background renewal scans.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
}

export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenExchangeResult> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code: params.code,
      code_verifier: params.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token_exchange_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) throw new Error("token_exchange_missing_access_token");
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope ?? GMAIL_SCOPE,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`refresh_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("refresh_missing_access_token");
  return json.access_token;
}

/** Best-effort revocation at Google; disconnect must also delete local state. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(GOOGLE_REVOKE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Gmail reads: metadata-only (headers never bodies)
// ---------------------------------------------------------------------------

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
  };
  internalDate?: string;
}

async function gmailFetch(
  path: string,
  accessToken: string,
): Promise<Response> {
  return fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Get a fresh access token for a stored connection; throws on decrypt failure
 * so callers can mark the connection error instead of silently continuing.
 */
export async function validAccessToken(refreshTokenEnvelope: string): Promise<string> {
  const { decryptRefreshToken } = await import("./secretBox");
  const refreshToken = decryptRefreshToken(refreshTokenEnvelope);
  if (!refreshToken) throw new Error("token_decrypt_failed");
  return refreshAccessToken(refreshToken);
}

/**
 * List message ids matching receipts/subscriptions, metadata format only.
 * `pageToken` supports resume; `maxResults` is capped by the caller.
 */
export async function listMessageIds(params: {
  accessToken: string;
  maxResults: number;
  pageToken?: string;
}): Promise<{ ids: string[]; pageToken?: string; resultSizeEstimate: number }> {
  const q = encodeURIComponent(
    'subject:(receipt OR invoice OR subscription OR "your order" OR renewal OR "payment confirmation")',
  );
  const tokenPart = params.pageToken ? `&pageToken=${encodeURIComponent(params.pageToken)}` : "";
  const res = await gmailFetch(
    `/messages?maxResults=${params.maxResults}&q=${q}${tokenPart}`,
    params.accessToken,
  );
  if (res.status === 401) throw new Error("gmail_unauthorized");
  if (!res.ok) throw new Error(`gmail_list_failed:${res.status}`);
  const json = (await res.json()) as {
    messages?: { id: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  };
  return {
    ids: (json.messages ?? []).map((m) => m.id),
    pageToken: json.nextPageToken,
    resultSizeEstimate: json.resultSizeEstimate ?? 0,
  };
}

/** Metadata-only read: headers + internalDate. Never requests body content. */
export async function getMessageMetadata(
  messageId: string,
  accessToken: string,
): Promise<{ id: string; threadId: string; date: string | null; headers: Record<string, string> } | null> {
  const res = await gmailFetch(`/messages/${encodeURIComponent(messageId)}?format=metadata`, accessToken);
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error("gmail_unauthorized");
  if (!res.ok) throw new Error(`gmail_get_failed:${res.status}`);
  const json = (await res.json()) as GmailMessageMeta;
  const headers: Record<string, string> = {};
  for (const h of json.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  return {
    id: json.id,
    threadId: json.threadId,
    date: json.internalDate ? new Date(Number(json.internalDate)).toISOString() : null,
    headers,
  };
}
