import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { SignalStateControls } from "./SignalStateControls";
import "./signal.css";

export const metadata: Metadata = {
  title: "Signal",
};

export default async function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const principal = await principalFromCookies();
  const { store, mode } = getStore();
  const signals = await store.listSignals(principal.userId);
  const signal = signals.find((s) => s.id === id);
  if (!signal) {
    notFound();
  }

  const evidence = signal.evidence as Array<{ label: string; detail: string }>;
  const domains = signal.domains as string[];
  const stateCopy =
    signal.state === "snoozed"
      ? "Snoozed — it will return when the snooze ends or evidence changes."
      : signal.state === "dismissed"
        ? "Dismissed — it stays in the audit trail but will not resurface."
        : signal.state === "paused"
          ? "Paused — derivations for this signal are on hold."
          : null;

  return (
    <main id="main" className="page page-narrow">
      <p className="signal-crumb">
        <Link href="/inbox">← Inbox</Link>
      </p>

      <article className="signal-detail">
        <header>
          <h1>{signal.title}</h1>
          <p className="signal-detected">
            Detected {new Date(signal.createdAt).toLocaleString()} · urgency:{" "}
            {signal.urgency} · state: {signal.state}
          </p>
        </header>

        {domains.includes("money") && domains.includes("wardrobe") ? (
          <p className="notice notice-accent" role="note">
            Cross-domain signal: both wardrobe and money evidence contributed.
            The connection is shown for review — Atlas does not claim causality.
          </p>
        ) : null}

        <section aria-labelledby="noticed-h" className="signal-section">
          <h2 id="noticed-h">What Atlas noticed</h2>
          <p>{signal.noticed}</p>
          <p className="signal-implication-line">{signal.implication}</p>
        </section>

        <section aria-labelledby="evidence-h" className="signal-section">
          <h2 id="evidence-h">Evidence</h2>
          <ul className="evidence-list">
            {evidence.map((item) => (
              <li key={item.label}>
                <strong>{item.label}:</strong> {item.detail}
              </li>
            ))}
          </ul>
          <p className="uncertainty-line">
            Uncertainty: {Math.round(signal.uncertainty * 100)}% — shown as the
            gap in the route, not as certainty.
          </p>
        </section>

        <section aria-labelledby="not-h" className="signal-section signal-not">
          <h2 id="not-h">What Atlas did not do</h2>
          <ul>
            <li>It did not contact any merchant, service, or mailbox.</li>
            <li>It did not cancel, pay, send, or modify anything.</li>
            <li>
              It can {signal.capability} — the next move is prepared, and you
              execute it.
            </li>
          </ul>
        </section>

        <section aria-labelledby="next-h" className="signal-section signal-next">
          <h2 id="next-h">Next move</h2>
          <p className="next-action-line">
            {signal.primaryAction.label} — Atlas prepares; you decide.
          </p>
          <SignalStateControls signalId={signal.id} state={signal.state} />
          {stateCopy ? (
            <p className="next-note" role="status" aria-live="polite">
              {stateCopy}
            </p>
          ) : (
            <p className="next-note">
              State changes are audited server-side and scoped to your session.
            </p>
          )}
        </section>

        {mode === "local_file" ? (
          <p className="next-note">Store mode: local file (this device).</p>
        ) : null}
      </article>
    </main>
  );
}
