import "server-only";

import { GOOGLE_TASKS_SCOPE, buildAuthorizeUrl, exchangeCodeForTokens, gmailConfigured, validAccessToken } from "./gmail";

const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

export { GOOGLE_TASKS_SCOPE };
export const googleTasksConfigured = gmailConfigured;

export function googleTasksRedirectUri(origin: string): string {
  const configured = process.env.GOOGLE_TASKS_REDIRECT_URI?.trim();
  if (configured) return configured;
  const publicOrigin = process.env.ATLAS_PUBLIC_ORIGIN?.split(",")[0]?.trim();
  if (publicOrigin) return `${publicOrigin.replace(/\/$/, "")}/api/google-tasks/callback`;
  return `${origin}/api/google-tasks/callback`;
}

export function buildGoogleTasksAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  return buildAuthorizeUrl({ ...params, scope: GOOGLE_TASKS_SCOPE });
}

export { exchangeCodeForTokens, validAccessToken };

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status?: string;
  updated?: string;
  webViewLink?: string;
}

export async function listGoogleTasks(refreshTokenEnvelope: string): Promise<GoogleTask[]> {
  const accessToken = await validAccessToken(refreshTokenEnvelope);
  const response = await fetch(`${TASKS_API}/lists/@default/tasks?maxResults=100&showCompleted=false&showHidden=false`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("google_tasks_unauthorized");
  if (!response.ok) throw new Error(`google_tasks_failed:${response.status}`);
  const body = (await response.json()) as { items?: GoogleTask[] };
  return (body.items ?? []).filter((task) => task?.id && task?.title);
}
