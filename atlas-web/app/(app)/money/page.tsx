import type { Metadata } from "next";
import { demoMoney } from "@/lib/demo/audit";
import { summarizeMoney } from "@/lib/audit";
import { formatMoney } from "@/lib/format";
import "./money.css";

export const metadata: Metadata = {
  title: "Money review",
};

export default function MoneyPage() {
  const summary = demoMoney();
  const { annualizedTotal } = summarizeMoney(summary.findings);
  const active = summary.findings.filter((f) => f.state === "active");
  const priceChanges = summary.findings.filter((f) => f.priceChangedAt);
  const trials = summary.findings.filter((f) => f.trialEndDate);

  return (
    <main id="main" className="money-page">
      <h1>Money review</h1>
      <p className="money-sub">
        Recurring charges and price changes from read-only evidence. Atlas
        prepares the review — cancellation is always a manual, user-executed
        step at the merchant.
      </p>
      <p className="demo-note" role="note">
        {summary.demoLabel}
      </p>

      <section className="money-summary" aria-label="Annualized summary">
        <div className="summary-big">
          <span className="summary-label">Annualized cost of active findings</span>
          <span className="summary-value">
            {formatMoney(annualizedTotal, summary.currency)}
          </span>
          <span className="summary-assumption">{summary.cadenceAssumption}</span>
        </div>
        <div className="summary-side">
          <p>
            <strong>{active.length}</strong> active finding
            {active.length === 1 ? "" : "s"}
          </p>
          {priceChanges.length > 0 ? (
            <p>
              <strong>{priceChanges.length}</strong> price change
              {priceChanges.length === 1 ? "" : "s"} this cycle
            </p>
          ) : null}
          {trials.length > 0 ? (
            <p>
              <strong>{trials.length}</strong> trial ending within days
            </p>
          ) : null}
          <p className="summary-refresh">
            Refreshed {new Date(summary.refreshedAt).toLocaleString()}
          </p>
        </div>
      </section>

      <section className="finding-list" aria-label="Subscription findings">
        {summary.findings.map((f) => (
          <article key={f.id} className="finding-card">
            <header className="finding-head">
              <h2>{f.merchant}</h2>
              {f.priceChangedAt ? (
                <span className="finding-flag flag-change">price changed</span>
              ) : null}
              {f.trialEndDate ? (
                <span className="finding-flag flag-trial">
                  trial ends {new Date(f.trialEndDate).toLocaleDateString()}
                </span>
              ) : null}
              {f.nextRenewalDate ? (
                <span className="finding-flag flag-renewal">
                  renews {new Date(f.nextRenewalDate).toLocaleDateString()}
                </span>
              ) : null}
            </header>

            <div className="finding-numbers">
              <span className="finding-amount">
                {formatMoney(f.amount, f.currency)}
                <span className="finding-cadence">
                  / {f.cadence === "unknown" ? "cycle unclear" : f.cadence}
                </span>
              </span>
              <span className="finding-annual">
                {f.annualized !== undefined
                  ? `${formatMoney(f.annualized, f.currency)} / year`
                  : "not annualized — cadence unclear"}
              </span>
              <span className="finding-confidence" title="Extraction confidence">
                confidence {Math.round(f.confidence * 100)}%
              </span>
            </div>

            <details className="evidence-drawer">
              <summary>Evidence ({f.sources.length})</summary>
              <ul>
                {f.sources.map((s) => (
                  <li key={s.reference}>
                    <span className="evidence-kind">{s.kind}</span>
                    <span className="evidence-ref">{s.reference}</span>
                    {s.snippet ? <span className="evidence-snippet">{s.snippet}</span> : null}
                    {s.receivedAt ? (
                      <span className="evidence-date">
                        {new Date(s.receivedAt).toLocaleDateString()}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="evidence-note">
                Snippets are bounded and redacted; full message bodies are never
                stored. Extraction version {f.extractionVersion}.
              </p>
            </details>

            <div className="finding-actions">
              <button type="button" className="btn-primary" disabled title="Demo mode — state changes are illustrative">
                Keep
              </button>
              <button type="button" className="btn-secondary" disabled title="Demo mode — state changes are illustrative">
                Ignore
              </button>
              <a
                className="btn-secondary finding-cancel-link"
                href="#cancel-guide"
                title="Demo mode — guide is illustrative"
              >
                Manual cancel guide
              </a>
            </div>
          </article>
        ))}
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
