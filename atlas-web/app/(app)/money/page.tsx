"use client";

import { useMutation, useQuery } from "convex/react";
import { ExternalLink, Mail, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { Empty, JobProgress, PageHead, PageLoading, relativeTime, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatMoney } from "@/lib/format";

const STATE_LABEL: Record<string, string> = { kept: "Keeping", ignored: "Ignored", cancel_prepared: "Cancelling" };

function Finding({ f }: { f: Doc<"moneyFindings"> }) {
  const setState = useMutation(api.money.setState);
  const { run, busy } = useRun();
  const set = (state: Doc<"moneyFindings">["state"], note: string) => run(() => setState({ findingId: f._id, state }), note);
  return (
    <div className={`list-row items-start ${f.state === "ignored" ? "opacity-60" : ""}`}>
      <div className="list-main stack-sm !gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="list-title">{f.productName ?? f.merchant}</span>
          {f.state !== "active" && <span className="badge">{STATE_LABEL[f.state]}</span>}
          {f.priceChanged && (
            <span className="badge badge-alert">
              <TrendingUp size={11} aria-hidden="true" /> {formatMoney(f.priceChanged.from, f.currency)} → {formatMoney(f.priceChanged.to, f.currency)}
            </span>
          )}
        </div>
        <div className="list-sub">
          {formatMoney(f.amount, f.currency)} {f.cadence !== "unknown" ? `/ ${f.cadence.replace("ly", "")}` : ""}
          {f.annualized ? ` · ${formatMoney(f.annualized, f.currency)} a year` : ""}
          {f.nextRenewal ? ` · renews ${relativeTime(f.nextRenewal)}` : ""}
          {f.trialEnd ? ` · trial ends ${relativeTime(f.trialEnd)}` : ""}
        </div>
        {f.snippet && <p className="list-sub italic">“{f.snippet}”</p>}
        <div className="flex gap-1.5 flex-wrap">
          {f.state !== "kept" && (
            <button type="button" className="btn-secondary !min-h-8" disabled={busy} onClick={() => set("kept", "Keeping it")}>
              Keep
            </button>
          )}
          {f.state !== "cancel_prepared" && (
            <button type="button" className="btn !min-h-8" disabled={busy} onClick={() => set("cancel_prepared", "Marked to cancel — do it on the merchant's site")}>
              Plan to cancel
            </button>
          )}
          {f.state !== "ignored" && (
            <button type="button" className="btn-ghost !min-h-8" disabled={busy} onClick={() => set("ignored", "Ignored")}>
              Not a subscription
            </button>
          )}
          {f.state !== "active" && (
            <button type="button" className="btn-ghost !min-h-8" disabled={busy} onClick={() => set("active", "Moved back to review")}>
              Undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { trial_notice: "Trial", recurring_charge: "Charge", renewal_notice: "Renewal", receipt: "Receipt" };

/** Opens the exact message in the signed-in account; rows scanned before Message-ID was kept fall back to Gmail's id. */
function gmailUrl(e: Doc<"emailFindings">, account?: string): string {
  const base = `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : "u/0/"}`;
  return e.rfc822Id ? `${base}#search/rfc822msgid%3A${encodeURIComponent(e.rfc822Id)}` : `${base}#all/${e.messageRef}`;
}

export default function MoneyPage() {
  const data = useQuery(api.money.findings);
  const status = useQuery(api.sources.status);
  const me = useQuery(api.users.me);
  const scan = useMutation(api.sources.scanGmail);
  const { run, busy } = useRun();
  if (data === undefined || status === undefined) return <PageLoading />;
  const { findings, annualTotal, upcoming, emails } = data;
  const review = findings.filter((f) => f.state === "active");
  const settled = findings.filter((f) => f.state !== "active");
  const gmail = status.connections.find((c) => c.provider === "gmail" && c.status === "connected");
  const scanning = status.latestScan?.status === "running";
  const scanButton = (
    <button type="button" className="btn-primary" disabled={busy || scanning} onClick={() => run(() => scan({}), "Scanning the last 3 months")}>
      <RefreshCw size={16} className={scanning ? "spin" : undefined} aria-hidden="true" /> {scanning ? "Scanning…" : "Scan Gmail"}
    </button>
  );

  return (
    <div className="page page-narrow">
      <PageHead
        eyebrow="Money"
        title="Subscriptions, watched."
        sub="Subscriptions and price changes found in your receipts. Atlas never cancels or pays anything — you stay in charge."
        actions={gmail && (findings.length > 0 || emails.length > 0) ? scanButton : undefined}
      />
      {gmail && (
        <p className="list-sub section">
          Gmail connected · {gmail.lastScanAt ? `last scanned ${relativeTime(gmail.lastScanAt)}` : "not scanned yet"}
        </p>
      )}
      {scanning && <JobProgress job={status.latestScan!} />}
      {status.latestScan?.status === "failed" && <p className="notice notice-warn">{status.latestScan.error ?? "The last scan failed."}</p>}
      {findings.length === 0 && emails.length === 0 ? (
        gmail ? (
          <Empty icon={Wallet} title="Nothing scanned yet" body="Atlas reads subject lines and senders from the last 3 months (read-only) to find subscriptions, trials and renewals.">
            {scanButton}
          </Empty>
        ) : (
          <Empty icon={Wallet} title="No subscriptions found yet" body="Connect Gmail and Atlas reads receipt headers (read-only) to find renewals, trials and price rises.">
            <Link href="/sources" className="btn-primary">
              <Mail size={16} aria-hidden="true" /> Connect Gmail
            </Link>
          </Empty>
        )
      ) : (
        <>
          <div className="stat-grid section">
            <div className="stat">
              <span className="stat-label">Per year</span>
              <span className="stat-value">{formatMoney(annualTotal, findings[0]?.currency ?? "USD")}</span>
              <span className="stat-note">Everything not ignored</span>
            </div>
            <div className="stat">
              <span className="stat-label">To decide</span>
              <span className="stat-value">{review.length}</span>
              <span className="stat-note">Subscriptions to keep or cancel</span>
            </div>
          </div>

          {upcoming.length > 0 && (
            <section className="section">
              <h2 className="section-title">Renewing soon</h2>
              <div className="list-card">
                {upcoming.map((f) => (
                  <div key={f._id} className="list-row">
                    <div className="list-main">
                      <div className="list-title">{f.productName ?? f.merchant}</div>
                      <div className="list-sub">{f.nextRenewal ? relativeTime(f.nextRenewal) : ""}</div>
                    </div>
                    <span className="font-semibold tabular-nums">{formatMoney(f.amount, f.currency)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {review.length > 0 && (
            <section className="section">
              <h2 className="section-title">Review</h2>
              <div className="list-card">
                {review.map((f) => (
                  <Finding key={f._id} f={f} />
                ))}
              </div>
            </section>
          )}

          {emails.length > 0 && (
            <section className="section">
              <h2 className="section-title">From your inbox · last 3 months</h2>
              <div className="list-card">
                {emails.map((e) => (
                  <a key={e._id} href={gmailUrl(e, me?.email)} target="_blank" rel="noopener noreferrer" className="list-row">
                    <div className="list-main">
                      <div className="list-title">{e.snippet ?? e.merchant}</div>
                      <div className="list-sub">
                        {e.merchant}
                        {e.amount !== undefined ? ` · ${formatMoney(e.amount, e.currency ?? "USD")}` : ""}
                        {e.occurredAt ? ` · ${relativeTime(e.occurredAt)}` : ""}
                      </div>
                    </div>
                    <span className="badge">{KIND_LABEL[e.kind] ?? e.kind}</span>
                    <ExternalLink size={16} className="grouped-chevron" aria-label="Opens in Gmail" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {settled.length > 0 && (
            <section className="section">
              <h2 className="section-title">Decided</h2>
              <div className="list-card">
                {settled.map((f) => (
                  <Finding key={f._id} f={f} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
