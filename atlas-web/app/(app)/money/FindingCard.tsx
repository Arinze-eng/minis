"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { SubscriptionFinding } from "@/lib/audit";
import { atlasSpring, useMotionPrefs } from "@/lib/motion";

/**
 * One subscription finding with its evidence drawer and state actions.
 * Keep/Ignore PATCH /api/money (owner-scoped server-side) then refresh the
 * server component so totals recompute from the store.
 */
export function FindingCard({ finding }: { finding: SubscriptionFinding }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const reduced = useMotionPrefs();

  const setState = async (state: "kept" | "ignored") => {
    setBusy(true);
    try {
      const res = await fetch("/api/money", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: finding.id, state }),
      });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: finding.currency,
      maximumFractionDigits: v % 1 === 0 ? 0 : 2,
    }).format(v);

  return (
    <motion.article
      className="finding-card"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: busy || pending ? 0.6 : 1, y: 0 }}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={atlasSpring(reduced)}
    >
      <header className="finding-head">
        <h2>{finding.merchant}</h2>
        {finding.state !== "active" ? (
          <span className="finding-flag flag-renewal">{finding.state.replace("_", " ")}</span>
        ) : null}
        {finding.priceChangedAt ? (
          <span className="finding-flag flag-change">price changed</span>
        ) : null}
        {finding.trialEndDate ? (
          <span className="finding-flag flag-trial">
            trial ends {new Date(finding.trialEndDate).toLocaleDateString()}
          </span>
        ) : null}
        {finding.nextRenewalDate ? (
          <span className="finding-flag flag-renewal">
            renews {new Date(finding.nextRenewalDate).toLocaleDateString()}
          </span>
        ) : null}
      </header>

      <div className="finding-numbers">
        <span className="finding-amount">
          {fmt(finding.amount)}
          <span className="finding-cadence">
            {" "}/ {finding.cadence === "unknown" ? "cycle unclear" : finding.cadence}
          </span>
        </span>
        <span className="finding-annual">
          {finding.annualized !== undefined
            ? `${fmt(finding.annualized)} / year`
            : "not annualized — cadence unclear"}
        </span>
        <span className="finding-confidence">
          confidence {Math.round(finding.confidence * 100)}%
        </span>
      </div>

      <details className="evidence-drawer">
        <summary>Evidence ({finding.sources.length})</summary>
        <ul>
          {finding.sources.map((s) => (
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
          stored. Extraction version {finding.extractionVersion}.
        </p>
      </details>

      <div className="finding-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || pending || finding.state !== "active"}
          onClick={() => void setState("kept")}
        >
          Keep
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || pending || finding.state !== "active"}
          onClick={() => void setState("ignored")}
        >
          Ignore
        </button>
        <a className="btn-secondary finding-cancel-link" href="#cancel-guide">
          Manual cancel guide
        </a>
      </div>
    </motion.article>
  );
}
