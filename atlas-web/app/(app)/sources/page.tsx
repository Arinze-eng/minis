import type { Metadata } from "next";
import { principalFromCookies, principalSummary } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { GmailConnection } from "./GmailConnection";
import "./sources.css";

export const metadata: Metadata = {
  title: "Sources",
};

export default async function SourcesPage() {
  const principal = await principalFromCookies();
  const { store, mode } = getStore();
  const summary = principalSummary(principal);

  // Latest scan job for the health list (bounded: the panel shows only the
  // most recent job; full history stays in the audit trail).
  const scanJob = await store.latestScanJob(principal.userId, "gmail");

  const storeLabel =
    mode === "postgres"
      ? "Postgres (Neon) — durable, user-scoped"
      : "Local file store — dev mode, data stays on this machine";

  return (
    <main id="main" className="sources-page">
      <h1>Sources</h1>
      <p className="sources-sub">
        What Atlas can access, why, and how fresh it is. Access is consented,
        read-only, and revocable here.
      </p>
      <p className="demo-note" role="note">
        Identity: {summary.label} · Store: {storeLabel}
        {scanJob ? ` · Last Gmail scan: ${scanJob.status}` : " · No Gmail scan yet"}
      </p>

      <section className="permissions-banner" aria-labelledby="perm-h">
        <h2 id="perm-h">If you connect Gmail, exactly this is requested</h2>
        <ul>
          <li>
            Scope: <code>https://www.googleapis.com/auth/gmail.readonly</code> —
            read-only. Never send, delete, archive, or label changes.
          </li>
          <li>
            Extraction is server-side and metadata-only: bounded fields
            (merchant, amount, cadence, dates, confidence) — no full message
            bodies.
          </li>
          <li>
            Disconnect revokes at Google, destroys the stored token, and deletes
            Gmail-derived evidence.
          </li>
          <li>
            Clerk sign-in is authentication. Gmail access is a separate consent
            step — connecting your account never implies mailbox access.
          </li>
        </ul>
      </section>

      <GmailConnection />

      <section className="source-health" aria-labelledby="health-h">
        <h2 id="health-h">Source health</h2>
        <ul className="health-list">
          <li className="health-row">
            <span className="health-name">Wardrobe</span>
            <span className="health-mode health-on">local-first</span>
            <span className="health-detail">
              Your confirmed garments; images private to your account.
            </span>
          </li>
          <li className="health-row">
            <span className="health-name">Money review</span>
            <span className="health-mode health-on">deterministic</span>
            <span className="health-detail">
              Recurring-charge and price-change findings derived in the store.
            </span>
          </li>
          <li className="health-row">
            <span className="health-name">Gmail</span>
            <span className={`health-mode ${scanJob?.status === "completed" ? "health-on" : "health-off"}`}>
              {scanJob?.status === "completed" ? "connected flow available" : "not connected"}
            </span>
            <span className="health-detail">
              Read-only, consent-gated, metadata-only extraction.
            </span>
          </li>
          <li className="health-row">
            <span className="health-name">Weather</span>
            <span className="health-mode health-off">demo snapshot</span>
            <span className="health-detail">
              Labelled placeholder until a weather provider is configured.
            </span>
          </li>
        </ul>
      </section>
    </main>
  );
}
