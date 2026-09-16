import type { Metadata } from "next";
import { Radio, Mail, CheckSquare, DollarSign, Plane, ExternalLink } from "lucide-react";
import Link from "next/link";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { GmailConnection } from "./GmailConnection";

export const metadata: Metadata = {
  title: "Sources",
};

export default async function SourcesPage() {
  const principal = await principalFromCookies();
  const { store } = getStore();

  // Authorization state is distinct from scan state: a newly connected user
  // should see Gmail as connected before the first scan completes.
  const connection = await store.getSourceConnection(principal.userId, "gmail");
  const gmailConnected = connection?.status === "connected";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="flex items-center gap-1.5 text-[0.72rem] font-bold tracking-widest uppercase text-[var(--color-ink-muted)] mb-2">
          <Radio size={13} aria-hidden="true" />
          Sources · consented and revocable
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-ink)] mb-2">
          Sources
        </h1>
        <p className="text-[var(--color-ink-muted)] text-[0.95rem] leading-relaxed max-w-prose">
          Connect the data sources Atlas can read from. All access is read-only
          and revocable.
        </p>
      </div>

      {/* ── Connector grid ──────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
        role="list"
        aria-label="Available connectors"
      >
        {/* Gmail connector */}
        <div
          role="listitem"
          className="flex flex-col gap-3 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(234,67,53,0.12)", color: "#ea4335" }}
              aria-hidden="true"
            >
              <Mail size={20} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold text-[0.97rem] leading-tight text-[var(--color-ink)]">
                Gmail
              </span>
              {gmailConnected ? (
                <span className="inline-flex items-center text-[0.73rem] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full w-fit bg-[var(--color-good-soft)] text-[var(--color-good-deep)]">
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center text-[0.73rem] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full w-fit border border-[var(--color-line)] text-[var(--color-ink-muted)]">
                  Not connected
                </span>
              )}
            </div>
          </div>

          <p className="text-[0.87rem] text-[var(--color-ink-muted)] leading-relaxed m-0">
            Read-only email scanning. Atlas extracts receipt and subscription
            metadata — never message bodies.
          </p>

          <div className="mt-auto pt-2">
            {!gmailConnected && (
              <Link
                href="/api/gmail/connect"
                className="inline-flex items-center justify-center gap-2 text-[0.87rem] font-semibold px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-deep)] transition-colors no-underline"
              >
                Connect
              </Link>
            )}
          </div>
        </div>

        {/* Google Flights handoff — Google does not expose a supported public
            Flights data API, so this opens the real Google Flights surface. */}
        <div role="listitem" className="flex flex-col gap-3 bg-[var(--color-surface)] border border-dashed border-[var(--color-line)] rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center bg-sky-500/10 text-sky-600" aria-hidden="true"><Plane size={20} strokeWidth={1.8} /></div>
            <div className="flex flex-col gap-0.5 min-w-0"><span className="font-semibold text-[0.97rem] leading-tight text-[var(--color-ink)]">Google Flights</span><span className="inline-flex items-center text-[0.73rem] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full w-fit border border-[var(--color-line)] text-[var(--color-ink-muted)]">Open search</span></div>
          </div>
          <p className="text-[0.87rem] text-[var(--color-ink-muted)] leading-relaxed m-0">Search live fares on Google Flights. Atlas does not scrape or fabricate flight data; use this handoff until an approved travel data connector is configured.</p>
          <a href="https://www.google.com/travel/flights" target="_blank" rel="noreferrer" className="inline-flex w-fit items-center justify-center gap-2 text-[0.87rem] font-semibold px-4 py-2 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] no-underline transition-colors">Open Google Flights <ExternalLink size={14} /></a>
        </div>

        {/* Google Tasks — consent-gated read-only connector */}
        <div
          role="listitem"
          className="flex flex-col gap-3 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center"
              style={{
                background: "rgba(66,133,244,0.12)",
                color: "var(--color-ink-muted)",
              }}
              aria-hidden="true"
            >
              <CheckSquare size={20} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold text-[0.97rem] leading-tight text-[var(--color-ink)]">
                Google Tasks
              </span>
              <span className="inline-flex items-center text-[0.73rem] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full w-fit bg-[var(--color-good-soft)] text-[var(--color-good-deep)]">
                Read-only
              </span>
            </div>
          </div>
          <p className="text-[0.87rem] text-[var(--color-ink-muted)] leading-relaxed m-0">
            Read-only task list. Atlas surfaces deadlines — including tax events
            you add yourself — without editing or deleting tasks.
          </p>
          <Link href="/tasks" className="inline-flex w-fit items-center justify-center gap-2 text-[0.87rem] font-semibold px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-deep)] transition-colors no-underline">
            Manage Google Tasks
          </Link>
        </div>

        {/* Plaid — coming soon */}
        <div
          role="listitem"
          className="flex flex-col gap-3 bg-[var(--color-surface)] border border-dashed border-[var(--color-line)] rounded-2xl p-5 opacity-70"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center"
              style={{
                background: "rgba(5,150,105,0.12)",
                color: "var(--color-ink-muted)",
              }}
              aria-hidden="true"
            >
              <DollarSign size={20} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold text-[0.97rem] leading-tight text-[var(--color-ink)]">
                Plaid
              </span>
              <span className="inline-flex items-center text-[0.73rem] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full w-fit border border-dashed border-[var(--color-line-strong)] text-[var(--color-ink-muted)]">
                Coming soon
              </span>
            </div>
          </div>
          <p className="text-[0.87rem] text-[var(--color-ink-muted)] leading-relaxed m-0">
            Read-only financial data. Atlas flags recurring charges and price
            changes from your transaction history.
          </p>
        </div>
      </div>

      {/* ── What Gmail access means ─────────────────────────────────────── */}
      <details
        className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl mb-6 overflow-hidden shadow-[var(--shadow-card)]"
        aria-label="What Gmail access means"
      >
        <summary className="list-none cursor-pointer px-6 py-4 text-[1.02rem] font-semibold text-[var(--color-ink)] flex items-center justify-between gap-3 select-none hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,transparent)]">
          What Gmail access means
          <span
            className="text-[var(--color-ink-muted)] text-xl inline-block transition-transform duration-150 [details[open]_&]:rotate-90"
            aria-hidden="true"
          >
            ›
          </span>
        </summary>
        <div className="px-6 pb-5 border-t border-[var(--color-line)]">
          <ul className="mt-3 pl-6 grid gap-2 text-[0.92rem] text-[var(--color-ink-muted)] list-disc">
            <li>
              Scope:{" "}
              <code className="source-code text-[0.84rem] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] rounded px-1.5 py-px">
                https://www.googleapis.com/auth/gmail.readonly
              </code>{" "}
              — read-only. Never send, delete, archive, or change labels.
            </li>
            <li>
              Extraction is server-side and metadata-only: bounded fields
              (merchant, amount, cadence, dates, confidence) — no full message
              bodies.
            </li>
            <li>
              Disconnect revokes at Google, destroys the stored token, and
              deletes Gmail-derived evidence.
            </li>
            <li>
              Clerk sign-in is authentication. Gmail access is a separate
              consent step — connecting your account never implies mailbox
              access.
            </li>
          </ul>
        </div>
      </details>

      {/* ── Gmail connection management ─────────────────────────────────── */}
      <GmailConnection />

      {/* ── Active sources ──────────────────────────────────────────────── */}
      <section aria-labelledby="health-h" className="mt-8">
        <h2
          id="health-h"
          className="text-[1.05rem] font-bold text-[var(--color-ink)] mb-3"
        >
          Active sources
        </h2>
        <ul
          className="list-none m-0 p-0 grid gap-2"
          aria-label="Source health"
        >
          {(
            [
              {
                name: "Wardrobe",
                mode: "local-first",
                on: true,
                detail:
                  "Your confirmed garments; images private to your account.",
              },
              {
                name: "Money review",
                mode: "deterministic",
                on: true,
                detail:
                  "Recurring-charge and price-change findings derived in the store.",
              },
              {
                name: "Gmail",
                mode: gmailConnected ? "connected flow available" : "not connected",
                on: gmailConnected,
                detail: "Read-only, consent-gated, metadata-only extraction.",
              },
            ] as const
          ).map(({ name, mode, on, detail }) => (
            <li
              key={name}
              className="grid grid-cols-[auto_auto_1fr] gap-3 items-baseline bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg px-4 py-3"
            >
              <span className="font-semibold text-[var(--color-ink)] text-[0.9rem]">
                {name}
              </span>
              <span
                className={[
                  "text-[0.75rem] uppercase tracking-wider rounded-full px-2 py-0.5",
                  on
                    ? "bg-[color-mix(in_srgb,var(--color-good)_30%,transparent)] text-[var(--color-ink)]"
                    : "border border-dashed border-[var(--color-line)] text-[var(--color-ink-muted)]",
                ].join(" ")}
              >
                {mode}
              </span>
              <span className="text-[0.85rem] text-[var(--color-ink-muted)]">
                {detail}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
