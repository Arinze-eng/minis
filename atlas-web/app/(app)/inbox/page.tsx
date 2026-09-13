import type { Metadata } from "next";
import Link from "next/link";
import { demoInbox } from "@/lib/demo/inbox";
import type { SignalCard } from "@/lib/atlas";
import { CommandStrip } from "./CommandStrip";
import { MorningBriefing } from "./MorningBriefing";
import "./inbox.css";

export const metadata: Metadata = {
  title: "Inbox",
};

function UrgencyDot({ urgency }: { urgency: SignalCard["urgency"] }) {
  const className =
    urgency === "urgent"
      ? "urgency-dot urgency-urgent"
      : urgency === "review"
        ? "urgency-dot urgency-review"
        : "urgency-dot";
  return <span className={className} aria-hidden="true" />;
}

function Waypoints({ card }: { card: SignalCard }) {
  const n = card.sources.length;
  return (
    <ol className="waypoints" aria-label="Evidence sources">
      {card.sources.map((source, i) => (
        <li
          key={source.name}
          className={`waypoint ${source.freshness !== "fresh" ? "waypoint-stale" : ""} ${
            i === n - 1 ? "waypoint-destination" : ""
          }`}
          title={`${source.name} · ${source.freshness} · ${source.retrievedAt}`}
        >
          <span className="visually-hidden">
            {source.name}, {source.freshness}
          </span>
        </li>
      ))}
      <li className="waypoint-gap" aria-hidden="true" />
      <li className="waypoint waypoint-dest-node" aria-hidden="true" />
    </ol>
  );
}

function SignalCardView({ card }: { card: SignalCard }) {
  return (
    <article className={`signal-card urgency-${card.urgency}`}>
      <header className="signal-head">
        <UrgencyDot urgency={card.urgency} />
        <h2>{card.title}</h2>
      </header>
      <p className="signal-implication">{card.implication}</p>

      <Waypoints card={card} />

      <div className="signal-actions">
        <Link className="btn-primary signal-primary" href={`/signals/${card.id}`}>
          {card.primaryAction.label}
        </Link>
        <Link className="signal-why" href={`/signals/${card.id}#why`}>
          Why?
        </Link>
        <span className="signal-capability">
          Atlas can {card.capability} — it will not act without you
        </span>
      </div>

      <p className="signal-meta">
        {card.domains.join(" · ")} · uncertainty {Math.round(card.uncertainty * 100)}%
      </p>
    </article>
  );
}

export default function InboxPage() {
  const payload = demoInbox();
  return (
    <div className="inbox-layout">
      <div className="inbox-demo-banner" role="note">
        {payload.demoLabel}
      </div>
      <main id="main" className="inbox-main">
        <h1 className="inbox-title">Inbox</h1>
        <p className="inbox-sub">
          The next moves Atlas can prepare — each one carries its evidence.
        </p>
        <CommandStrip />
        <MorningBriefing />
        <div className="signal-list">
          {payload.cards.map((card) => (
            <SignalCardView key={card.id} card={card} />
          ))}
        </div>
      </main>
      <aside className="inbox-rail" aria-label="Source health">
        <h2 className="rail-heading">What Atlas can access</h2>
        <ul className="rail-sources">
          {payload.sources.map((source) => (
            <li key={source.name} className="rail-source">
              <span className="rail-source-name">{source.name}</span>
              <span className="rail-source-mode">{source.mode}</span>
              <span className="rail-source-detail">{source.detail}</span>
            </li>
          ))}
        </ul>
        <p className="rail-note">
          Demo mode uses synthetic fixtures. Nothing sends, buys, cancels, or
          mutates anything.
        </p>
        <Link className="rail-link" href="/">
          About Atlas
        </Link>
      </aside>
    </div>
  );
}
