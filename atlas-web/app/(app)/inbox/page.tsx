import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Inbox, Settings, Zap } from "lucide-react";
import type { SignalCard } from "@/lib/atlas";
import type { SignalRow } from "@/lib/server/store";
import { principalFromCookies, principalSummary } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { CommandStrip } from "./CommandStrip";
import { MorningBriefing } from "./MorningBriefing";

export const metadata: Metadata = { title: "Inbox" };

const RAIL_SOURCES = [
  { name: "Wardrobe",      detail: "Garments you confirmed",              on: true  },
  { name: "Money review",  detail: "Recurring charge detection",          on: true  },
  { name: "Gmail",         detail: "Connect on Sources for email data",   on: false },
];

function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

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

const URGENCY_STYLES = {
  urgent: "border-l-[var(--color-danger)] bg-[var(--color-danger-soft)]",
  review: "border-l-[var(--color-alert)]  bg-[var(--color-alert-soft)]",
  normal: "border-l-[var(--color-accent)] bg-transparent",
  low:    "border-l-[var(--color-accent)] bg-transparent",
} as const;

function SignalCard({ card }: { card: SignalCard }) {
  const borderClass = URGENCY_STYLES[card.urgency as keyof typeof URGENCY_STYLES] ?? URGENCY_STYLES.normal;
  const evidenceStr = card.sources.map((s) => s.name).join(" · ") || "no evidence";

  return (
    <li className={`group border-l-4 ${borderClass} rounded-r-xl p-4 pr-5 hover:shadow-[var(--shadow-pop)] transition-all duration-150`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <Link
            href={`/signals/${card.id}`}
            className="font-semibold text-[0.92rem] text-[var(--color-ink)] hover:text-[var(--color-accent-deep)] no-underline hover:underline underline-offset-2 block leading-snug"
          >
            {card.title}
          </Link>
          <p className="text-[0.82rem] text-[var(--color-ink-muted)] mt-0.5 leading-relaxed line-clamp-2">
            {card.implication}
          </p>
          <p className="text-[0.72rem] text-[var(--color-ink-muted)] mt-1 opacity-75 font-mono">
            {evidenceStr} · {Math.round(card.uncertainty * 100)}% confidence
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="inline-flex items-center text-[0.66rem] font-bold uppercase tracking-wide
                           px-2.5 py-0.5 rounded-full border
                           bg-[var(--color-accent-soft)] text-[var(--color-accent-deep)]
                           border-[color-mix(in_srgb,var(--color-accent)_32%,transparent)]">
            {card.capability}
          </span>
          <Link
            href={`/signals/${card.id}#why`}
            className="text-[0.78rem] font-semibold text-[var(--color-accent-deep)] no-underline hover:underline underline-offset-2"
          >
            Why?
          </Link>
        </div>
      </div>
    </li>
  );
}

export default async function InboxPage() {
  const principal = await principalFromCookies();
  const { store, mode } = getStore();
  const rows = await store.listSignals(principal.userId);
  const cards = rows.filter((s) => s.state === "active").map(toCard);
  const { userIdHash } = principalSummary(principal);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 lg:px-8">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6 pb-5 border-b border-[var(--color-line)]">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] mb-1">
          {formatLongDate(new Date())}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-ink)]">
            Inbox
          </h1>
          {cards.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.6rem] h-6 px-2
                             rounded-full bg-[var(--color-accent)] text-white text-[0.72rem] font-bold">
              {cards.length}
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Two-column grid                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-start">

        {/* -------- Main column -------- */}
        <div className="flex flex-col gap-5">
          {/* Dashboard stats + urgent ribbon */}
          <CommandStrip />

          {/* Morning briefing */}
          <MorningBriefing />

          {/* Priority queue */}
          <section aria-labelledby="queue-h">
            <div className="flex items-center justify-between mb-3">
              <h2 id="queue-h" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] flex items-center gap-1.5">
                <Zap size={12} aria-hidden="true" />
                Priority queue
              </h2>
              <span className="text-[0.68rem] text-[var(--color-ink-muted)]">
                {cards.length} active
              </span>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
              {cards.length === 0 ? (
                <div className="flex flex-col items-center text-center py-16 px-6 gap-3">
                  <Inbox size={40} className="text-[var(--color-ink-muted)] opacity-25" aria-hidden="true" />
                  <h3 className="font-bold text-[1.05rem] text-[var(--color-ink)]">Queue is clear</h3>
                  <p className="text-[0.88rem] text-[var(--color-ink-muted)] max-w-[30ch] leading-relaxed">
                    Add a garment or connect a source to start seeing signals here.
                  </p>
                  <div className="flex gap-3 flex-wrap justify-center mt-2">
                    <Link
                      href="/wardrobe/add"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-accent)]
                                 text-white text-sm font-semibold no-underline hover:bg-[var(--color-accent-deep)]
                                 transition-colors duration-150"
                    >
                      Add a garment
                    </Link>
                    <Link
                      href="/sources"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                                 border border-[var(--color-line-strong)] bg-[var(--color-surface)]
                                 text-[var(--color-ink)] text-sm font-semibold no-underline
                                 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-deep)]
                                 transition-colors duration-150"
                    >
                      Connect a source
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-line)] list-none m-0 p-0">
                  {cards.map((card) => (
                    <SignalCard key={card.id} card={card} />
                  ))}
                </ul>
              )}
              <div className="px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-surface-raised)]">
                <p className="text-[0.76rem] text-[var(--color-ink-muted)]">
                  Atlas prepares and advises — it never acts without your approval.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* -------- Right rail -------- */}
        <aside className="flex flex-col gap-4 xl:sticky xl:top-20" aria-label="Status">

          {/* Connected sources */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-line)]">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">Connected sources</h2>
              <span className="text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full
                               bg-[var(--color-good-soft)] text-[var(--color-good-deep)]
                               border border-[color-mix(in_srgb,var(--color-good)_30%,transparent)]">
                Read-only
              </span>
            </div>
            <ul className="divide-y divide-[var(--color-line)] list-none m-0 p-0">
              {RAIL_SOURCES.map((source) => (
                <li key={source.name} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${source.on
                      ? "bg-[var(--color-good)] shadow-[0_0_0_3px_var(--color-good-soft)]"
                      : "border-[1.5px] border-dashed border-[var(--color-line-strong)]"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.86rem] font-semibold text-[var(--color-ink)] leading-tight">{source.name}</p>
                    <p className="text-[0.76rem] text-[var(--color-ink-muted)] leading-tight mt-0.5">{source.detail}</p>
                  </div>
                  <span className={`text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                    source.on
                      ? "bg-[var(--color-good-soft)] text-[var(--color-good-deep)] border-[color-mix(in_srgb,var(--color-good)_28%,transparent)]"
                      : "border-dashed border-[var(--color-line-strong)] text-[var(--color-ink-muted)]"
                  }`}>
                    {source.on ? "active" : "off"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-[var(--color-line)]">
              <Link
                href="/sources"
                className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold
                           text-[var(--color-accent-deep)] no-underline hover:underline underline-offset-2"
              >
                Manage sources <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Settings card */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[var(--shadow-card)] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Settings size={13} className="text-[var(--color-ink-muted)]" aria-hidden="true" />
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.09em] text-[var(--color-ink-muted)]">
                Account
              </span>
            </div>
            <p className="text-[0.76rem] text-[var(--color-ink-muted)] font-mono mb-3">
              principal …{userIdHash}
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold
                         text-[var(--color-accent-deep)] no-underline hover:underline underline-offset-2"
            >
              Open settings <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <p className="text-[0.68rem] text-[var(--color-ink-muted)] mt-3 opacity-55">
              {mode === "postgres" ? "Postgres store" : "Local store · dev mode"}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
