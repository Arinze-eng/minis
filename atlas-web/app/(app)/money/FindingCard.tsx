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
      className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 shadow-[var(--shadow-card)]"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: busy || pending ? 0.6 : 1, y: 0 }}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={atlasSpring(reduced)}
    >
      {/* Header: merchant name + status badges */}
      <header className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-[var(--color-ink)] flex-1 leading-snug">
          {finding.merchant}
          {finding.productName ? (
            <span className="ml-1.5 text-sm font-normal text-[var(--color-ink-muted)]">
              {finding.productName}
            </span>
          ) : null}
        </h2>

        {/* State badge (kept / ignored / cancel_prepared) */}
        {finding.state !== "active" ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] border border-[var(--color-line)]">
            {finding.state.replace("_", " ")}
          </span>
        ) : null}

        {/* Price changed badge */}
        {finding.priceChangedAt ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            price changed
          </span>
        ) : null}

        {/* Trial ending badge */}
        {finding.trialEndDate ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
            trial ends {new Date(finding.trialEndDate).toLocaleDateString()}
          </span>
        ) : null}

        {/* Next renewal badge */}
        {finding.nextRenewalDate ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            renews {new Date(finding.nextRenewalDate).toLocaleDateString()}
          </span>
        ) : null}
      </header>

      {/* Amounts */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <span className="text-2xl font-bold tabular-nums text-[var(--color-ink)] leading-none">
          {fmt(finding.amount)}
          <span className="ml-1 text-sm font-normal text-[var(--color-ink-muted)]">
            / {finding.cadence === "unknown" ? "cycle unclear" : finding.cadence}
          </span>
        </span>
        <span className="text-sm text-[var(--color-ink-muted)]">
          {finding.annualized !== undefined
            ? `${fmt(finding.annualized)} / year`
            : "not annualized — cadence unclear"}
        </span>
        <span className="text-xs text-[var(--color-ink-muted)]">
          confidence {Math.round(finding.confidence * 100)}%
        </span>
      </div>

      {/* Evidence drawer */}
      <details className="mb-4 rounded-xl border border-[var(--color-line)] overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] transition-colors select-none list-none [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Evidence ({finding.sources.length})</span>
          <span className="text-xs">▸</span>
        </summary>
        <div className="border-t border-[var(--color-line)] px-4 py-3 bg-[var(--color-surface-raised)]">
          <ul className="flex flex-col gap-3">
            {finding.sources.map((s) => (
              <li key={s.reference} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.68rem] font-semibold uppercase tracking-wide bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink-muted)]">
                    {s.kind}
                  </span>
                  <span className="text-xs text-[var(--color-ink-muted)] font-mono truncate">
                    {s.reference}
                  </span>
                  {s.receivedAt ? (
                    <span className="ml-auto shrink-0 text-xs text-[var(--color-ink-muted)]">
                      {new Date(s.receivedAt).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                {s.snippet ? (
                  <p className="text-xs text-[var(--color-ink-muted)] pl-1 italic line-clamp-2">
                    {s.snippet}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.72rem] text-[var(--color-ink-muted)]">
            Snippets are bounded and redacted; full message bodies are never
            stored. Extraction version {finding.extractionVersion}.
          </p>
        </div>
      </details>

      {/* Action row */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-4 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={busy || pending || finding.state !== "active"}
          onClick={() => void setState("kept")}
        >
          Keep
        </button>
        <button
          type="button"
          className="px-4 py-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={busy || pending || finding.state !== "active"}
          onClick={() => void setState("ignored")}
        >
          Ignore
        </button>
        <a
          className="px-4 py-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          href="#cancel-guide"
        >
          Manual cancel guide
        </a>
      </div>
    </motion.article>
  );
}
