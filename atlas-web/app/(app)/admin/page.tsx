"use client";

import { useQuery } from "convex/react";
import { Empty, PageHead, PageLoading } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { formatMoney } from "@/lib/format";

function AdminUsage() {
  const usage = useQuery(api.admin.usage);
  if (usage === undefined) return <PageLoading />;
  const capPct = usage.dailyCapUsd > 0 ? Math.min(100, (usage.spentTodayUsd / usage.dailyCapUsd) * 100) : 0;
  return (
    <>
      <div className="stat-grid section">
        <div className="stat">
          <span className="stat-label">Paid AI today</span>
          <span className="stat-value">{formatMoney(usage.spentTodayUsd, "USD")}</span>
          <span className="stat-note">{usage.dailyCapUsd > 0 ? `of ${formatMoney(usage.dailyCapUsd, "USD")} cap (${capPct.toFixed(0)}%)` : "Paid AI is off"}</span>
        </div>
        {Object.entries(usage.byCapability).map(([capability, calls]) => (
          <div key={capability} className="stat">
            <span className="stat-label capitalize">{capability}</span>
            <span className="stat-value">{calls}</span>
            <span className="stat-note">calls, 24 h</span>
          </div>
        ))}
      </div>
      <section className="section">
        <h2 className="section-title">Providers (last 24 h)</h2>
        {usage.providers.length === 0 ? (
          <Empty title="No AI calls yet" />
        ) : (
          <div className="list-card">
            {usage.providers.map((p) => (
              <div key={p.provider} className="list-row">
                <div className="list-main">
                  <div className="list-title capitalize">{p.provider}</div>
                  <div className="list-sub">
                    {p.calls} calls · {p.failed} failed ({p.calls ? Math.round((p.failed / p.calls) * 100) : 0}%) · p95 {(p.p95Ms / 1000).toFixed(1)} s
                  </div>
                </div>
                <span className={`badge ${p.failed / Math.max(1, p.calls) > 0.2 ? "badge-danger" : "badge-good"}`}>{formatMoney(p.costUsd, "USD")}</span>
              </div>
            ))}
          </div>
        )}
        {usage.truncated && <p className="section-footer">Showing the latest 5,000 calls.</p>}
      </section>
    </>
  );
}

export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <PageLoading />;
  return (
    <div className="page">
      <PageHead title="AI usage" crumb={{ href: "/settings", label: "Settings" }} sub="Volumes, failures, latency and spend. No user content is shown here." />
      {me?.role === "admin" ? <AdminUsage /> : <Empty title="Admins only" body="Ask an admin to promote your account." />}
    </div>
  );
}
