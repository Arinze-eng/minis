import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HelpCircle } from "lucide-react";
import type { SignalCard } from "@/lib/atlas";
import type { SignalRow } from "@/lib/server/store";
import { principalFromCookies, principalSummary } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { CommandStrip } from "./CommandStrip";
import { MorningBriefing } from "./MorningBriefing";
import "./inbox.css";

export const metadata: Metadata = {
  title: "Inbox",
};

/** Sources Atlas can currently reach, with their honest state. */
const RAIL_SOURCES = [
  {
    name: "Wardrobe",
    mode: "local-first",
    on: true,
    detail: "Outfits come only from garments you confirmed.",
  },
  {
    name: "Money review",
    mode: "deterministic",
    on: true,
    detail: "Recurring charges and price changes derived in the store.",
  },
  {
    name: "Gmail",
    mode: "connect on Sources",
    on: false,
    detail: "Read-only, consent-gated; disconnected by default.",
  },
];

function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function UrgencyDot({ urgency }: { urgency: SignalCard["urgency"] }) {
  const className =
    urgency === "urgent"
      ? "queue-dot queue-dot-urgent"
      : urgency === "review"
        ? "queue-dot queue-dot-review"
        : "queue-dot";
  return <span className={className} aria-hidden="true" />;
}

/** Store row → browser card. Evidence items are the waypoints. */
function toCard(row: SignalRow): SignalCard {
  const evidence = row.evidence as Array<{ label: string; detail: string }>;
  return {
    id: row.id,
    title: row.title,
    implication: row.implication,
    noticed: row.noticed,
    urgency: row.urgency as SignalCard["urgency"],
    domains: row.domains as SignalCard["domains"],
    sources: evidence.slice(0, 3).map((e) => ({
      name: e.label,
      retrievedAt: row.createdAt,
      freshness: "fresh" as const,
    })),
    uncertainty: row.uncertainty,
    primaryAction: { label: row.primaryAction.label, kind: "review" as const },
    capability: row.capability as SignalCard["capability"],
    evidence,
    createdAt: row.createdAt,
  };
}

function SignalRowView({ card }: { card: SignalCard }) {
  const evidenceLabels = card.sources.map((s) => s.name).join(" · ") || "no evidence attached";
  return (
    <li className={`row queue-row urgency-${card.urgency}`}>
      <UrgencyDot urgency={card.urgency} />
      <span className="queue-body">
        <Link className="row-title queue-link" href={`/signals/${card.id}`}>
          {card.title}
        </Link>
        <span className="row-detail">{card.implication}</span>
        <span className="queue-evidence">
          Evidence: {evidenceLabels} · uncertainty {Math.round(card.uncertainty * 100)}%
        </span>
      </span>
      <span className="queue-actions">
        <span className="badge badge-accent">{card.capability}</span>
        <Link className="queue-why" href={`/signals/${card.id}#why`}>
          Why?
        </Link>
      </span>
    </li>
  );
}

export default async function InboxPage() {
  const principal = await principalFromCookies();
  const { store, mode } = getStore();
  const rows = await store.listSignals(principal.userId);
  const cards = rows.filter((s) => s.state === "active").map(toCard);
  const summary = principalSummary(principal);

  const storeLabel =
    mode === "postgres"
      ? "Durable Postgres store — your data persists across sessions."
      : "Local file store (no DATABASE_URL configured) — dev mode, data stays on this machine.";

  return (
    <div className="inbox-layout">
      <main id="main" className="inbox-main">
        <header className="inbox-head">
          <p className="eyebrow">{formatLongDate(new Date())}</p>
          <h1>Your next moves, ranked.</h1>
          <p className="page-sub">
            Each signal carries its evidence. Atlas prepares the next move and
            stops there — you decide what happens.
          </p>
        </header>

        <CommandStrip />
        <MorningBriefing />

        <section className="card inbox-queue" aria-labelledby="queue-h">
          <div className="card-head">
            <h2 id="queue-h">Priority queue</h2>
            <span className="badge">What deserves your attention</span>
          </div>
          {cards.length === 0 ? (
            <div className="inbox-empty" role="note">
              <p>
                No active signals yet. Atlas derives signals from your wardrobe
                and money evidence — add a garment or run a money review to
                populate this queue.
              </p>
              <p className="action-row">
                <Link className="btn-primary btn-sm" href="/wardrobe/add">
                  Add a garment
                </Link>
                <Link className="btn-secondary btn-sm" href="/money">
                  Money review
                </Link>
                <Link className="btn-ghost btn-sm" href="/ask">
                  <HelpCircle size={14} aria-hidden="true" />
                  Ask Atlas
                </Link>
              </p>
            </div>
          ) : (
            <ul className="row-list">
              {cards.map((card) => (
                <SignalRowView key={card.id} card={card} />
              ))}
            </ul>
          )}
          <p className="card-foot">
            Atlas can advise or prepare — it never sends, buys, cancels, or
            mutates anything on its own.
          </p>
        </section>
      </main>

      <aside className="inbox-rail" aria-label="System pulse">
        <section className="card">
          <div className="card-head">
            <h2>System pulse</h2>
            <span className="badge badge-good">Read-only</span>
          </div>
          <ul className="row-list">
            {RAIL_SOURCES.map((source) => (
              <li className="row pulse-row" key={source.name}>
                <span
                  className={`source-dot ${source.on ? "source-dot-on" : "source-dot-off"}`}
                  aria-hidden="true"
                />
                <span>
                  <span className="row-title">{source.name}</span>
                  <span className="row-detail">{source.detail}</span>
                </span>
                <span className={`badge ${source.on ? "badge-good" : "badge-off"}`}>
                  {source.mode}
                </span>
              </li>
            ))}
          </ul>
          <div className="card-foot">
            <Link className="rail-link" href="/sources">
              Manage sources
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="card card-pad identity-card">
          <h2>Signed in as</h2>
          <p className="identity-line">{summary.label}</p>
          <p className="muted identity-meta">
            principal …{summary.userIdHash} · {storeLabel}
          </p>
          <p className="muted identity-meta">
            Nothing sends, buys, cancels, or mutates anything without your
            approval.
          </p>
        </section>
      </aside>
    </div>
  );
}
