import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import {
  getMessageMetadata,
  gmailConfigured,
  listMessageIds,
  validAccessToken,
} from "@/lib/server/gmail";
import { tokenEncryptionConfigured } from "@/lib/server/secretBox";
import {
  EXTRACTION_VERSION,
  annualize,
  extractFinding,
} from "@/lib/server/emailExtraction";
import { syncSignalsAndNotifications } from "@/lib/server/seed";

/**
 * The bounded, consent-gated, real Gmail scan. Runs only for a connected
 * principal with a decryptable refresh token. Metadata reads only — bodies are
 * never requested. Extraction is deterministic and versioned; repeat scans are
 * idempotent via the (principal, message_ref, kind, merchant) unique index, so
 * annualized totals never double-count.
 *
 * Scan-trigger idempotency: a running job for the same principal short-circuits
 * (409) instead of stacking concurrent API walks.
 */
export async function POST() {
  const principal = await requirePrincipal();
  const { store } = getStore();

  if (!gmailConfigured()) {
    return NextResponse.json({ error: "gmail_not_configured" }, { status: 503 });
  }
  if (!tokenEncryptionConfigured()) {
    return NextResponse.json({ error: "encryption_not_configured" }, { status: 503 });
  }

  const connection = await store.getSourceConnection(principal.userId, "gmail");
  if (!connection || connection.status !== "connected" || !connection.encryptedRefreshToken) {
    return NextResponse.json({ error: "gmail_not_connected" }, { status: 409 });
  }

  const running = await store.latestScanJob(principal.userId, "gmail");
  if (running && running.status === "running") {
    return NextResponse.json({ error: "scan_already_running", job: running }, { status: 409 });
  }

  // Bounded work: at most 250 metadata reads per scan.
  const cap = 250;
  let pageToken: string | undefined;
  let discovered = 0;
  let processed = 0;
  let skipped = 0;
  let deduplicated = 0;
  let failed = 0;

  const job = await store.recordScanJob(principal.userId, {
    id: `scan_${crypto.randomUUID()}`,
    provider: "gmail",
    status: "running",
    discovered: 0,
    processed: 0,
    skipped: 0,
    deduplicated: 0,
    failed: 0,
    error: null,
    finishedAt: null,
  });

  try {
    let accessToken: string;
    try {
      accessToken = await validAccessToken(connection.encryptedRefreshToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "token_error";
      // Decrypt/refresh failure ⇒ connection unusable: mark it error rather
      // than silently retrying with different credentials.
      await store.upsertSourceConnection(principal.userId, "gmail", {
        status: "error",
        lastError: msg.slice(0, 200),
      });
      await store.audit(principal.userId, "gmail_scan_token_error", null, {
        error: msg.slice(0, 120),
      });
      return NextResponse.json({ error: "token_invalid", job }, { status: 409 });
    }

    while (discovered < cap) {
      const page = await listMessageIds({ accessToken, maxResults: 50, pageToken });
      discovered += page.ids.length;
      if (page.ids.length === 0) break;

      for (const id of page.ids) {
        if (processed + skipped + deduplicated + failed >= cap) break;
        try {
          const meta = await getMessageMetadata(id, accessToken);
          if (!meta) {
            skipped += 1;
            continue;
          }
          const finding = extractFinding({
            messageId: meta.id,
            headers: meta.headers,
            occurredAt: meta.date,
          });
          if (!finding) {
            skipped += 1;
            continue;
          }
          const { row, deduplicated: wasDup } = await store.upsertEmailFinding(
            principal.userId,
            finding,
          );
          if (wasDup) deduplicated += 1;
          else processed += 1;

          // Promotion: a recurring-charge email finding becomes a Money Guard
          // finding with a deterministic dedup key, so signals derive from the
          // same store as the rest of Money Guard.
          if (row.kind === "recurring_charge" && typeof row.amount === "number") {
            const annualized = annualize(row.amount, row.cadence ?? "");
            await store.upsertFinding(principal.userId, {
              id: `money_${row.id}`,
              principalId: row.principalId,
              merchant: row.merchant,
              productName: row.productName,
              amount: row.amount,
              currency: row.currency ?? "USD",
              cadence: row.cadence ?? "monthly",
              annualized: annualized ?? null,
              nextRenewal: row.nextRenewal,
              trialEnd: null,
              priceChanged: null,
              state: "active",
              confidence: row.confidence,
              extractionVersion: EXTRACTION_VERSION,
              sources: [
                {
                  type: "gmail_message",
                  ref: row.messageRef,
                  snippet: row.snippet,
                  retrievedAt: new Date().toISOString(),
                  redacted: true,
                },
              ],
              dedupKey: `gmail:${row.messageRef}:${row.kind}`,
            });
          }
        } catch {
          failed += 1; // per-message failure never aborts the bounded scan
        }
      }

      if (!page.pageToken) break;
      pageToken = page.pageToken;
    }

    const completed = await store.recordScanJob(principal.userId, {
      id: `scan_${crypto.randomUUID()}`,
      provider: "gmail",
      status: "completed",
      discovered,
      processed,
      skipped,
      deduplicated,
      failed,
      error: null,
      finishedAt: null,
    });
    await store.audit(principal.userId, "gmail_scan_completed", null, {
      discovered,
      processed,
      skipped,
      deduplicated,
      failed,
    });
    await syncSignalsAndNotifications(principal.userId);

    return NextResponse.json({
      ok: true,
      job: completed,
      counts: { discovered, processed, skipped, deduplicated, failed },
    });
  } catch (e) {
    const fatal = e instanceof Error ? e.message : "scan_failed";
    const failedJob = await store.recordScanJob(principal.userId, {
      id: `scan_${crypto.randomUUID()}`,
      provider: "gmail",
      status: "failed",
      discovered,
      processed,
      skipped,
      deduplicated,
      failed,
      error: fatal.slice(0, 200),
      finishedAt: null,
    });
    await store.audit(principal.userId, "gmail_scan_failed", null, {
      error: fatal.slice(0, 120),
    });
    return NextResponse.json({ error: "scan_failed", job: failedJob }, { status: 500 });
  }
}
