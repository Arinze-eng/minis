import type { Metadata } from "next";
import Link from "next/link";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { syncSignalsAndNotifications } from "@/lib/server/seed";
import { Wallet } from "lucide-react";
import { annualizedAmount, type SubscriptionFinding } from "@/lib/audit";
import { FindingCard } from "./FindingCard";

export const metadata: Metadata = {
  title: "Money review",
};

export default async function MoneyPage() {
  const principal = await principalFromCookies();
  await syncSignalsAndNotifications(principal.userId);
  const { store } = getStore();
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
    <main id="main" className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-muted)] uppercase tracking-wider mb-1">
          <Wallet size={14} aria-hidden="true" />
          Money review · read-only evidence
        </p>
        <h1 className="text-2xl font-bold text-[var(--color-ink)] leading-tight">
          Money review
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)] max-w-prose">
          Recurring charges and price changes from read-only evidence. Atlas
          prepares the review — cancellation is always a manual,
          user-executed step at the merchant.
        </p>
      </div>

      {/* Summary card */}
      {findings.length > 0 ? (
        <section
          className="mb-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] p-6 flex flex-col sm:flex-row sm:items-start gap-6"
          aria-label="Annualized summary"
        >
          {/* Big stat */}
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-medium text-[var(--color-ink-muted)] uppercase tracking-wider">
              Annualized cost of active findings
            </span>
            <span className="text-4xl font-bold tabular-nums text-[var(--color-ink)] leading-none">
              {formatMoney(annualizedTotal, "USD")}
            </span>
            <span className="text-xs text-[var(--color-ink-muted)] mt-1">
              Annualized = amount × periods/year; unknown cadence is never annualized
            </span>
          </div>

          {/* Side stats */}
          <div className="flex flex-col gap-2 sm:items-end sm:text-right text-sm text-[var(--color-ink-muted)]">
            <p>
              <strong className="text-[var(--color-ink)]">{active.length}</strong>{" "}
              active finding{active.length === 1 ? "" : "s"}
            </p>
            {priceChanges.length > 0 ? (
              <p>
                <strong className="text-amber-600">{priceChanges.length}</strong>{" "}
                price change{priceChanges.length === 1 ? "" : "s"} detected
              </p>
            ) : null}
            {trials.length > 0 ? (
              <p>
                <strong className="text-orange-600">{trials.length}</strong> trial ending within days
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Finding list / empty state */}
      <section className="flex flex-col gap-4 mt-6" aria-label="Subscription findings">
        {findings.length === 0 ? (
          <div
            className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-[var(--color-line)] p-12 text-center"
            role="region"
            aria-label="No subscriptions tracked"
          >
            <div
              className="flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]"
              aria-hidden="true"
            >
              <Wallet size={36} />
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">
              No subscriptions tracked yet
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)] max-w-sm">
              Connect Gmail to start detecting recurring charges from your
              inbox — read-only, no messages altered.
            </p>
            <Link
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              href="/sources"
            >
              Connect a source
            </Link>
          </div>
        ) : (
          findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={{
                id: f.id,
                merchant: f.merchant,
                productName: f.productName ?? undefined,
                amount: Number(f.amount),
                currency: f.currency,
                cadence: f.cadence as SubscriptionFinding["cadence"],
                annualized:
                  f.annualized !== null
                    ? Number(f.annualized)
                    : annualizedAmount(
                        Number(f.amount),
                        f.cadence as SubscriptionFinding["cadence"],
                      ),
                nextRenewalDate: f.nextRenewal ?? undefined,
                trialEndDate: f.trialEnd ?? undefined,
                priceChangedAt: f.priceChanged ?? undefined,
                state: f.state as "active" | "kept" | "ignored" | "cancel_prepared",
                confidence: f.confidence,
                extractionVersion: f.extractionVersion,
                sources: f.sources as SubscriptionFinding["sources"],
              }}
            />
          ))
        )}
      </section>

      {/* Manual cancellation guide */}
      {findings.length > 0 ? (
        <details
          id="cancel-guide"
          className="mt-8 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden"
        >
          <summary className="flex items-center gap-2 px-5 py-4 cursor-pointer text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-raised)] transition-colors select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="flex-1">Manual cancellation guide</span>
            <span className="text-[var(--color-ink-muted)] text-xs">▸</span>
          </summary>
          <div className="px-5 pb-5 pt-1 flex flex-col gap-3 text-sm text-[var(--color-ink-muted)] border-t border-[var(--color-line)]">
            <p>
              Atlas never cancels anything for you and never contacts a
              merchant. The guide links only to the merchant&rsquo;s own
              portal, opened by you, in a new tab.
            </p>
            <ol className="flex flex-col gap-2 pl-5 list-decimal marker:text-[var(--color-ink-muted)]">
              <li>
                Open the merchant&rsquo;s billing portal yourself (external
                site — Atlas has no account access).
              </li>
              <li>Find the subscription or membership in billing settings.</li>
              <li>
                Choose cancel; note any confirmation the merchant shows you.
              </li>
              <li>
                Return here and mark the finding reviewed once the next cycle
                confirms it.
              </li>
            </ol>
            <p className="text-xs bg-[var(--color-surface-raised)] rounded-lg px-3 py-2 border border-[var(--color-line)]">
              No emails were sent, deleted, or altered by Atlas in this
              process — and nothing was purchased or mutated anywhere.
            </p>
          </div>
        </details>
      ) : null}
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
