"use client";

import Link from "next/link";
import { Bell, CheckSquare, ExternalLink, Info, Moon, ShieldCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Task = { id: string; title: string; notes?: string; due?: string; status?: string; webViewLink?: string };
type Status = { configured: boolean; connected: boolean; status: string };

const GUARANTEES = [
  { icon: Bell, text: "Due tasks can surface in the Inbox with deduplication keys." },
  { icon: Moon, text: "Quiet hours are respected — nothing pings you at night." },
  { icon: CheckSquare, text: "Read-only access — Atlas never completes or edits a task." },
];

export default function TasksPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusResponse = await fetch("/api/google-tasks/status", { cache: "no-store" });
      const nextStatus = (await statusResponse.json()) as Status;
      setStatus(nextStatus);
      if (nextStatus.connected) {
        const tasksResponse = await fetch("/api/google-tasks/list", { cache: "no-store" });
        const body = (await tasksResponse.json()) as { tasks?: Task[]; error?: string };
        if (!tasksResponse.ok) throw new Error(body.error ?? "Google Tasks could not be read");
        setTasks(body.tasks ?? []);
      } else {
        setTasks([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Tasks is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main id="main" className="mx-auto w-full max-w-[820px] px-6 py-10">
      <div className="mb-8">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[.72rem] font-extrabold uppercase tracking-[.13em] text-[var(--color-accent-deep)]"><CheckSquare size={14} /> Google Tasks · read-only</p>
        <h1 className="m-0 mb-3 text-3xl font-bold tracking-[-.015em] text-[var(--color-ink)]">Reminders that respect your attention</h1>
        <p className="m-0 max-w-[58ch] text-base leading-relaxed text-[var(--color-ink-muted)]">Connect the Google Tasks list you already use for deadlines, including tax events. Atlas reads due dates and titles, then prepares reminders without changing your task list.</p>
      </div>

      <div className="flex flex-col gap-4">
        <section className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]" aria-labelledby="google-tasks-heading">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--color-line)] px-6 py-4">
            <h2 id="google-tasks-heading" className="m-0 flex items-center gap-2 text-[.98rem] font-semibold text-[var(--color-ink)]"><CheckSquare size={16} /> Google Tasks connection</h2>
            <span className={`rounded-full px-2.5 py-1 text-[.7rem] font-bold uppercase tracking-wide ${status?.connected ? "bg-[var(--color-good-soft)] text-[var(--color-good-deep)]" : "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]"}`}>{status?.connected ? "Connected" : "Not connected"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-6 py-5">
            {!status?.connected ? <a href="/api/google-tasks/connect" className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-accent)] no-underline transition hover:bg-[var(--color-accent-deep)]">Connect Google Tasks</a> : <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] disabled:opacity-60"><RefreshCw size={15} className={loading ? "spin" : undefined} /> Refresh tasks</button>}
            <Link href="/sources" className="text-sm font-semibold text-[var(--color-accent-deep)] no-underline hover:underline">View all sources</Link>
          </div>
          {!status?.configured ? <p className="m-0 border-t border-[var(--color-line)] bg-[var(--color-alert-soft)] px-6 py-4 text-sm leading-relaxed text-[var(--color-alert-deep)]">Google OAuth is not configured on this deployment. Set the Google client credentials and encryption key on Render; Atlas will not simulate a connection.</p> : null}
          {error ? <p role="alert" className="m-0 border-t border-[var(--color-line)] bg-[var(--color-danger-soft)] px-6 py-4 text-sm leading-relaxed text-[var(--color-danger)]">{error}</p> : null}
        </section>

        {status?.connected ? <section className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]" aria-labelledby="task-list-heading">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-4"><h2 id="task-list-heading" className="m-0 text-[.98rem] font-semibold text-[var(--color-ink)]">Upcoming tasks</h2><span className="text-xs text-[var(--color-ink-muted)]">{tasks.length} open</span></div>
          {tasks.length ? <ul className="m-0 list-none divide-y divide-[var(--color-line)] p-0">{tasks.map((task) => <li key={task.id} className="flex items-start gap-3 px-6 py-4"><CheckSquare size={17} className="mt-1 shrink-0 text-[var(--color-good)]" /><div className="min-w-0"><p className="m-0 font-semibold text-[var(--color-ink)]">{task.title}</p>{task.due ? <p className="mt-1 text-xs text-[var(--color-accent-deep)]">Due {new Date(task.due).toLocaleString()}</p> : null}{task.notes ? <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">{task.notes}</p> : null}</div></li>)}</ul> : <div className="px-6 py-12 text-center"><p className="m-0 font-semibold text-[var(--color-ink)]">No open tasks in the default Google Tasks list.</p><p className="mt-2 text-sm text-[var(--color-ink-muted)]">Create a task such as “Submit tax return” in Google Tasks and refresh this view.</p></div>}
        </section> : null}

        <div role="note" className="flex items-start gap-3 rounded-xl border border-[var(--color-alert-soft)] bg-[var(--color-alert-soft)] px-4 py-3 text-[var(--color-ink)]"><Info size={18} className="mt-0.5 shrink-0 text-[var(--color-alert-deep)]" /><div><p className="m-0 text-sm font-semibold">Tax events are task-backed, not fabricated.</p><p className="m-0 mt-1 text-[.88rem] leading-relaxed text-[var(--color-ink-muted)]">Atlas can read tax deadlines you add to Google Tasks. It does not infer tax obligations or provide tax advice.</p></div></div>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]" aria-labelledby="guarantees-h"><div className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-4"><h2 id="guarantees-h" className="m-0 flex items-center gap-1.5 text-[.95rem] font-semibold text-[var(--color-ink)]"><ShieldCheck size={15} /> Reminder guarantees</h2><span className="rounded-full bg-[var(--color-good-soft)] px-2.5 py-1 text-[.72rem] font-bold uppercase tracking-wide text-[var(--color-good-deep)]">Active</span></div><div className="px-6 py-5"><ul className="m-0 flex list-none flex-col gap-3 p-0">{GUARANTEES.map(({ icon: Icon, text }) => <li key={text} className="flex items-start gap-3 text-[.92rem] leading-relaxed text-[var(--color-ink-muted)]"><Icon size={15} className="mt-0.5 shrink-0 text-[var(--color-good)]" /><span>{text}</span></li>)}</ul></div><p className="m-0 border-t border-[var(--color-line)] px-6 py-4 text-[.82rem] leading-relaxed text-[var(--color-ink-muted)]"><ExternalLink size={13} className="mr-1 inline" />Google Tasks remains the source of truth. Atlas only reads and prepares.</p></section>
      </div>
    </main>
  );
}
