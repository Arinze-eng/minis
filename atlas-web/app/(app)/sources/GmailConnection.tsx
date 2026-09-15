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
        counts?: {
          discovered: number;
          processed: number;
          skipped: number;
          deduplicated: number;
          failed: number;
        };
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
        setError(
          "Gmail connection is not configured on this deployment. Atlas will not simulate a scan.",
        );
      } else if (res.status === 503) {
        setError(
          "Token encryption (ENCRYPTION_KEY) is not configured. Tokens are never stored unencrypted.",
        );
      } else if (res.status === 409 && data.error === "gmail_not_connected") {
        setError("Connect Gmail first — there is no connection to scan.");
      } else if (res.status === 409 && data.error === "scan_already_running") {
        setError("A scan is already running. Wait for it to finish.");
      } else if (res.status === 409 && data.error === "token_invalid") {
        setError(
          "The stored token could not be used (expired or undecryptable). Reconnect Gmail to restore scanning.",
        );
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

  /* ── Loading state ───────────────────────────────────────────────────── */
  if (!status) {
    return (
      <section
        className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[var(--shadow-card)] px-6 py-5 mb-6"
        aria-labelledby="gmail-h"
      >
        <h2
          id="gmail-h"
          className="text-[1.05rem] font-bold text-[var(--color-ink)] mb-3"
        >
          Gmail (read-only)
        </h2>
        <p
          className="text-[0.9rem] text-[var(--color-ink-muted)] animate-pulse"
          role="status"
        >
          Loading connection status…
        </p>
        {error ? (
          <p
            className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_40%,transparent)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-[0.88rem] px-4 py-3"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const c = status.connection;
  const lastScan = status.latestScan;
  const connected = c?.status === "connected";

  return (
    <section
      className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[var(--shadow-card)] px-6 py-5 mb-6"
      aria-labelledby="gmail-h"
    >
      <h2
        id="gmail-h"
        className="text-[1.05rem] font-bold text-[var(--color-ink)] mb-3"
      >
        Gmail (read-only)
      </h2>

      {/* ── Boundaries ────────────────────────────────────────────────── */}
      <ul className="list-disc pl-5 grid gap-1.5 text-[0.88rem] text-[var(--color-ink-muted)] mb-4">
        <li>
          Scope:{" "}
          <code className="text-[0.82rem] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] rounded px-1.5 py-px">
            {status.scope}
          </code>{" "}
          — never send, delete, archive, or change labels.
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

      {/* ── Unconfigured notices ──────────────────────────────────────── */}
      {!status.gmailConfigured ? (
        <div
          className="rounded-xl border border-[color-mix(in_srgb,var(--color-alert)_40%,transparent)] bg-[var(--color-alert-soft)] px-4 py-3 mb-4 text-[0.9rem] text-[var(--color-ink)]"
          role="note"
        >
          <p className="m-0">
            <strong>Gmail connection is not configured on this deployment.</strong>{" "}
            Atlas will not simulate a connection. Server setup: create an OAuth
            client in Google Cloud Console, enable the Gmail API, request only{" "}
            <code className="text-[0.82rem] bg-[color-mix(in_srgb,var(--color-alert)_20%,transparent)] rounded px-1 py-px">
              gmail.readonly
            </code>
            , register{" "}
            <code className="text-[0.82rem] bg-[color-mix(in_srgb,var(--color-alert)_20%,transparent)] rounded px-1 py-px">
              &lt;origin&gt;/api/gmail/callback
            </code>{" "}
            as an authorized redirect URI, and set{" "}
            <code className="text-[0.82rem] bg-[color-mix(in_srgb,var(--color-alert)_20%,transparent)] rounded px-1 py-px">
              GOOGLE_CLIENT_ID
            </code>
            ,{" "}
            <code className="text-[0.82rem] bg-[color-mix(in_srgb,var(--color-alert)_20%,transparent)] rounded px-1 py-px">
              GOOGLE_CLIENT_SECRET
            </code>
            , and{" "}
            <code className="text-[0.82rem] bg-[color-mix(in_srgb,var(--color-alert)_20%,transparent)] rounded px-1 py-px">
              ENCRYPTION_KEY
            </code>
            .
          </p>
        </div>
      ) : null}

      {status.gmailConfigured && !status.encryptionConfigured ? (
        <div
          className="rounded-xl border border-[color-mix(in_srgb,var(--color-alert)_40%,transparent)] bg-[var(--color-alert-soft)] px-4 py-3 mb-4 text-[0.9rem] text-[var(--color-ink)]"
          role="note"
        >
          <p className="m-0">
            <strong>Token encryption is not configured.</strong> Atlas will not
            store a Gmail refresh token without application-layer encryption.
            Set{" "}
            <code className="text-[0.82rem] bg-[color-mix(in_srgb,var(--color-alert)_20%,transparent)] rounded px-1 py-px">
              ENCRYPTION_KEY
            </code>{" "}
            on the server.
          </p>
        </div>
      ) : null}

      {/* ── Connection state + actions ────────────────────────────────── */}
      <div className="mb-4">
        {c === null ? (
          <p className="flex items-center gap-2 text-[0.9rem] text-[var(--color-ink-muted)] mb-3">
            <span className="w-2 h-2 rounded-full bg-[var(--color-ink-muted)] shrink-0" />
            Not connected.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-[0.9rem] text-[var(--color-ink)] mb-3">
            <span
              className={[
                "w-2 h-2 rounded-full shrink-0",
                connected
                  ? "bg-[var(--color-good)]"
                  : "bg-[var(--color-danger)]",
              ].join(" ")}
            />
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
            <div className="flex flex-wrap gap-3">
              <motion.button
                type="button"
                className="inline-flex items-center gap-2 text-[0.9rem] font-semibold px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-deep)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
                onClick={scan}
                disabled={busy}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              >
                {busy ? "Scanning…" : "Scan now (bounded, read-only)"}
              </motion.button>
              <button
                type="button"
                className="inline-flex items-center gap-2 text-[0.9rem] font-semibold px-4 py-2 rounded-lg border border-[var(--color-danger)] text-[var(--color-danger)] bg-transparent hover:bg-[var(--color-danger-soft)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
                onClick={disconnect}
                disabled={busy}
              >
                Disconnect &amp; delete data
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-2 text-[0.9rem] font-semibold px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-deep)] transition-colors cursor-pointer"
              onClick={connect}
            >
              Connect Gmail
            </button>
          )
        ) : null}
      </div>

      {/* ── Last scan summary ─────────────────────────────────────────── */}
      {lastScan ? (
        <p className="text-[0.82rem] text-[var(--color-ink-muted)] font-[tabular-nums] mb-3">
          Last scan: {lastScan.status} · {lastScan.discovered} discovered,{" "}
          {lastScan.processed} processed, {lastScan.skipped} skipped,{" "}
          {lastScan.deduplicated} deduplicated, {lastScan.failed} failed
        </p>
      ) : null}

      {/* ── Scan log ─────────────────────────────────────────────────── */}
      {scanLog.length > 0 ? (
        <div
          className="font-mono text-[0.8rem] bg-[color-mix(in_srgb,var(--color-chrome)_6%,transparent)] border border-[var(--color-line)] rounded-lg px-4 py-3 max-h-48 overflow-y-auto mb-3"
          role="log"
          aria-live="polite"
        >
          {scanLog.map((line, i) => (
            <p key={i} className="m-0 mb-1 last:mb-0 text-[var(--color-ink)]">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error ? (
        <p
          className="rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_40%,transparent)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-[0.88rem] px-4 py-3 mt-2"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* ── Identity note ────────────────────────────────────────────── */}
      {status.identity.mode !== "clerk" ? (
        <p className="mt-3 text-[0.8rem] text-[var(--color-ink-muted)]">
          Identity: {status.identity.label}. Connections are bound to this
          browser session until a real auth provider is configured.
        </p>
      ) : null}
    </section>
  );
}
