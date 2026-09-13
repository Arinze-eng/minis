import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { demoInbox } from "@/app/inbox/demoData";
import type { SignalCard } from "@/lib/atlas";
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
  const payload = demoInbox();
  const card = payload.cards.find((c) => c.id === id);
  if (!card) {
    notFound();
  }
  return <SignalDetail card={card} demoLabel={payload.demoLabel ?? ""} />;
}

function SignalDetail({ card, demoLabel }: { card: SignalCard; demoLabel: string }) {
  return (
    <main id="main" className="signal-page">
      <p className="signal-crumb">
        <Link href="/inbox">← Inbox</Link>
      </p>
      <p className="signal-demo-note" role="note">
        {demoLabel}
      </p>

      <article className="signal-detail">
        <header>
          <h1>{card.title}</h1>
          <p className="signal-detected">
            Detected {new Date(card.createdAt).toLocaleString()} · urgency:{" "}
            {card.urgency}
          </p>
        </header>

        <section aria-labelledby="noticed-h" className="signal-section">
          <h2 id="noticed-h">What Atlas noticed</h2>
          <p>{card.noticed}</p>
          <p className="signal-implication-line">{card.implication}</p>
        </section>

        <section aria-labelledby="evidence-h" className="signal-section">
          <h2 id="evidence-h">Evidence</h2>
          <ul className="evidence-list">
            {card.sources.map((source) => (
              <li key={source.name} className="evidence-source">
                <span className="evidence-source-name">{source.name}</span>
                <span className="evidence-source-fresh">
                  {source.freshness} · retrieved{" "}
                  {new Date(source.retrievedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <ul className="evidence-list">
            {card.evidence.map((item) => (
              <li key={item.label}>
                <strong>{item.label}:</strong> {item.detail}
              </li>
            ))}
          </ul>
          <p className="uncertainty-line">
            Uncertainty: {Math.round(card.uncertainty * 100)}% — shown as the gap
            in the route, not as certainty.
          </p>
        </section>

        <section aria-labelledby="why-h" className="signal-section" id="why">
          <h2 id="why-h">Why it matters now</h2>
          <p>
            Urgency comes from dates and freshness in the evidence above — not
            from an alarm level Atlas invented.
          </p>
        </section>

        <section aria-labelledby="not-h" className="signal-section signal-not">
          <h2 id="not-h">What Atlas did not do</h2>
          <ul>
            <li>It did not contact any merchant, service, or mailbox.</li>
            <li>It did not cancel, pay, send, or modify anything.</li>
            <li>
              It can {card.capability} — the next move is prepared, and you
              execute it.
            </li>
          </ul>
        </section>

        <section aria-labelledby="next-h" className="signal-section signal-next">
          <h2 id="next-h">Next move</h2>
          <p className="next-action-line">
            {card.primaryAction.label}
            {card.capability === "prepare"
              ? " — Atlas prepares a checklist; you decide."
              : " — Atlas advises; nothing is prepared for execution."}
          </p>
          <div className="next-controls">
            <button type="button" className="btn-primary" disabled title="Demo mode — state changes are illustrative">
              Mark reviewed (demo)
            </button>
            <button type="button" className="btn-secondary" disabled title="Demo mode — state changes are illustrative">
              Snooze
            </button>
            <button type="button" className="btn-secondary" disabled title="Demo mode — state changes are illustrative">
              Dismiss
            </button>
            <button type="button" className="btn-secondary" disabled title="Demo mode — state changes are illustrative">
              Correct
            </button>
          </div>
          <p className="next-note">
            Controls are illustrative in demo mode; live state changes require a
            connected, consented source.
          </p>
        </section>
      </article>
    </main>
  );
}
