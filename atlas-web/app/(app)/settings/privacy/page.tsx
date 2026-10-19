"use client";

import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHead, PageLoading, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";

const SCOPES: Record<string, { title: string; detail: string }> = {
  garment_image_analysis: { title: "Analyse clothing photos", detail: "Find and tag pieces in photos you upload (Amazon Bedrock or Groq)." },
  person_image_use: { title: "Use my photo for try-ons", detail: "Show looks on your own photo (Amazon Bedrock). Off also disables share links." },
  gmail_read: { title: "Read Gmail receipts", detail: "Header-only scan for subscriptions and clothing receipts. Managed in Sources." },
  telegram_delivery: { title: "Telegram messages", detail: "Send the morning outfit to Telegram when connected." },
};

export default function PrivacyPage() {
  const consents = useQuery(api.consent.list);
  const setConsent = useMutation(api.consent.set);
  const wipe = useAction(api.privacy.wipe);
  const convex = useConvex();
  const { run, busy } = useRun();
  const [confirmText, setConfirmText] = useState("");

  if (consents === undefined) return <PageLoading />;

  const download = () =>
    run(async () => {
      const data = await convex.query(api.privacy.exportData, {});
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `atlas-export-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      URL.revokeObjectURL(url);
    }, "Export downloaded");

  return (
    <div className="page page-narrow">
      <PageHead title="Privacy & data" crumb={{ href: "/settings", label: "Settings" }} />

      <section className="grouped">
        <h2 className="section-header">Permissions</h2>
        <ul className="grouped-list">
          {consents.map((c) => (
            <li key={c.scope}>
              <label className="check-row !px-4">
                <span className="flex-1">
                  <span className="row-title">{SCOPES[c.scope]?.title ?? c.scope}</span>
                  <span className="row-detail">{SCOPES[c.scope]?.detail}</span>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={c.granted}
                  disabled={busy || c.scope === "gmail_read"}
                  onChange={(e) => run(() => setConsent({ scope: c.scope, granted: e.target.checked }), e.target.checked ? "Allowed" : "Turned off")}
                />
              </label>
            </li>
          ))}
        </ul>
        <p className="section-footer">
          Photos, chats and email data are never sent to free AI tiers that may train on them. Every change here is recorded in your audit log.
        </p>
      </section>

      <section className="grouped">
        <h2 className="section-header">Your data</h2>
        <div className="grouped-list p-4 stack-sm">
          <p className="muted">A JSON copy of everything Atlas stores about you. Tokens and internal file ids are left out.</p>
          <button type="button" className="btn justify-self-start" disabled={busy} onClick={download}>
            <Download size={16} aria-hidden="true" /> Export my data
          </button>
        </div>
      </section>

      <section className="grouped">
        <h2 className="section-header">Delete everything</h2>
        <div className="grouped-list p-4 stack-sm">
          <p className="muted">
            Revokes Google access, then permanently deletes your wardrobe, photos, looks, try-ons, chats, findings and notifications. This can&apos;t be undone.
          </p>
          <label className="field">
            <span className="field-label">Type DELETE to confirm</span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </label>
          <button
            type="button"
            className="btn-danger justify-self-start"
            disabled={busy || confirmText !== "DELETE"}
            onClick={() => run(() => wipe({ confirm: "DELETE" }), "Everything is being deleted").then(() => setConfirmText(""))}
          >
            <Trash2 size={16} aria-hidden="true" /> Delete all my data
          </button>
        </div>
      </section>

      <p className="policy-line">
        <ShieldCheck size={14} aria-hidden="true" /> Deleting your account in the sign-in menu also removes all of this automatically.
      </p>
    </div>
  );
}
