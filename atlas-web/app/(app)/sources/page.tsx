"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { CheckSquare, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { JobProgress, PageHead, PageLoading, relativeTime, toast, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";

const RESULT: Record<string, [string, "good" | "bad"]> = {
  connected: ["Connected", "good"],
  denied: ["You didn't allow access, so nothing was connected.", "bad"],
  invalid_state: ["That sign-in link expired or belonged to another session. Try again.", "bad"],
  invalid_callback: ["Google returned an incomplete response. Try again.", "bad"],
  not_configured: ["Google sign-in isn't set up on this deployment yet.", "bad"],
  failed: ["Couldn't finish connecting. Try again.", "bad"],
};

const SOURCES = [
  {
    provider: "gmail" as const,
    name: "Gmail",
    icon: Mail,
    tint: "#ea4335",
    body: "Finds subscriptions, renewals, price changes and clothing receipts. Atlas reads message headers only — never bodies — and can't send or delete mail.",
  },
  {
    provider: "google_tasks" as const,
    name: "Google Tasks",
    icon: CheckSquare,
    tint: "#1a73e8",
    body: "Shows your open tasks next to everything else. Read-only.",
  },
];

function Sources() {
  const params = useSearchParams();
  const status = useQuery(api.sources.status);
  const scan = useMutation(api.sources.scanGmail);
  const disconnect = useAction(api.sources.disconnect);
  const { run, busy } = useRun();

  useEffect(() => {
    for (const { provider } of SOURCES) {
      const marker = params.get(provider);
      const result = marker ? RESULT[marker] : undefined;
      if (result) toast(result[0], result[1]);
    }
  }, [params]);

  if (status === undefined) return <PageLoading />;
  const ready = status.configured.google && status.configured.encryption;
  const scanning = status.latestScan?.status === "running";

  return (
    <>
      {!ready && (
        <div className="notice notice-warn section">
          Google connections need <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and <code>ENCRYPTION_KEY</code> on the Convex deployment.
        </div>
      )}
      <div className="stack-md">
        {SOURCES.map(({ provider, name, icon: Icon, tint, body }) => {
          const conn = status.connections.find((c) => c.provider === provider);
          const connected = conn?.status === "connected";
          return (
            <section key={provider} className="card card-pad stack-sm" aria-label={name}>
              <div className="flex items-center gap-3">
                <span className="grouped-icon" style={{ background: tint }} aria-hidden="true">
                  <Icon size={17} />
                </span>
                <h2 className="text-[17px] font-semibold flex-1">{name}</h2>
                <span className={`badge ${connected ? "badge-good" : conn?.status === "error" ? "badge-danger" : ""}`}>
                  {connected ? "Connected" : conn?.status === "error" ? "Needs attention" : "Not connected"}
                </span>
              </div>
              <p className="muted">{body}</p>
              {conn?.lastError && <p className="notice notice-warn">{conn.lastError}</p>}
              {connected && provider === "gmail" && (
                <div className="stack-sm">
                  <p className="list-sub">{conn.lastScanAt ? `Last scanned ${relativeTime(conn.lastScanAt)}` : "Not scanned yet"}</p>
                  {scanning && <JobProgress job={status.latestScan} />}
                  {status.latestScan?.status === "failed" && <p className="notice notice-warn">{status.latestScan.error ?? "The last scan failed."}</p>}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {connected ? (
                  <>
                    {provider === "gmail" ? (
                      <button type="button" className="btn-primary" disabled={busy || scanning} onClick={() => run(() => scan({}), "Scanning your inbox")}>
                        <RefreshCw size={16} className={scanning ? "spin" : undefined} aria-hidden="true" /> {scanning ? "Scanning…" : "Scan now"}
                      </button>
                    ) : (
                      <Link href="/tasks" className="btn-primary">
                        Open tasks
                      </Link>
                    )}
                    <button
                      type="button"
                      className="btn-danger-outline"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Disconnect ${name}? Atlas revokes its access at Google and deletes what it found.`)) {
                          void run(() => disconnect({ provider }), `${name} disconnected`);
                        }
                      }}
                    >
                      <Unplug size={16} aria-hidden="true" /> Disconnect
                    </button>
                  </>
                ) : (
                  // Full navigation: the route redirects to Google's consent screen.
                  <a href={`/api/oauth/${provider}/connect`} className={`btn-primary ${ready ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!ready}>
                    Connect {name}
                  </a>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="policy-line mt-6">
        <ShieldCheck size={14} aria-hidden="true" /> Tokens are encrypted at rest (AES-256-GCM) and never leave Atlas&apos;s server.
      </p>
    </>
  );
}

export default function SourcesPage() {
  return (
    <div className="page page-narrow">
      <PageHead title="Sources" crumb={{ href: "/settings", label: "Settings" }} sub="Read-only connections. Disconnecting deletes everything Atlas found." />
      <Suspense fallback={<PageLoading />}>
        <Sources />
      </Suspense>
    </div>
  );
}
