import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckSquare, ExternalLink, Info, Moon, ShieldCheck } from "lucide-react";
import "../panels.css";

export const metadata: Metadata = {
  title: "Tasks",
};

/**
 * Task reminders (Operations Engine). This release ships the reminder
 * mechanism behind the existing notification infrastructure (quiet hours,
 * dedup, snooze) but no task-source connector is configured, so this surface
 * states its scope honestly and shows a labelled synthetic illustration.
 */

const SAMPLE = {
  title: "Review annual subscription renewal for SampleStream",
  due: "2026-09-17",
  source: "Synthetic illustration — not a real reminder in your account.",
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
    <main id="main" className="page page-narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <CheckSquare size={14} aria-hidden="true" />
            Operations engine · task reminders
          </p>
          <h1>Reminders that respect your attention</h1>
          <p className="page-sub">
            Obligations Atlas notices — renewals, deadlines, follow-ups — become
            quiet, deduplicated reminders you can snooze or dismiss.
          </p>
        </div>
      </div>

      <div className="stack-md">
        <div className="notice notice-warn" role="note">
          <Info size={18} aria-hidden="true" />
          <div>
            <p>
              <strong>No task source is connected yet.</strong>
            </p>
            <p className="muted">
              Renewal-derived reminders from the money engine already appear in
              your <Link href="/inbox">Inbox</Link>. A dedicated task connector
              (for example read-only Google Tasks) activates here once configured
              and consented.
            </p>
          </div>
        </div>

        <section className="card" aria-labelledby="guarantees-h">
          <div className="card-head">
            <h2 id="guarantees-h">
              <ShieldCheck size={15} aria-hidden="true" /> Reminder guarantees
            </h2>
            <span className="badge badge-good">Active</span>
          </div>
          <div className="card-pad">
            <ul className="guarantee-list">
              {GUARANTEES.map(({ icon: Icon, text }) => (
                <li key={text}>
                  <Icon size={15} aria-hidden="true" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="card-foot">
            The same mechanism already powers Inbox signals: deduplicated
            delivery, quiet hours, and an auditable state change for every
            action.
          </p>
        </section>

        <section className="card" aria-labelledby="shape-h">
          <div className="card-head">
            <h2 id="shape-h">Reminder shape — synthetic illustration</h2>
            <span className="badge badge-warn">Sample</span>
          </div>
          <div className="card-pad stack-sm">
            <p className="sample-title">{SAMPLE.title}</p>
            <p className="tabular muted">due {SAMPLE.due}</p>
            <p className="sample-source">{SAMPLE.source}</p>
          </div>
        </section>

        <p className="footnote">
          <ExternalLink size={13} aria-hidden="true" /> Task sources will be
          read-only; Atlas never completes or edits tasks on your behalf.
        </p>
      </div>
    </main>
  );
}
