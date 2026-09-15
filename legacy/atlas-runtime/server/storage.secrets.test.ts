import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";

describe("Atlas storage secrets", () => {
  it("authenticates Cloudinary with the read-only ping endpoint", async () => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    expect(cloudName).toBeTruthy();
    expect(apiKey).toBeTruthy();
    expect(apiSecret).toBeTruthy();

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/ping`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    expect(response.ok, `Cloudinary ping returned HTTP ${response.status}`).toBe(true);
    const body = (await response.json()) as { status?: string };
    expect(body.status).toBe("ok");
  }, 30_000);

  it("connects to the managed database without exposing its URL", async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    expect(databaseUrl, "DATABASE_URL must be provisioned by the managed project").toBeTruthy();

    const connection = await mysql.createConnection(databaseUrl as string);
    try {
      const [rows] = await connection.query("SELECT 1 AS ok");
      expect((rows as Array<{ ok?: number }>)[0]?.ok).toBe(1);
    } finally {
      await connection.end();
    }
  }, 30_000);
});
