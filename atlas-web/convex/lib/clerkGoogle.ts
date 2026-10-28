import { optionalEnv } from "./env";

/**
 * Google access token for a user who signed in with Google through Clerk. Clerk stores the grant and
 * refreshes it, so Atlas keeps no Google secret of its own for these users. Needs CLERK_SECRET_KEY on
 * the Convex deployment and, for Gmail/Tasks, the matching scopes on Clerk's Google connection
 * (custom credentials). Returns null when the user has no Google account linked.
 */
export async function clerkGoogleToken(clerkUserId: string): Promise<{ token: string; scopes: string[] } | null> {
  const secret = optionalEnv("CLERK_SECRET_KEY");
  // Local dev identities ("local:…") are not Clerk users.
  if (!secret || clerkUserId.startsWith("local:")) return null;
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}/oauth_access_tokens/oauth_google`,
    { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (response.status === 404 || response.status === 422) return null;
  if (!response.ok) throw new Error(`Clerk returned ${response.status} for the Google token`);
  const body = (await response.json()) as unknown;
  // The endpoint returns a bare array, or { data } when paginated.
  const rows = (Array.isArray(body) ? body : ((body as { data?: unknown[] }).data ?? [])) as { token?: string; scopes?: string[] }[];
  const row = rows.find((r) => typeof r.token === "string" && r.token.length > 0);
  return row?.token ? { token: row.token, scopes: row.scopes ?? [] } : null;
}

export function clerkConfiguredOnServer(): boolean {
  return Boolean(optionalEnv("CLERK_SECRET_KEY"));
}
