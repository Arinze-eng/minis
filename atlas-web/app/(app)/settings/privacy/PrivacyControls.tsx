"use client";

import { useCallback, useState } from "react";

/**
 * Privacy controls wired to /api/privacy (server-enforced, principal-scoped,
 * audited). Export downloads the real snapshot; wipe really deletes after a
 * two-step confirmation; disconnect is disabled until a source connection
 * exists — the UI never fakes a revocation.
 */

type ActionKind = "disconnect" | "export" | "wipe";

interface ActionSpec {
  title: string;
  body: string;
  confirm: string;
  tone: "normal" | "danger";
}

const ACTIONS: Record<ActionKind, ActionSpec> = {
  disconnect: {
    title: "Disconnect Google (Gmail read-only)",
    body: "Revokes provider access, deletes stored tokens, invalidates any running scan, and removes or anonymizes Gmail-derived evidence.",
    confirm: "Disconnect Google",
    tone: "normal",
  },
  export: {
    title: "Export my data",
    body: "Downloads a machine-readable copy of your wardrobe records, findings, signals, and notifications, assembled server-side for your account only.",
    confirm: "Download export",
    tone: "normal",
  },
  wipe: {
    title: "Complete data wipe",
    body: "Deletes all wardrobe records and metadata, evidence, findings, notifications, and audit trail for this account. Irreversible once confirmed.",
    confirm: "Yes, delete everything",
    tone: "danger",
  },
};

function ActionCard({ kind }: { kind: ActionKind }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const spec = ACTIONS[kind];

  const run = useCallback(async () => {
    setArmed(false);
    setBusy(true);
    try {
      const res = await fetch("/api/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "wipe" ? { action: "wipe", confirm: true } : { action: "export" },
        ),
      });
      if (kind === "export") {
        if (!res.ok) {
          setStatus("Export failed — try again.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "atlas-export.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus("Export downloaded — it contains every record class for your account.");
        return;
      }
      if (kind === "wipe") {
        if (res.ok) {
          setStatus(
            "Wipe complete. Every record for this account is gone; derived signals will not return unless you add data again.",
          );
        } else {
          setStatus("Wipe failed — nothing was deleted. Try again.");
        }
      }
    } catch {
      setStatus(
        kind === "export"
          ? "You appear to be offline — the export could not be prepared."
          : "You appear to be offline — nothing was deleted.",
      );
    } finally {
      setBusy(false);
    }
  }, [kind]);

  const disabled = kind === "disconnect";

  return (
    <article className={`privacy-card ${spec.tone === "danger" ? "privacy-danger" : ""}`}>
      <h2>{spec.title}</h2>
      <p>{spec.body}</p>
      {kind === "disconnect" ? (
        <p className="privacy-status">
          No sources are connected to this account yet. When Gmail is connected,
          disconnect appears here and revokes provider access, deletes stored
          tokens, and clears Gmail-derived evidence — server-side.
        </p>
      ) : null}
      <div className="privacy-actions">
        {armed ? (
          <>
            <span className="confirm-question" aria-live="polite">
              Are you sure?
            </span>
            <button
              type="button"
              className={spec.tone === "danger" ? "btn-danger" : "btn-primary"}
              onClick={() => void run()}
              disabled={busy}
            >
              {busy ? "Working…" : spec.confirm}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setArmed(false)}>
              {kind === "wipe" ? "Keep everything" : "Cancel"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={spec.tone === "danger" ? "btn-danger-outline" : "btn-secondary"}
            onClick={() => setArmed(true)}
            disabled={disabled}
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
    <div className="privacy-stack">
      <ActionCard kind="disconnect" />
      <ActionCard kind="export" />
      <ActionCard kind="wipe" />
    </div>
  );
}
