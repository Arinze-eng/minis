import type { Metadata } from "next";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { syncSignalsAndNotifications } from "@/lib/server/seed";
import { Wallet } from "lucide-react";
import { annualizedAmount, type SubscriptionFinding } from "@/lib/audit";
import { FindingCard } from "./FindingCard";
import "./money.css";

export const metadata: Metadata = {
  title: "Money review",
};

export default async function MoneyPage() {
  const principal = await principalFromCookies();
  await syncSignalsAndNotifications(principal.userId);
  const { store, mode } = getStore();
  const findings = await store.listFindings(principal.userId);
  const annualizedTotal = findings.reduce(
    (sum, f) =>
      sum + (f.state !== "ignored" && f.annualized !== null ? Number(f.annualized) : 0),
    0,
  );
  const active = findings.filter((f) => f.state === "active");
  const priceChanges = findings.filter((f) => f.priceChanged);
  const trials = findings.filter((f) => f.trialEnd);

  return (
    <main id="main" className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Wallet size={14} aria-hidden="true" />
            Money review · read-only evidence
          </p>
          <h1>Money review</h1>
          <p className="page-sub">
            Recurring charges and price changes from read-only evidence. Atlas
            prepares the review — cancellation is always a manual,
            user-executed step at the merchant.
          </p>
        </div>
      </div>
      {mode === "local_file" ? (
        <p className="demo-note" role="note">
          Local store with labelled synthetic merchants (sandbox fixtures). No
          mailbox or bank is contacted. Set DATABASE_URL for the shared store.
        </p>
      ) : null}

      <section className="money-summary" aria-label="Annualized summary">
        <div className="summary-big">
          <span className="summary-label">Annualized cost of active findings</span>
          <span className="summary-value">
            {formatMoney(annualizedTotal, "USD")}
          </span>
          <span className="summary-assumption">
            Annualized = amount × periods/year; unknown cadence is never
            annualized
          </span>
        </div>
        <div className="summary-side">
          <p><strong>{active.length}</strong> active finding{active.length === 1 ? "" : "s"}</p>
          {priceChanges.length > 0 ? (
            <p><strong>{priceChanges.length}</strong> price change{priceChanges.length === 1 ? "" : "s"} detected</p>
          ) : null}
          {trials.length > 0 ? (
            <p><strong>{trials.length}</strong> trial ending within days</p>
          ) : null}
        </div>
      </section>

      <section className="finding-list" aria-label="Subscription findings">
        {findings.map((f) => (
          <FindingCard
            key={f.id}
            finding={{
              id: f.id,
              merchant: f.merchant,
              productName: f.productName ?? undefined,
              amount: Number(f.amount),
              currency: f.currency,
              cadence: f.cadence as SubscriptionFinding["cadence"],
              annualized: f.annualized !== null ? Number(f.annualized) : annualizedAmount(Number(f.amount), f.cadence as SubscriptionFinding["cadence"]),
              nextRenewalDate: f.nextRenewal ?? undefined,
              trialEndDate: f.trialEnd ?? undefined,
              priceChangedAt: f.priceChanged ?? undefined,
              state: f.state as "active" | "kept" | "ignored" | "cancel_prepared",
              confidence: f.confidence,
              extractionVersion: f.extractionVersion,
              sources: f.sources as SubscriptionFinding["sources"],
            }}
          />
        ))}
        {findings.length === 0 ? (
          <p className="evidence-note">No findings yet — run a scan from Sources (demo) or connect a read-only source.</p>
        ) : null}
      </section>

      <section id="cancel-guide" className="cancel-guide" aria-labelledby="cancel-h">
        <h2 id="cancel-h">Manual cancellation guide</h2>
        <p>
          Atlas never cancels anything for you and never contacts a merchant.
          The guide links only to the merchant&rsquo;s own portal, opened by
          you, in a new tab.
        </p>
        <ol className="cancel-steps">
          <li>Open the merchant&rsquo;s billing portal yourself (external site — Atlas has no account access).</li>
          <li>Find the subscription or membership in billing settings.</li>
          <li>Choose cancel; note any confirmation the merchant shows you.</li>
          <li>Return here and mark the finding reviewed once the next cycle confirms it.</li>
        </ol>
        <p className="cancel-note">
          No emails were sent, deleted, or altered by Atlas in this process —
          and nothing was purchased or mutated anywhere.
        </p>
      </section>
    </main>
  );
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
