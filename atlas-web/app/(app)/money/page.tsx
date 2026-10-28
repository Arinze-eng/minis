"use client";

import { useMutation, useQuery } from "convex/react";
import { Mail, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { Empty, PageHead, PageLoading, relativeTime, useRun } from "@/components/ui";
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

export default function MoneyPage() {
  const data = useQuery(api.money.findings);
  if (data === undefined) return <PageLoading />;
  const { findings, annualTotal, upcoming } = data;
  const review = findings.filter((f) => f.state === "active");
  const settled = findings.filter((f) => f.state !== "active");

  return (
    <div className="page page-narrow">
      <PageHead eyebrow="Money" title="Subscriptions, watched." sub="Subscriptions and price changes found in your receipts. Atlas never cancels or pays anything — you stay in charge." />
      {findings.length === 0 ? (
        <Empty icon={Wallet} title="No subscriptions found yet" body="Connect Gmail and Atlas reads receipt headers (read-only) to find renewals, trials and price rises.">
          <Link href="/sources" className="btn-primary">
            <Mail size={16} aria-hidden="true" /> Connect Gmail
          </Link>
        </Empty>
      ) : (
        <>
          <div className="stat-grid section">
            <div className="stat">
              <span className="stat-label">Per year</span>
              <span className="stat-value">{formatMoney(annualTotal, findings[0]?.currency ?? "USD")}</span>
              <span className="stat-note">Everything not ignored</span>
            </div>
            <div className="stat">
              <span className="stat-label">To review</span>
              <span className="stat-value">{review.length}</span>
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
