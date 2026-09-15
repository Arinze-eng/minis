import { describe, expect, it } from "vitest";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  expect(value, `${name} must be configured in the managed project`).toBeTruthy();
  return value as string;
};

describe("Atlas integration secrets", () => {
  it("validates Google OAuth credentials and refresh token", async () => {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: required("ATLAS_GOOGLE_CLIENT_ID"),
        client_secret: required("ATLAS_GOOGLE_CLIENT_SECRET"),
        refresh_token: required("ATLAS_GOOGLE_REFRESH_TOKEN"),
        grant_type: "refresh_token",
      }),
    });
    expect(response.ok, `Google OAuth token refresh returned HTTP ${response.status}`).toBe(true);
    const body = (await response.json()) as { access_token?: string };
    expect(body.access_token).toBeTruthy();
  }, 30_000);

  it("validates SerpApi with its account endpoint", async () => {
    const response = await fetch(
      `https://serpapi.com/account.json?api_key=${encodeURIComponent(required("ATLAS_SERPAPI_API_KEY"))}`,
    );
    expect(response.ok, `SerpApi account endpoint returned HTTP ${response.status}`).toBe(true);
  }, 30_000);

  it("validates Plaid Sandbox with a read-only item lookup", async () => {
    const response = await fetch("https://sandbox.plaid.com/item/get", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: required("ATLAS_PLAID_CLIENT_ID"),
        secret: required("ATLAS_PLAID_SECRET"),
        access_token: required("ATLAS_PLAID_ACCESS_TOKEN"),
      }),
    });
    expect(response.ok, `Plaid Sandbox item lookup returned HTTP ${response.status}`).toBe(true);
  }, 30_000);

  it("validates Telegram with the read-only getMe endpoint", async () => {
    const token = required("TELEGRAM_BOT_TOKEN");
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`);
    expect(response.ok, `Telegram getMe returned HTTP ${response.status}`).toBe(true);
    const body = (await response.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  }, 30_000);
});
