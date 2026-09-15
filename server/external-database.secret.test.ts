import { describe, expect, it } from "vitest";
import pg from "pg";

const { Client } = pg;

describe("External Atlas database secret", () => {
  it("connects and runs a read-only SELECT 1", async () => {
    const url = process.env.ATLAS_EXTERNAL_DATABASE_URL?.trim();
    expect(url, "ATLAS_EXTERNAL_DATABASE_URL must be configured").toBeTruthy();

    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await client.end();
    }
  }, 30_000);
});
