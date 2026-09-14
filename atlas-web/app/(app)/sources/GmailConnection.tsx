"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

interface GmailStatus {
  clerkConfigured: boolean;
  gmailConfigured: boolean;
  encryptionConfigured: boolean;
  scope: string;
  connection: {
    status: string;
    scopes: string[];
    accountEmail: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
  } | null;
  latestScan: {
    status: string;
    discovered: number;
    processed: number;
    skipped: number;
    deduplicated: number;
    failed: number;
  } | null;
  identity: { mode: string; label: string };
}

/**
 * Real Gmail connection + scan surface. Every state is honest: unconfigured
 * provider, missing encryption, connected, error, disconnected. The scan
 * button calls the real bounded scan; no simulated counters anywhere.
 */
export function GmailConnection() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/status", { cache: "no-store" });
      if (res.ok) {
        setStatus((await res.json()) as GmailStatus);
        setError(null);
      } else {
        setError("Could not load connection status. Retry or reload.");
      }
    } catch {
      setError("Could not load connection status. Retry or reload.");
    }
  }, []);

  const connect = useCallback(() => {
    window.location.href = "/api/gmail/connect";
  }, []);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setScanLog((prev) => [...prev, "Scan started — read-only metadata walk…"]);
    try {
      const res = await fetch("/api/gmail/scan", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        counts?: { discovered: number; processed: number; skipped: number; deduplicated: number; failed: number };
      };
      if (res.ok && data.counts) {
        const c = data.counts;
        setScanLog((prev) => [
          ...prev,
          `Scan complete: ${c.discovered} discovered · ${c.processed} processed · ${c.skipped} skipped · ${c.deduplicated} deduplicated · ${c.failed} failed`,
          "Recurring charges were promoted to Money review.",
        ]);
        void load();
      } else if (res.status === 503 && data.error === "gmail_not_configured") {
        setError("Gmail connection is not configured on this deployment. Atlas will not simulate a scan.");
      } else if (res.status === 503) {
        setError("Token encryption (ENCRYPTION_KEY) is not configured. Tokens are never stored unencrypted.");
      } else if (res.status === 409 && data.error === "gmail_not_connected") {
        setError("Connect Gmail first — there is no connection to scan.");
      } else if (res.status === 409 && data.error === "scan_already_running") {
        setError("A scan is already running. Wait for it to finish.");
      } else if (res.status === 409 && data.error === "token_invalid") {
        setError("The stored token could not be used (expired or undecryptable). Reconnect Gmail to restore scanning.");
        void load();
      } else {
        setError("Scan failed. The attempt was recorded in the audit trail.");
      }
    } catch {
      setError("Network error — the scan did not complete.");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const disconnect = useCallback(async () => {
    const ok = window.confirm(
      "Disconnect Gmail? Access is revoked at Google and all retained Gmail-derived data is deleted.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "POST" });
      if (res.ok) {
        setScanLog([]);
        void load();
      } else {
        setError("Disconnect did not complete. Retry.");
      }
    } catch {
      setError("Network error — disconnect did not complete.");
    } finally {
      setBusy(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!status) {
    return (
      <section className="gmail-panel" aria-labelledby="gmail-h">
        <h2 id="gmail-h">Gmail (read-only)</h2>
        <p className="gmail-loading" role="status">
          Loading connection status…
        </p>
        {error ? <p className="gmail-error" role="alert">{error}</p> : null}
      </section>
    );
  }

  const c = status.connection;
  const lastScan = status.latestScan;
  const connected = c?.status === "connected";

  return (
    <section className="gmail-panel" aria-labelledby="gmail-h">
      <h2 id="gmail-h">Gmail (read-only)</h2>

      <ul className="gmail-boundaries">
        <li>
          Scope: <code>{status.scope}</code> — never send, delete, archive, or
          change labels.
        </li>
        <li>
          Extraction is server-side and metadata-only: bounded fields (merchant,
          amount, cadence, dates, confidence) — no message bodies.
        </li>
        <li>
          Disconnect revokes access at Google, destroys the stored token, and
          deletes Gmail-derived evidence.
        </li>
      </ul>

      {!status.gmailConfigured ? (
        <div className="gmail-unconfigured" role="note">
          <p>
            <strong>Gmail connection is not configured on this deployment.</strong>{" "}
            Atlas will not simulate a connection. Server setup: create an OAuth
            client in Google Cloud Console, enable the Gmail API, request only{" "}
            <code>gmail.readonly</code>, register{" "}
            <code>&lt;origin&gt;/api/gmail/callback</code> as an authorized
            redirect URI, and set <code>GOOGLE_CLIENT_ID</code>,{" "}
            <code>GOOGLE_CLIENT_SECRET</code>, and <code>ENCRYPTION_KEY</code>.
          </p>
        </div>
      ) : null}

      {status.gmailConfigured && !status.encryptionConfigured ? (
        <div className="gmail-unconfigured" role="note">
          <p>
            <strong>Token encryption is not configured.</strong> Atlas will not
            store a Gmail refresh token without application-layer encryption.
            Set <code>ENCRYPTION_KEY</code> on the server.
          </p>
        </div>
      ) : null}

      <div className="gmail-connection-state">
        {c === null ? (
          <p>Not connected.</p>
        ) : (
          <p>
            {connected
              ? "Connected"
              : c.status === "error"
                ? "Connection error"
                : "Disconnected"}
            {c.accountEmail ? ` as ${c.accountEmail}` : ""}
            {c.connectedAt
              ? ` · since ${new Date(c.connectedAt).toLocaleString()}`
              : ""}
          </p>
        )}

        {status.gmailConfigured && status.encryptionConfigured ? (
          connected ? (
            <div className="gmail-actions">
              <motion.button
                type="button"
                className="btn-primary"
                onClick={scan}
                disabled={busy}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              >
                {busy ? "Scanning…" : "Scan now (bounded, read-only)"}
              </motion.button>
              <button
                type="button"
                className="btn-secondary"
                onClick={disconnect}
                disabled={busy}
              >
                Disconnect &amp; delete data
              </button>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={connect}>
              Connect Gmail
            </button>
          )
        ) : null}
      </div>

      {lastScan ? (
        <p className="gmail-last-scan">
          Last scan: {lastScan.status} · {lastScan.discovered} discovered,{" "}
          {lastScan.processed} processed, {lastScan.skipped} skipped,{" "}
          {lastScan.deduplicated} deduplicated, {lastScan.failed} failed
        </p>
      ) : null}

      {scanLog.length > 0 ? (
        <div className="scan-log" role="log" aria-live="polite">
          {scanLog.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : null}

      {error ? <p className="gmail-error" role="alert">{error}</p> : null}

      {status.identity.mode !== "clerk" ? (
        <p className="gmail-identity-note">
          Identity: {status.identity.label}. Connections are bound to this
          browser session until a real auth provider is configured.
        </p>
      ) : null}
    </section>
  );
}
