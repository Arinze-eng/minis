import type { Metadata } from "next";
import Link from "next/link";
import type { SignalCard } from "@/lib/atlas";
import type { SignalRow } from "@/lib/server/store";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
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
          key={`${source.name}-${i}`}
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

export default async function InboxPage() {
  const principal = await principalFromCookies();
  const { store, mode } = getStore();
  const rows = await store.listSignals(principal.userId);
  const cards = rows
    .filter((s) => s.state === "active")
    .map(toCard);

  const storeLabel =
    mode === "postgres"
      ? "Durable Postgres store — your data persists across sessions."
      : "Local file store (no DATABASE_URL configured) — dev mode, data stays on this machine.";

  return (
    <div className="inbox-layout">
      <main id="main" className="inbox-main">
        <h1 className="inbox-title">Inbox</h1>
        <p className="inbox-sub">
          The next moves Atlas can prepare — each one carries its evidence.
        </p>
        <CommandStrip />
        <MorningBriefing />
        <div className="signal-list">
          {cards.length === 0 ? (
            <div className="inbox-empty" role="note">
              <p>
                No active signals yet. Atlas derives signals from your wardrobe
                and money evidence — add a garment or run a money review to
                populate this inbox.
              </p>
              <p className="inbox-empty-links">
                <Link href="/wardrobe/add">Add a garment</Link> ·{" "}
                <Link href="/money">Money review</Link>
              </p>
            </div>
          ) : (
            cards.map((card) => <SignalCardView key={card.id} card={card} />)
          )}
        </div>
      </main>
      <aside className="inbox-rail" aria-label="Source health">
        <h2 className="rail-heading">What Atlas can access</h2>
        <ul className="rail-sources">
          <li className="rail-source">
            <span className="rail-source-name">Wardrobe</span>
            <span className="rail-source-mode">your confirmed items</span>
            <span className="rail-source-detail">
              Outfits come only from garments you confirmed.
            </span>
          </li>
          <li className="rail-source">
            <span className="rail-source-name">Money review</span>
            <span className="rail-source-mode">deterministic findings</span>
            <span className="rail-source-detail">
              Recurring charges and price changes you approved for review.
            </span>
          </li>
          <li className="rail-source">
            <span className="rail-source-name">Gmail</span>
            <span className="rail-source-mode rail-mode-off">
              connect on Sources
            </span>
            <span className="rail-source-detail">
              Read-only, consent-gated; disconnected by default.
            </span>
          </li>
        </ul>
        <p className="rail-note">
          {storeLabel} Identity: {principal.source === "clerk" ? "Clerk-verified account" : "local dev principal (single-user, not a real account)"}. Nothing
          sends, buys, cancels, or mutates anything without your approval.
        </p>
        <Link className="rail-link" href="/sources">
          Manage sources
        </Link>
      </aside>
    </div>
  );
}
