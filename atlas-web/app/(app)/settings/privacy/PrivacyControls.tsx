"use client";

import { useCallback, useState } from "react";

/**
 * Privacy controls — two-step confirmations for every destructive action,
 * visible status via aria-live. In demo mode actions are simulated and
 * labelled; the connected flow performs them server-side with audit events.
 */

type ActionKind = "disconnect" | "export" | "wipe";

const ACTIONS: Record<ActionKind, { title: string; body: string; confirm: string; tone: "normal" | "danger" }> = {
  disconnect: {
    title: "Disconnect Google (Gmail read-only)",
    body: "Revokes provider access, deletes stored tokens, invalidates any running scan, and removes or anonymizes Gmail-derived evidence.",
    confirm: "Disconnect Google",
    tone: "normal",
  },
  export: {
    title: "Export my data",
    body: "Prepares a machine-readable copy of your wardrobe records, findings, signals, and audit trail.",
    confirm: "Prepare export",
    tone: "normal",
  },
  wipe: {
    title: "Complete data wipe",
    body: "Deletes all wardrobe assets and metadata, evidence, findings, jobs, drafts, and indexes for this account. Irreversible once confirmed.",
    confirm: "Yes, delete everything",
    tone: "danger",
  },
};

function ActionCard({ kind }: { kind: ActionKind }) {
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState("");
  const spec = ACTIONS[kind];

  const run = useCallback(() => {
    setArmed(false);
    setStatus(
      kind === "export"
        ? "Export prepared (demo) — in the connected flow you would receive a download link."
        : `${spec.title} completed (demo) — the connected flow performs this server-side with an audit event.`,
    );
  }, [kind, spec.title]);

  return (
    <article className={`privacy-card ${spec.tone === "danger" ? "privacy-danger" : ""}`}>
      <h2>{spec.title}</h2>
      <p>{spec.body}</p>
      <div className="privacy-actions">
        {armed ? (
          <>
            <span className="confirm-question" aria-live="polite">
              Are you sure?
            </span>
            <button
              type="button"
              className={spec.tone === "danger" ? "btn-danger" : "btn-primary"}
              onClick={run}
            >
              {spec.confirm}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setArmed(false)}>
              Keep everything
            </button>
          </>
        ) : (
          <button
            type="button"
            className={spec.tone === "danger" ? "btn-danger-outline" : "btn-secondary"}
            onClick={() => setArmed(true)}
          >
            {spec.title}
          </button>
        )}
      </div>
      {status ? (
        <p className="privacy-status" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </article>
  );
}

export function PrivacyControls() {
  return (
    <>
      <p className="privacy-demo-note" role="note">
        Demo mode — controls are interactive but no server state changes. The
        connected flow binds every action to your authenticated account.
      </p>
      <div className="privacy-stack">
        <ActionCard kind="disconnect" />
        <ActionCard kind="export" />
        <ActionCard kind="wipe" />
      </div>
    </>
  );
}
