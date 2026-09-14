import { describe, expect, it } from "vitest";
import { Client } from "pg";

describe("external integration secrets", () => {
  it("authenticates to Cloudinary without exposing credentials", async () => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary secrets are not configured");

    const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image?max_results=1`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    expect(response.ok).toBe(true);
  }, 30_000);

  it("opens a lightweight Neon PostgreSQL connection without exposing the URL", async () => {
    const connectionString = process.env.NEON_DATABASE_URL;
    if (!connectionString) throw new Error("NEON_DATABASE_URL is not configured");
    const client = new Client({ connectionString, connectionTimeoutMillis: 15_000, query_timeout: 15_000, ssl: { rejectUnauthorized: true } });
    await client.connect();
    const result = await client.query<{ ok: number }>("select 1 as ok");
    await client.end();
    expect(result.rows[0]?.ok).toBe(1);
  }, 30_000);
});
