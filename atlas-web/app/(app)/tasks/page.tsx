import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckSquare, ExternalLink, Info, Moon, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Tasks",
};

const GUARANTEES = [
  {
    icon: Bell,
    text: "Delivered through your notification centre with deduplication keys.",
  },
  {
    icon: Moon,
    text: "Quiet hours respected — nothing pings you at night.",
  },
  {
    icon: CheckSquare,
    text: "Snooze, dismiss, and correct — every state change is auditable.",
  },
];

export default function TasksPage() {
  return (
    <main id="main" className="max-w-[720px] mx-auto px-6 py-10 w-full">
      {/* Page header */}
      <div className="mb-8">
        <p className="inline-flex items-center gap-1.5 mb-3 text-[0.72rem] font-extrabold tracking-[0.13em] uppercase text-[var(--color-accent-deep)]">
          <CheckSquare size={14} aria-hidden="true" />
          Operations engine · task reminders
        </p>
        <h1 className="text-3xl font-bold tracking-[-0.015em] leading-[1.15] m-0 mb-3 text-[var(--color-ink)]">
          Reminders that respect your attention
        </h1>
        <p className="m-0 text-base text-[var(--color-ink-muted)] leading-relaxed max-w-[56ch]">
          Obligations Atlas notices — renewals, deadlines, follow-ups — become
          quiet, deduplicated reminders you can snooze or dismiss.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Notice */}
        <div
          role="note"
          className="flex items-start gap-3 px-4 py-3 rounded-xl border border-[var(--color-alert-soft)] bg-[var(--color-alert-soft)] text-[var(--color-ink)]"
        >
          <Info
            size={18}
            aria-hidden="true"
            className="text-[var(--color-alert-deep)] mt-0.5 flex-none"
          />
          <div>
            <p className="m-0 font-semibold text-sm">
              No task source is connected yet.
            </p>
            <p className="m-0 mt-1 text-[0.88rem] text-[var(--color-ink-muted)]">
              Renewal-derived reminders from the money engine already appear in
              your{" "}
              <Link
                href="/inbox"
                className="text-[var(--color-accent-deep)] underline underline-offset-2"
              >
                Inbox
              </Link>
              . A dedicated task connector activates here once configured and
              consented.
            </p>
          </div>
        </div>

        {/* Reminder guarantees card */}
        <section
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl overflow-hidden"
          aria-labelledby="guarantees-h"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-line)]">
            <h2
              id="guarantees-h"
              className="m-0 text-[0.95rem] font-semibold text-[var(--color-ink)] flex items-center gap-1.5"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              Reminder guarantees
            </h2>
            <span className="text-[0.72rem] font-bold tracking-wide uppercase px-2.5 py-1 rounded-full bg-[var(--color-good-soft)] text-[var(--color-good-deep)]">
              Active
            </span>
          </div>
          <div className="px-6 py-5">
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {GUARANTEES.map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="flex items-start gap-3 text-[0.92rem] text-[var(--color-ink-muted)] leading-relaxed"
                >
                  <Icon
                    size={15}
                    aria-hidden="true"
                    className="text-[var(--color-good)] mt-0.5 flex-none"
                  />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="px-6 py-4 m-0 text-[0.82rem] text-[var(--color-ink-muted)] border-t border-[var(--color-line)] leading-relaxed">
            The same mechanism already powers Inbox signals: deduplicated
            delivery, quiet hours, and an auditable state change for every
            action.
          </p>
        </section>

        {/* Footnote */}
        <p className="m-0 text-[0.82rem] text-[var(--color-ink-muted)] flex items-center gap-1.5">
          <ExternalLink size={13} aria-hidden="true" />
          Task sources will be read-only; Atlas never completes or edits tasks
          on your behalf.
        </p>

        {/* CTA */}
        <div className="flex justify-center pt-2">
          <Link
            className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-[var(--radius-control)] bg-[var(--color-accent)] text-[var(--color-on-accent)] no-underline hover:bg-[var(--color-accent-deep)] active:scale-95 transition-all duration-150"
            href="/sources"
          >
            Connect a task source
          </Link>
        </div>
      </div>
    </main>
  );
}
