import { describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { api, internal } from "./_generated/api";
import { setup } from "./test.setup";

const ALICE = { subject: "user_alice", email: "alice@example.test", name: "Alice" };
const BOB = { subject: "user_bob", email: "bob@example.test", name: "Bob" };

describe("users", () => {
  it("returns null when signed out and never trusts a client-supplied identity", async () => {
    const t = setup();
    expect(await t.query(api.users.me, {})).toBeNull();
    await expect(t.mutation(api.users.ensure, {})).rejects.toThrow(/Sign in/);
  });

  it("creates the user once and keeps the role as user", async () => {
    const t = setup();
    const asAlice = t.withIdentity(ALICE);
    const first = await asAlice.mutation(api.users.ensure, {});
    const second = await asAlice.mutation(api.users.ensure, {});
    expect(second).toBe(first);
    expect(await asAlice.query(api.users.me, {})).toMatchObject({ email: ALICE.email, role: "user" });
  });
});

describe("AI usage admission", () => {
  it("enforces the per-user daily AI quota", async () => {
    const t = setup();
    const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    for (let i = 0; i < 500; i += 1) await t.mutation(internal.ai.usage.admit, { userId, paid: false });
    await expect(t.mutation(internal.ai.usage.admit, { userId, paid: false })).rejects.toThrow(/today's AI limit/);
  });

  it("blocks paid AI when no spend cap is configured, and once the cap is reached", async () => {
    const t = setup();
    vi.stubEnv("ATLAS_MAX_DAILY_SPEND_USD", "");
    await expect(t.mutation(internal.ai.usage.admit, { paid: true })).rejects.toThrow(/Paid AI is paused/);

    vi.stubEnv("ATLAS_MAX_DAILY_SPEND_USD", "0.01");
    await t.mutation(internal.ai.usage.admit, { paid: true });
    await t.mutation(internal.ai.usage.record, {
      capability: "text", dataClass: "personal_text", provider: "bedrock", model: "m", keyAlias: "bedrock#1",
      costUsd: 0.02, latencyMs: 5, ok: true,
    });
    expect(await t.query(internal.ai.usage.spendTodayUsd, {})).toBeCloseTo(0.02);
    await expect(t.mutation(internal.ai.usage.admit, { paid: true })).rejects.toThrow(/Paid AI is paused/);
    vi.unstubAllEnvs();
  });
});

describe("account deletion", () => {
  async function seed(t: ReturnType<typeof setup>, who: typeof ALICE) {
    const userId = await t.withIdentity(who).mutation(api.users.ensure, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("consentGrants", { userId, scope: "garment_image_analysis", granted: true, grantedAt: 1, consentVersion: "v1" });
      await ctx.db.insert("auditEvents", { userId, kind: "test", createdAt: 1 });
      await ctx.db.insert("aiUsage", {
        userId, capability: "text", dataClass: "public_text", provider: "groq", model: "m", keyAlias: "groq#1",
        costUsd: 0, latencyMs: 1, ok: true, createdAt: 1,
      });
    });
    return userId;
  }

  async function countRows(t: ReturnType<typeof setup>) {
    return t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      consents: (await ctx.db.query("consentGrants").collect()).length,
      audits: (await ctx.db.query("auditEvents").collect()).length,
      usage: (await ctx.db.query("aiUsage").collect()).length,
    }));
  }

  it("purges every row of the deleted user and nothing of anyone else", async () => {
    vi.useFakeTimers();
    const t = setup();
    await seed(t, ALICE);
    await seed(t, BOB);
    await t.mutation(internal.privacy.purgeByClerkId, { clerkId: ALICE.subject });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await countRows(t)).toEqual({ users: 1, consents: 1, audits: 1, usage: 1 });
    expect(await t.withIdentity(BOB).query(api.users.me, {})).not.toBeNull();
    vi.useRealTimers();
  });

  it("rejects unsigned webhooks and purges on a correctly signed user.deleted", async () => {
    vi.useFakeTimers();
    const secret = `whsec_${btoa("atlas-test-secret-32-bytes-long!!")}`;
    vi.stubEnv("CLERK_WEBHOOK_SECRET", secret);
    const t = setup();
    await seed(t, ALICE);

    const body = JSON.stringify({ type: "user.deleted", data: { id: ALICE.subject } });
    const unsigned = await t.fetch("/clerk-users-webhook", { method: "POST", body });
    expect(unsigned.status).toBe(400);

    const msgId = "msg_test_1";
    const timestamp = new Date();
    const signature = new Webhook(secret).sign(msgId, timestamp, body);
    const signed = await t.fetch("/clerk-users-webhook", {
      method: "POST",
      body,
      headers: {
        "svix-id": msgId,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": signature,
      },
    });
    expect(signed.status).toBe(200);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await countRows(t)).toEqual({ users: 0, consents: 0, audits: 0, usage: 0 });
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
});
