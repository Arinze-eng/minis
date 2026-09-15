"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, TrendingDown, Shirt, RefreshCw } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { FindingRow, GarmentRow } from "@/lib/server/store";

interface StripState {
  annualizedTotal: number;
  currency: string;
  subscriptionCount: number;
  garmentCount: number;
  ownedValue: number;
  averageCPW: number | null;
  cpwGarmentCount: number;
  urgentFindings: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
    urgency: "review" | "urgent" | "normal";
  }>;
}

function cpwValue(g: GarmentRow): number | null {
  if (!g.price || g.wearCount === 0) return null;
  return g.price / g.wearCount;
}

export function CommandStrip() {
  const [state, setState] = useState<StripState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [moneyRes, wardrobeRes] = await Promise.all([
        fetch("/api/money", { cache: "no-store" }),
        fetch("/api/wardrobe", { cache: "no-store" }),
      ]);

      const moneyData = moneyRes.ok
        ? ((await moneyRes.json()) as { findings?: FindingRow[]; annualizedTotal?: number })
        : { findings: [], annualizedTotal: 0 };

      const wardrobeData = wardrobeRes.ok
        ? ((await wardrobeRes.json()) as { garments?: GarmentRow[] })
        : { garments: [] };

      const findings = moneyData.findings ?? [];
      const garments = wardrobeData.garments ?? [];

      const annualizedTotal = Number(moneyData.annualizedTotal ?? 0);
      const subscriptionCount = findings.filter(
        (f) => f.state !== "ignored" && f.annualized !== null,
      ).length;

      const confirmedGarments = garments.filter((g) => g.status === "confirmed");
      const ownedValue = confirmedGarments.reduce((s, g) => s + (g.price ?? 0), 0);

      const cpwItems = confirmedGarments
        .map((g) => cpwValue(g))
        .filter((v): v is number => v !== null);
      const averageCPW =
        cpwItems.length > 0 ? cpwItems.reduce((s, v) => s + v, 0) / cpwItems.length : null;

      const urgentFindings = findings
        .filter((f) => f.state === "active" && (f.trialEnd ?? f.nextRenewal))
        .slice(0, 3)
        .map((f) => ({
          id: f.id,
          title: `${f.merchant}${f.trialEnd ? " — trial ending" : " — renewing soon"}`,
          detail: f.trialEnd
            ? `Trial ends ${new Date(f.trialEnd).toLocaleDateString()}`
            : `Renews ${new Date(f.nextRenewal ?? "").toLocaleDateString()}${f.annualized ? ` · ${formatMoney(Number(f.annualized), f.currency)}/yr` : ""}`,
          href: "/money",
          urgency: f.trialEnd ? ("urgent" as const) : ("review" as const),
        }));

      setState({
        annualizedTotal,
        currency: "USD",
        subscriptionCount,
        garmentCount: confirmedGarments.length,
        ownedValue,
        averageCPW,
        cpwGarmentCount: cpwItems.length,
        urgentFindings,
      });
    } catch {
      /* offline — leave null */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="command-strip" aria-label="Overview">
        <div className="stat-grid strip-metrics">
          {[0, 1, 2].map((i) => (
            <div key={i} className="stat stat-skeleton" aria-hidden="true">
              <div className="page-loading" style={{ height: 14, width: "60%", marginBottom: 8 }} />
              <div className="page-loading" style={{ height: 28, width: "40%" }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!state) return null;

  return (
    <section className="command-strip" aria-label="Overview">
      <div className="stat-grid strip-metrics">
        <article className="stat">
          <span className="stat-top">
            <span className="stat-label">
              <span className="stat-dot stat-dot-alert" aria-hidden="true" />
              Subscription cost / year
            </span>
            <TrendingDown size={14} className="stat-icon-muted" aria-hidden="true" />
          </span>
          <span className="stat-value">
            {formatMoney(state.annualizedTotal, state.currency)}
          </span>
          <span className="stat-note">
            {state.subscriptionCount} active finding{state.subscriptionCount !== 1 ? "s" : ""} tracked
          </span>
        </article>

        <article className="stat">
          <span className="stat-top">
            <span className="stat-label">
              <span className="stat-dot stat-dot-good" aria-hidden="true" />
              Avg. cost per wear
            </span>
            <Shirt size={14} className="stat-icon-muted" aria-hidden="true" />
          </span>
          <span className="stat-value">
            {state.averageCPW !== null ? formatMoney(state.averageCPW, "USD") : "—"}
          </span>
          <span className="stat-note">
            {state.cpwGarmentCount > 0
              ? `${state.cpwGarmentCount} garment${state.cpwGarmentCount !== 1 ? "s" : ""} with wear data`
              : "Log wears to see this"}
          </span>
        </article>

        <article className="stat">
          <span className="stat-top">
            <span className="stat-label">
              <span className="stat-dot stat-dot-accent" aria-hidden="true" />
              Wardrobe value
            </span>
            <Shirt size={14} className="stat-icon-muted" aria-hidden="true" />
          </span>
          <span className="stat-value">
            {formatMoney(state.ownedValue, "USD")}
          </span>
          <span className="stat-note">
            {state.garmentCount} confirmed piece{state.garmentCount !== 1 ? "s" : ""}
          </span>
        </article>
      </div>

      {state.urgentFindings.length > 0 && (
        <div className="urgent-ribbon" role="list" aria-label="Time-sensitive items">
          {state.urgentFindings.map((u) => (
            <Link
              key={u.id}
              role="listitem"
              href={u.href}
              className={`urgent-item urgency-${u.urgency}`}
            >
              <AlertTriangle size={14} aria-hidden="true" className="urgent-icon" />
              <span className="urgent-title">{u.title}</span>
              <span className="urgent-detail">{u.detail}</span>
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void load()}
        className="strip-refresh"
        aria-label="Refresh overview"
      >
        <RefreshCw size={12} aria-hidden="true" />
        Refresh
      </button>
    </section>
  );
}
