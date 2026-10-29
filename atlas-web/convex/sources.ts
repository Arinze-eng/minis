import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError, isAppError } from "./lib/errors";
import {
  GOOGLE_SCOPES,
  accessToken,
  assertRedirectUri,
  authorizeUrl,
  exchangeCode,
  googleConfigured,
  googleJson,
  revoke,
} from "./lib/google";
import { clerkConfiguredOnServer, clerkGoogleToken } from "./lib/clerkGoogle";
import { decryptSecret, encryptSecret, encryptionConfigured, pkceChallenge, randomToken } from "./lib/secretBox";
import { audit } from "./model/core";
import { extractFinding } from "./model/email";
import { annualizedOf, notify, syncSignals } from "./model/signals";

const vProvider = v.union(v.literal("gmail"), v.literal("google_tasks"));
const STATE_TTL_MS = 10 * 60_000;
const SCAN_CAP = 250;

/** Resolve the caller inside an action (actions have no db; identity comes from the verified JWT). */
async function callerId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
  const userId = await ctx.runQuery(internal.sources.userIdByClerk, { clerkId: identity.subject });
  if (!userId) throw appError("UNAUTHENTICATED", "Your account is still being set up.");
  return userId;
}

export const userIdByClerk = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { clerkId }) =>
    (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId)).unique())?._id ?? null,
});

// ---- Status ----------------------------------------------------------------------------------

export const status = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await Promise.all(
      (["gmail", "google_tasks"] as const).map((provider) =>
        ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", provider)).unique(),
      ),
    );
    const latestScan = (
      await ctx.db.query("jobs").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(20)
    ).find((job) => job.type === "gmail_scan");
    return {
      configured: {
        google: googleConfigured(),
        encryption: encryptionConfigured(),
        clerk: clerkConfiguredOnServer(),
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
      },
      // Never return token material: only the fields a status card needs.
      connections: rows.filter((r) => r !== null).map((r) => ({
        provider: r.provider,
        status: r.status,
        via: r.via ?? "oauth",
        connectedAt: r.connectedAt,
        lastScanAt: r.lastScanAt,
        lastError: r.lastError,
      })),
      latestScan: latestScan ?? null,
    };
  },
});

// ---- OAuth (called by the Next.js route handlers with the user's own token) ------------------

export const startOAuth = action({
  args: { provider: vProvider, redirectUri: v.string() },
  returns: v.string(),
  handler: async (ctx, { provider, redirectUri }) => {
    const userId = await callerId(ctx);
    if (!encryptionConfigured()) throw appError("UPSTREAM_FAILED", "Set ENCRYPTION_KEY before connecting a source.");
    assertRedirectUri(redirectUri, provider);
    const state = randomToken(24);
    const verifier = randomToken(48);
    await ctx.runMutation(internal.sources.saveState, { state, userId, provider, codeVerifier: verifier });
    return authorizeUrl(provider, { state, challenge: await pkceChallenge(verifier), redirectUri });
  },
});

export const saveState = internalMutation({
  args: { state: v.string(), userId: v.id("users"), provider: vProvider, codeVerifier: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", { ...args, expiresAt: Date.now() + STATE_TTL_MS });
    return null;
  },
});

/** Single-use, TTL-bound state; returns null when replayed, expired or unknown. */
export const consumeState = internalMutation({
  args: { state: v.string() },
  returns: v.union(v.null(), v.object({ userId: v.id("users"), provider: vProvider, codeVerifier: v.string() })),
  handler: async (ctx, { state }) => {
    const row = await ctx.db.query("oauthStates").withIndex("by_state", (q) => q.eq("state", state)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt <= Date.now()) return null;
    return { userId: row.userId, provider: row.provider, codeVerifier: row.codeVerifier };
  },
});

export const completeOAuth = action({
  args: { provider: vProvider, code: v.string(), state: v.string(), redirectUri: v.string() },
  returns: v.null(),
  handler: async (ctx, { provider, code, state, redirectUri }) => {
    const userId = await callerId(ctx);
    assertRedirectUri(redirectUri, provider);
    const consumed = await ctx.runMutation(internal.sources.consumeState, { state });
    // The browser finishing the flow must be the user who started it, for the same provider.
    if (!consumed || consumed.userId !== userId || consumed.provider !== provider) {
      throw appError("FORBIDDEN", "This connection link expired or belongs to another session. Start again.");
    }
    const tokens = await exchangeCode({ code, verifier: consumed.codeVerifier, redirectUri });
    if (!tokens.scopes.includes(GOOGLE_SCOPES[provider])) throw appError("FORBIDDEN", "Google didn't grant the read-only access Atlas asked for.");
    if (!tokens.refreshToken) throw appError("UPSTREAM_FAILED", "Google returned no long-lived access. Remove Atlas in your Google account and connect again.");
    await ctx.runMutation(internal.sources.saveConnection, {
      userId,
      provider,
      scopes: [GOOGLE_SCOPES[provider]],
      encryptedRefreshToken: await encryptSecret(tokens.refreshToken),
    });
    return null;
  },
});

export const saveConnection = internalMutation({
  args: { userId: v.id("users"), provider: vProvider, scopes: v.array(v.string()), encryptedRefreshToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, provider, scopes, encryptedRefreshToken }) => {
    const now = Date.now();
    const existing = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider)).unique();
    const row = { status: "connected" as const, via: "oauth" as const, autoConnect: true, scopes, encryptedRefreshToken, connectedAt: now, lastError: undefined, updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("sourceConnections", { userId, provider, ...row });
    if (provider === "gmail") await grantGmailConsent(ctx, userId, now);
    await audit(ctx, userId, `${provider}_connected`);
    return null;
  },
});

async function grantGmailConsent(ctx: MutationCtx, userId: Id<"users">, now: number) {
  const consent = await ctx.db.query("consentGrants").withIndex("by_user_scope", (q) => q.eq("userId", userId).eq("scope", "gmail_read")).unique();
  if (consent) await ctx.db.patch(consent._id, { granted: true, grantedAt: now, revokedAt: undefined });
  else await ctx.db.insert("consentGrants", { userId, scope: "gmail_read", granted: true, grantedAt: now, consentVersion: "v1" });
}

// ---- Sign in with Google (Clerk) ----------------------------------------------------------------

/**
 * Called after sign-in and on the Sources page. If the user signed in with Google and granted the
 * Gmail / Tasks read-only scopes on Google's own consent screen, link those sources automatically,
 * unless the user disconnected one before; that choice sticks until they reconnect it themselves.
 */
export const syncGoogleSignIn = action({
  args: {},
  returns: v.object({ signedInWithGoogle: v.boolean(), linked: v.array(vProvider), missing: v.array(vProvider) }),
  handler: async (ctx): Promise<{ signedInWithGoogle: boolean; linked: ("gmail" | "google_tasks")[]; missing: ("gmail" | "google_tasks")[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
    const userId = await callerId(ctx);
    let google: Awaited<ReturnType<typeof clerkGoogleToken>> = null;
    try {
      google = await clerkGoogleToken(identity.subject);
    } catch {
      return { signedInWithGoogle: false, linked: [], missing: [] };
    }
    if (!google) return { signedInWithGoogle: false, linked: [], missing: [] };
    const scopes = google.scopes;
    const granted = (["gmail", "google_tasks"] as const).filter((p) => scopes.includes(GOOGLE_SCOPES[p]));
    const linked: ("gmail" | "google_tasks")[] = await ctx.runMutation(internal.sources.linkViaClerk, { userId, providers: granted });
    return { signedInWithGoogle: true, linked, missing: (["gmail", "google_tasks"] as const).filter((p) => !granted.includes(p)) };
  },
});

export const linkViaClerk = internalMutation({
  args: { userId: v.id("users"), providers: v.array(vProvider) },
  returns: v.array(vProvider),
  handler: async (ctx, { userId, providers }) => {
    const now = Date.now();
    const linked: ("gmail" | "google_tasks")[] = [];
    for (const provider of providers) {
      const existing = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider)).unique();
      if (existing?.status === "connected") {
        linked.push(provider);
        continue;
      }
      if (existing?.autoConnect === false) continue; // the user disconnected it; respect that
      const row = {
        status: "connected" as const,
        via: "clerk" as const,
        autoConnect: true,
        scopes: [GOOGLE_SCOPES[provider]],
        encryptedRefreshToken: undefined,
        connectedAt: now,
        lastError: undefined,
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("sourceConnections", { userId, provider, ...row });
      if (provider === "gmail") await grantGmailConsent(ctx, userId, now);
      await audit(ctx, userId, `${provider}_connected`, undefined, { via: "google_sign_in" });
      linked.push(provider);
    }
    return linked;
  },
});

/** The user pressed Connect after a disconnect: allow Google sign-in to link this source again. */
export const allowAutoConnect = mutation({
  args: { provider: vProvider },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", provider)).unique();
    if (existing && existing.autoConnect === false) await ctx.db.patch(existing._id, { autoConnect: true, updatedAt: Date.now() });
    return null;
  },
});

export const connection = internalQuery({
  args: { userId: v.id("users"), provider: vProvider },
  returns: v.union(
    v.null(),
    v.object({ via: v.union(v.literal("oauth"), v.literal("clerk")), envelope: v.optional(v.string()), clerkId: v.string() }),
  ),
  handler: async (ctx, { userId, provider }) => {
    const row = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider)).unique();
    const user = await ctx.db.get(userId);
    if (row?.status !== "connected" || !user) return null;
    return { via: row.via ?? "oauth", envelope: row.encryptedRefreshToken, clerkId: user.clerkId };
  },
});

/** A short-lived Google access token for this source: from Clerk (Google sign-in) or Atlas's own grant. */
async function googleToken(ctx: ActionCtx, userId: Id<"users">, provider: "gmail" | "google_tasks"): Promise<string> {
  const conn = await ctx.runQuery(internal.sources.connection, { userId, provider });
  const name = provider === "gmail" ? "Gmail" : "Google Tasks";
  if (!conn) throw appError("INVALID_INPUT", `Connect ${name} first.`);
  if (conn.via === "clerk") {
    const google = await clerkGoogleToken(conn.clerkId);
    if (!google || !google.scopes.includes(GOOGLE_SCOPES[provider])) {
      throw appError("UPSTREAM_FAILED", `Google no longer grants ${name} access. Connect it again from Sources.`);
    }
    return google.token;
  }
  const refresh = conn.envelope ? await decryptSecret(conn.envelope) : null;
  if (!refresh) throw appError("UPSTREAM_FAILED", `Stored ${name} access can't be read. Reconnect ${name}.`);
  return accessToken(refresh);
}

/** Revoke at Google (best effort), then delete the token and everything derived from that source. */
export const disconnect = action({
  args: { provider: vProvider },
  returns: v.object({ revokedAtGoogle: v.boolean() }),
  handler: async (ctx, { provider }) => {
    const userId = await callerId(ctx);
    const conn = await ctx.runQuery(internal.sources.connection, { userId, provider });
    let revokedAtGoogle = false;
    // A Clerk-held grant also signs the user in, so it is not revoked here; Atlas just stops using it.
    if (conn?.via === "oauth" && conn.envelope && encryptionConfigured()) {
      const token = await decryptSecret(conn.envelope);
      if (token) revokedAtGoogle = await revoke(token);
    }
    await ctx.runMutation(internal.sources.deleteSourceData, { userId, provider, revokedAtGoogle });
    return { revokedAtGoogle };
  },
});

export const deleteSourceData = internalMutation({
  args: { userId: v.id("users"), provider: vProvider, revokedAtGoogle: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, provider, revokedAtGoogle }) => {
    const conn = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", provider)).unique();
    if (conn) await ctx.db.patch(conn._id, { status: "disconnected", encryptedRefreshToken: undefined, autoConnect: false, updatedAt: Date.now() });
    if (provider === "gmail") {
      for (const row of await ctx.db.query("emailFindings").withIndex("by_user", (q) => q.eq("userId", userId)).take(1000)) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("garmentSuggestions").withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "pending")).take(500)) {
        await ctx.db.delete(row._id);
      }
      const consent = await ctx.db.query("consentGrants").withIndex("by_user_scope", (q) => q.eq("userId", userId).eq("scope", "gmail_read")).unique();
      if (consent) await ctx.db.patch(consent._id, { granted: false, revokedAt: Date.now() });
    }
    await audit(ctx, userId, `${provider}_disconnected`, undefined, { revokedAtGoogle });
    return null;
  },
});

// ---- Gmail scan ------------------------------------------------------------------------------

export const scanGmail = mutation({
  args: {},
  returns: v.id("jobs"),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const conn = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", "gmail")).unique();
    if (conn?.status !== "connected") throw appError("INVALID_INPUT", "Connect Gmail first.");
    const running = (await ctx.db.query("jobs").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "running")).take(20)).find(
      (job) => job.type === "gmail_scan" && Date.now() - job.updatedAt < 10 * 60_000,
    );
    if (running) return running._id;
    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", {
      userId: user._id,
      type: "gmail_scan",
      status: "running",
      steps: [{ key: "scan", label: "Reading receipt and subscription headers", status: "running", startedAt: now }],
      progress: 0.05,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.sources.runGmailScan, { userId: user._id, jobId });
    return jobId;
  },
});

type GmailList = { messages?: { id: string }[]; nextPageToken?: string };
type GmailMeta = { id: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };

export const runGmailScan = internalAction({
  args: { userId: v.id("users"), jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { userId, jobId }) => {
    try {
      const token = await googleToken(ctx, userId, "gmail");
      const q = encodeURIComponent('newer_than:90d subject:(receipt OR invoice OR subscription OR "your order" OR renewal OR trial OR "payment confirmation")');
      const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await googleJson<GmailList>(`${base}?maxResults=100&q=${q}${pageToken ? `&pageToken=${pageToken}` : ""}`, token);
        ids.push(...(page.messages ?? []).map((m) => m.id));
        pageToken = page.nextPageToken;
      } while (pageToken && ids.length < SCAN_CAP);

      const findings = [];
      for (const [index, id] of ids.slice(0, SCAN_CAP).entries()) {
        const meta = await googleJson<GmailMeta>(
          `${base}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`,
          token,
        ).catch(() => null);
        if (!meta) continue;
        const headers: Record<string, string> = {};
        for (const h of meta.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
        const finding = extractFinding({ messageId: meta.id, headers, occurredAt: meta.internalDate ? Number(meta.internalDate) : undefined });
        if (finding) findings.push(finding);
        if (index % 50 === 49) await ctx.runMutation(internal.sources.scanProgress, { jobId, progress: 0.05 + (0.85 * (index + 1)) / ids.length });
      }
      await ctx.runMutation(internal.sources.recordScan, { userId, jobId, scanned: ids.length, findings });
    } catch (error) {
      const message = isAppError(error) ? error.data.message : error instanceof Error ? error.message : "Scan failed.";
      await ctx.runMutation(internal.sources.failScan, { userId, jobId, error: message.slice(0, 200) });
    }
    return null;
  },
});

export const scanProgress = internalMutation({
  args: { jobId: v.id("jobs"), progress: v.number() },
  returns: v.null(),
  handler: async (ctx, { jobId, progress }) => {
    await ctx.db.patch(jobId, { progress: Math.min(0.95, progress), updatedAt: Date.now() });
    return null;
  },
});

const vFinding = v.object({
  kind: v.union(v.literal("trial_notice"), v.literal("recurring_charge"), v.literal("renewal_notice"), v.literal("receipt")),
  merchant: v.string(),
  amount: v.optional(v.number()),
  currency: v.optional(v.string()),
  cadence: v.optional(v.string()),
  nextRenewal: v.optional(v.number()),
  messageRef: v.string(),
  rfc822Id: v.optional(v.string()),
  snippet: v.string(),
  confidence: v.number(),
  occurredAt: v.optional(v.number()),
  clothing: v.boolean(),
});

/** Idempotent per message: re-scans update rows instead of double counting. */
export const recordScan = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), scanned: v.number(), findings: v.array(vFinding) },
  returns: v.null(),
  handler: async (ctx, { userId, jobId, scanned, findings }) => {
    const now = Date.now();
    let added = 0;
    let suggestions = 0;
    // The scan re-reads the whole 90-day window, so stored rows in it that no longer extract are stale.
    // shortcut: assumes the window holds at most SCAN_CAP matching emails; page the scan if users exceed it.
    const kept = new Set(findings.map((f) => f.messageRef));
    const since = now - 90 * 86_400_000;
    for (const row of await ctx.db.query("emailFindings").withIndex("by_user", (q) => q.eq("userId", userId)).take(1000)) {
      if ((row.occurredAt ?? 0) >= since && !kept.has(row.messageRef)) await ctx.db.delete(row._id);
    }
    for (const f of findings) {
      const { clothing, ...row } = f;
      const existing = await ctx.db.query("emailFindings").withIndex("by_user_message", (q) => q.eq("userId", userId).eq("messageRef", f.messageRef)).unique();
      if (existing) await ctx.db.patch(existing._id, row);
      else {
        await ctx.db.insert("emailFindings", { userId, ...row });
        added += 1;
      }
      if (f.kind === "recurring_charge" && f.amount !== undefined && f.cadence) {
        const dedupKey = `gmail:${f.merchant.toLowerCase()}:${f.cadence}`;
        const money = await ctx.db.query("moneyFindings").withIndex("by_user_dedup", (q) => q.eq("userId", userId).eq("dedupKey", dedupKey)).unique();
        const base = {
          merchant: f.merchant,
          amount: f.amount,
          currency: f.currency ?? "USD",
          cadence: f.cadence,
          annualized: annualizedOf(f.amount, f.cadence),
          nextRenewal: f.nextRenewal,
          confidence: f.confidence,
          sourceRef: `gmail:${f.messageRef}`,
          snippet: f.snippet,
          observedAt: f.occurredAt,
        };
        if (!money) {
          await ctx.db.insert("moneyFindings", { userId, ...base, state: "active", dedupKey, createdAt: now });
        } else if ((f.occurredAt ?? 0) > (money.observedAt ?? 0)) {
          // A newer charge than the one on file: keep the latest amount, record a change if it moved.
          const priceChanged = money.amount !== f.amount ? { from: money.amount, to: f.amount, detectedAt: now } : money.priceChanged;
          await ctx.db.patch(money._id, { ...base, priceChanged });
        }
      }
      if (clothing) {
        const seen = await ctx.db.query("garmentSuggestions").withIndex("by_user_message", (q) => q.eq("userId", userId).eq("messageRef", f.messageRef)).unique();
        if (!seen) {
          await ctx.db.insert("garmentSuggestions", {
            userId,
            merchant: f.merchant,
            title: f.snippet,
            price: f.amount,
            currency: f.currency,
            messageRef: f.messageRef,
            status: "pending",
            createdAt: now,
          });
          suggestions += 1;
        }
      }
    }
    await ctx.db.patch(jobId, {
      status: "done",
      progress: 1,
      steps: [{ key: "scan", label: `Read ${scanned} messages · ${added} new findings`, status: "done", finishedAt: now }],
      updatedAt: now,
      completedAt: now,
    });
    const conn = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", "gmail")).unique();
    if (conn) await ctx.db.patch(conn._id, { lastScanAt: now, lastError: undefined, updatedAt: now });
    if (suggestions > 0) {
      await notify(ctx, userId, {
        category: "closet",
        title: `${suggestions} clothing ${suggestions === 1 ? "purchase" : "purchases"} found in Gmail`,
        detail: "Add them to your wardrobe with a photo so cost-per-wear starts from the real price.",
        action: { label: "Review purchases", href: "/inbox#purchases" },
        urgency: "normal",
        dedupKey: `suggestions:${jobId}`,
      });
    }
    await audit(ctx, userId, "gmail_scan_completed", jobId, { scanned, added, suggestions });
    await syncSignals(ctx, userId);
    return null;
  },
});

export const failScan = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, jobId, error }) => {
    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "failed",
      error,
      steps: [{ key: "scan", label: "Scan failed", status: "failed", error, finishedAt: now }],
      updatedAt: now,
      completedAt: now,
    });
    const conn = await ctx.db.query("sourceConnections").withIndex("by_user_provider", (q) => q.eq("userId", userId).eq("provider", "gmail")).unique();
    if (conn) await ctx.db.patch(conn._id, { lastError: error, updatedAt: now });
    return null;
  },
});

// ---- Google Tasks (read-only, nothing stored) -------------------------------------------------

type TaskList = { items?: { id: string; title?: string }[] };
type Tasks = { items?: { id: string; title?: string; due?: string; status?: string; notes?: string }[] };

export const googleTasks = action({
  args: {},
  returns: v.array(v.object({ id: v.string(), title: v.string(), due: v.optional(v.string()), list: v.string() })),
  handler: async (ctx) => {
    const userId = await callerId(ctx);
    const token = await googleToken(ctx, userId, "google_tasks");
    const lists = await googleJson<TaskList>("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20", token);
    const out: { id: string; title: string; due?: string; list: string }[] = [];
    for (const list of lists.items ?? []) {
      const tasks = await googleJson<Tasks>(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=false&maxResults=50`,
        token,
      );
      for (const task of tasks.items ?? []) {
        if (task.status === "completed") continue;
        out.push({ id: task.id, title: (task.title ?? "Untitled").slice(0, 200), due: task.due, list: (list.title ?? "Tasks").slice(0, 80) });
      }
      if (out.length >= 100) break;
    }
    return out.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  },
});

// ---- Receipts → wardrobe ------------------------------------------------------------------------

export const suggestions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("garmentSuggestions")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "pending"))
      .order("desc")
      .take(20);
  },
});

export const dismissSuggestion = mutation({
  args: { suggestionId: v.id("garmentSuggestions") },
  returns: v.null(),
  handler: async (ctx, { suggestionId }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(suggestionId);
    if (!row || row.userId !== user._id) throw appError("NOT_FOUND", "That suggestion doesn't exist.");
    await ctx.db.patch(row._id, { status: "dismissed" });
    return null;
  },
});
