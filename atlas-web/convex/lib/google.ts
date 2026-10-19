import { appError } from "./errors";

/** Google OAuth + Gmail/Tasks REST helpers (fetch only, so they run in Convex's default runtime). */

export const GOOGLE_SCOPES = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  google_tasks: "https://www.googleapis.com/auth/tasks.readonly",
} as const;
export type GoogleProvider = keyof typeof GOOGLE_SCOPES;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const TIMEOUT = () => AbortSignal.timeout(15_000);

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function client() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) throw appError("UPSTREAM_FAILED", "Google sign-in isn't configured on this deployment.");
  return { id, secret };
}

/**
 * Redirect URIs must point at an allowed site origin (ATLAS_SITE_ORIGINS, comma-separated), so a
 * caller can never make Google send a code to a host we don't control.
 */
export function assertRedirectUri(redirectUri: string, provider: GoogleProvider): void {
  const origins = (process.env.ATLAS_SITE_ORIGINS ?? "http://localhost:3100").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  const allowed = origins.map((origin) => `${origin}/api/oauth/${provider}/callback`);
  if (!allowed.includes(redirectUri)) throw appError("INVALID_INPUT", "That redirect address isn't allowed.");
}

export function authorizeUrl(provider: GoogleProvider, params: { state: string; challenge: string; redirectUri: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", client().id);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES[provider]);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeCode(params: { code: string; verifier: string; redirectUri: string }) {
  const { id, secret } = client();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      code: params.code,
      code_verifier: params.verifier,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    }),
    signal: TIMEOUT(),
  });
  if (!res.ok) throw appError("UPSTREAM_FAILED", `Google rejected the sign-in (${res.status}).`);
  const json = (await res.json()) as { refresh_token?: string; scope?: string };
  return { refreshToken: json.refresh_token, scopes: (json.scope ?? "").split(" ").filter(Boolean) };
}

export async function accessToken(refreshToken: string): Promise<string> {
  const { id, secret } = client();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    signal: TIMEOUT(),
  });
  if (!res.ok) throw appError("UPSTREAM_FAILED", `Google refused the stored access (${res.status}). Reconnect the source.`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw appError("UPSTREAM_FAILED", "Google returned no access token.");
  return json.access_token;
}

export async function revoke(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: TIMEOUT(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function googleJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: TIMEOUT() });
  if (!res.ok) throw appError("UPSTREAM_FAILED", `Google API error ${res.status}.`);
  return (await res.json()) as T;
}
