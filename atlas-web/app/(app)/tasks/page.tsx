import type { Metadata } from "next";
import { RouteMark } from "@/components/RouteMark";
import { CheckSquare, Bell, Moon, ShieldCheck, Info, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Tasks",
};

/**
 * Task reminders (Operations Engine). This release ships the reminder
 * mechanism behind the existing notification infrastructure (quiet hours,
 * dedup, snooze) but no task-source connector is configured, so this surface
 * states scope honestly and shows a labelled synthetic illustration.
 */

const SAMPLE = {
  title: "Review annual subscription renewal for SampleStream",
  due: "2026-09-17",
  source: "Synthetic illustration — not a real reminder in your account.",
};

export default function TasksPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--atlas-lilac)]">
          <RouteMark className="w-4 h-4" />
          <span>Operations Engine · Task Reminders</span>
        </div>
        <h1 className="text-3xl font-display font-semibold tracking-tight text-[var(--atlas-ink)]">
          Reminders that respect your attention
        </h1>
        <p className="text-sm text-[var(--atlas-ink)]/70 max-w-xl">
          Obligations Atlas notices — renewals, deadlines, follow-ups — become
          quiet, deduplicated reminders you can snooze or dismiss.
        </p>
      </div>

      <div className="border border-[var(--atlas-amber)]/40 bg-[var(--atlas-amber)]/10 rounded-xl p-5 flex gap-3" role="note">
        <Info className="w-5 h-5 text-[var(--atlas-amber)] shrink-0" />
        <div>
          <p className="text-sm font-medium text-[var(--atlas-ink)]">No task source is connected yet.</p>
          <p className="text-xs text-[var(--atlas-ink)]/70 mt-1">
            Renewal-derived reminders from Money Guard already appear in your{" "}
            <a href="/inbox" className="underline hover:text-[var(--atlas-ink)]">Inbox</a>. A
            dedicated task connector (e.g. read-only Google Tasks) activates
            here once configured and consented.
          </p>
        </div>
      </div>

      <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-[var(--atlas-ink)]/60">
          <ShieldCheck className="w-4 h-4 text-[var(--atlas-lime)]" />
          Reminder guarantees (already active for Inbox signals)
        </div>
        <ul className="text-sm text-[var(--atlas-ink)]/80 space-y-2">
          <li className="flex gap-2"><Bell className="w-4 h-4 text-[var(--atlas-lilac)] shrink-0 mt-0.5" /> Delivered through your notification center with deduplication keys.</li>
          <li className="flex gap-2"><Moon className="w-4 h-4 text-[var(--atlas-lilac)] shrink-0 mt-0.5" /> Quiet hours respected — nothing pings you at night.</li>
          <li className="flex gap-2"><CheckSquare className="w-4 h-4 text-[var(--atlas-lilac)] shrink-0 mt-0.5" /> Snooze, dismiss, and correct — every state change is auditable.</li>
        </ul>
      </div>

      <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 space-y-3" aria-hidden="true">
        <div className="flex items-center justify-between border-b border-[var(--atlas-line)] pb-3">
          <h2 className="text-sm font-display font-semibold text-[var(--atlas-ink)]">
            Reminder shape — synthetic illustration
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[var(--atlas-amber)]/15 text-[var(--atlas-ink)] font-semibold">
            sample
          </span>
        </div>
        <p className="text-sm text-[var(--atlas-ink)]">{SAMPLE.title}</p>
        <p className="text-xs font-mono text-[var(--atlas-ink)]/60 tabular-nums">due {SAMPLE.due}</p>
        <p className="text-[11px] font-mono text-[var(--atlas-ink)]/50">{SAMPLE.source}</p>
      </div>

      <p className="text-xs text-[var(--atlas-ink)]/60 flex items-center gap-1.5">
        <ExternalLink className="w-3.5 h-3.5" />
        Task sources will be read-only; Atlas never completes or edits tasks on your behalf.
      </p>
    </div>
  );
}
