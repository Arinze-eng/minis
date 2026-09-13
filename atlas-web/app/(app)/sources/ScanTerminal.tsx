"use client";

import { useCallback, useRef, useState } from "react";
import {
  INITIAL_SCAN_PROGRESS,
  scanLogLine,
  scanPercent,
  type ScanProgress,
} from "@/lib/audit";

/**
 * Scan terminal — demo projection of the documented scan-job flow:
 * idle → pending_consent → running → complete (or failed). In demo mode the
 * scan is a labelled simulation over synthetic fixtures; the connected flow
 * is server-side, consent-gated, idempotent, and never streams raw messages.
 */

const DEMO_STEPS: Array<{ message: string; patch: Partial<ScanProgress["counters"]> }> = [
  { message: "Scanning 24 recent messages…", patch: { discovered: 24 } },
  { message: "Scanned 8 — found receipt for 'Streamly' ($13.99/mo)", patch: { processed: 8 } },
  { message: "Skipped 4 newsletters (no receipt signals)", patch: { skipped: 4 } },
  { message: "Found recurring charge 'ThreadRenew' ($29.00/mo)", patch: { processed: 14 } },
  { message: "Deduplicated 2 — already in your review list", patch: { deduplicated: 2 } },
  { message: "Found trial notice 'CloudNest' (ends in 2 days)", patch: { processed: 18 } },
  { message: "1 message unreadable (malformed) — logged, no retry storm", patch: { failed: 1, processed: 19 } },
  { message: "Scan complete: 24 discovered, 19 processed, 4 skipped, 2 deduplicated, 1 failed", patch: { processed: 19, skipped: 4 } },
];

export function ScanTerminal() {
  const [progress, setProgress] = useState<ScanProgress>(INITIAL_SCAN_PROGRESS);
  const timers = useRef<number[]>([]);

  const percent = scanPercent(progress);

  const start = useCallback(() => {
    setProgress({ phase: "running", counters: { ...INITIAL_SCAN_PROGRESS.counters }, log: [scanLogLine("Consent verified (demo) — read-only scope")] });
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    let acc: ScanProgress["counters"] = { discovered: 0, processed: 0, skipped: 0, deduplicated: 0, failed: 0 };
    let delay = 300;
    for (const step of DEMO_STEPS) {
      timers.current.push(
        window.setTimeout(() => {
          acc = { ...acc, ...step.patch };
          setProgress((prev) => ({
            phase: "running",
            counters: { ...acc },
            log: [...prev.log, scanLogLine(step.message)],
          }));
        }, delay),
      );
      delay += 550;
    }
    timers.current.push(
      window.setTimeout(() => {
        setProgress((prev) => ({ ...prev, phase: "complete" }));
      }, delay),
    );
  }, []);

  const reset = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setProgress(INITIAL_SCAN_PROGRESS);
  }, []);

  return (
    <section className="scan-terminal" aria-labelledby="scan-h">
      <h2 id="scan-h">Leak audit scan</h2>

      {progress.phase === "idle" ? (
        <div className="scan-idle">
          <p>
            A scan reads recent mailbox metadata only, extracts bounded receipt
            fields, and never stores full messages. Run it in demo mode to see
            the shape of the report.
          </p>
          <button type="button" className="btn-primary" onClick={start}>
            Run demo scan
          </button>
        </div>
      ) : null}

      {progress.phase !== "idle" ? (
        <div className="scan-live">
          <div className="gauge-wrap" role="img" aria-label={`Scan ${percent} percent complete`}>
            <svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-line)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="var(--color-good)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(percent / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="66" textAnchor="middle" fontSize="22" fill="var(--color-ink)">
                {percent}%
              </text>
            </svg>
          </div>

          <div className="scan-counters" aria-label="Scan counters">
            <span>discovered {progress.counters.discovered}</span>
            <span>processed {progress.counters.processed}</span>
            <span>skipped {progress.counters.skipped}</span>
            <span>deduplicated {progress.counters.deduplicated}</span>
            <span>failed {progress.counters.failed}</span>
          </div>

          <div
            className="scan-log"
            role="log"
            aria-live="polite"
            aria-atomic="false"
          >
            {progress.log.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            {progress.phase === "complete" ? (
              <p className="scan-done">Done — results would appear in Money review (demo).</p>
            ) : null}
          </div>

          {progress.phase === "complete" ? (
            <button type="button" className="btn-secondary" onClick={reset}>
              Reset terminal
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
