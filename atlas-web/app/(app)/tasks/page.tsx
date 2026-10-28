"use client";

import { useAction, useQuery } from "convex/react";
import { CheckSquare, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, errorMessage, PageHead, PageLoading } from "@/components/ui";
import { api } from "@/convex/_generated/api";

type Task = { id: string; title: string; due?: string; list: string };

export default function TasksPage() {
  const status = useQuery(api.sources.status);
  const fetchTasks = useAction(api.sources.googleTasks);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const connected = status?.connections.some((c) => c.provider === "google_tasks" && c.status === "connected");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await fetchTasks({}));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fetchTasks]);

  useEffect(() => {
    if (connected && tasks === null && !loading && !error) void load();
  }, [connected, tasks, loading, error, load]);

  if (status === undefined) return <PageLoading />;

  const lists = new Map<string, Task[]>();
  for (const t of tasks ?? []) lists.set(t.list, [...(lists.get(t.list) ?? []), t]);

  return (
    <div className="page page-narrow">
      <PageHead
        title="Tasks"
        sub="Open tasks from Google Tasks, read-only."
        actions={
          connected && (
            <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
              <RefreshCw size={16} className={loading ? "spin" : undefined} aria-hidden="true" /> Refresh
            </button>
          )
        }
      />
      {!connected ? (
        <Empty icon={CheckSquare} title="Google Tasks isn't connected" body="Connect it to see your open tasks here. Atlas can't add, edit or complete them." action={{ href: "/sources", label: "Connect" }} />
      ) : error ? (
        <div className="notice notice-warn">{error}</div>
      ) : tasks === null ? (
        <PageLoading label="Fetching tasks…" />
      ) : tasks.length === 0 ? (
        <Empty icon={CheckSquare} title="All done" body="No open tasks." />
      ) : (
        [...lists.entries()].map(([list, rows]) => (
          <section key={list} className="section">
            <h2 className="section-title">{list}</h2>
            <div className="list-card">
              {rows.map((t) => (
                <div key={t.id} className="list-row">
                  <span className="w-5 h-5 rounded-full border-2 border-[var(--color-line-strong)] flex-none" aria-hidden="true" />
                  <div className="list-main">
                    <div className="list-title !font-medium">{t.title}</div>
                    {t.due && <div className="list-sub">Due {new Date(t.due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
