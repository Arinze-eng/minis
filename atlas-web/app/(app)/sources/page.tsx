import type { Metadata } from "next";
import { demoInbox } from "@/lib/demo/inbox";
import { ScanTerminal } from "./ScanTerminal";
import "./sources.css";

export const metadata: Metadata = {
  title: "Sources",
};

export default function SourcesPage() {
  const payload = demoInbox();
  return (
    <main id="main" className="sources-page">
      <h1>Sources</h1>
      <p className="sources-sub">
        What Atlas can access, why, and how fresh it is. Access is consented,
        read-only, and revocable from this page in the connected flow.
      </p>
      <p className="demo-note" role="note">
        {payload.demoLabel}
      </p>

      <section className="permissions-banner" aria-labelledby="perm-h">
        <h2 id="perm-h">If you connect Gmail later, exactly this is requested</h2>
        <ul>
          <li>
            Scope: <code>https://www.googleapis.com/auth/gmail.readonly</code> —
            read-only. Never send, delete, archive, or label changes.
          </li>
          <li>
            Extraction is server-side and ephemeral: only bounded fields
            (merchant, amount, cadence, dates, confidence) are kept — no full
            message bodies.
          </li>
          <li>
            Disconnect revokes access, deletes stored tokens, and removes or
            anonymizes Gmail-derived evidence.
          </li>
        </ul>
      </section>

      <ScanTerminal />

      <section className="source-health" aria-labelledby="health-h">
        <h2 id="health-h">Source health</h2>
        <ul className="health-list">
          {payload.sources.map((s) => (
            <li key={s.name} className="health-row">
              <span className="health-name">{s.name}</span>
              <span className={`health-mode ${s.connected ? "health-on" : "health-off"}`}>
                {s.connected ? "demo-connected" : "not connected"}
              </span>
              <span className="health-detail">{s.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
