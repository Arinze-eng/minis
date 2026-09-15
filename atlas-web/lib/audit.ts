/**
 * Money / Culture Engine types at the browser boundary (audit surfaces).
 *
 * Evidence minimization rule (threat model §6): the browser only ever sees
 * sanitized, bounded fields — merchant, cadence, amounts, dates, confidence,
 * redacted snippet. Raw email bodies and provider payloads never appear here.
 */

export type BillingCadence = "weekly" | "monthly" | "quarterly" | "annual" | "unknown";

export type FindingState = "active" | "kept" | "ignored" | "cancel_prepared";

export interface SubscriptionFinding {
  id: string;
  merchant: string;
  productName?: string;
  amount: number;
  currency: string;
  cadence: BillingCadence;
  /** Cadence must be reliable for annualization to exist (contract §5). */
  annualized?: number;
  nextRenewalDate?: string;
  trialEndDate?: string;
  priceChangedAt?: { from: number; to: number; detectedAt: string };
  state: FindingState;
  confidence: number; // 0..1
  extractionVersion: string;
  sources: Array<{
    kind: "email" | "transaction";
    /** Redacted, bounded snippet — never a full body. */
    snippet?: string;
    receivedAt?: string;
    /** Non-sensitive reference (thread/message id or transaction id). */
    reference: string;
  }>;
}

export interface MoneySummary {
  mode: "demo" | "connected";
  demoLabel?: string;
  currency: string;
  findings: SubscriptionFinding[];
  /** Annualized total only counts findings with reliable cadence. */
  annualizedTotal: number;
  cadenceAssumption: string;
  refreshedAt: string;
}

/** Annualize one finding; unknown cadence never fabricates a number. */
export function annualizedAmount(amount: number, cadence: BillingCadence): number | undefined {
  switch (cadence) {
    case "weekly":
      return amount * 52;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "annual":
      return amount;
    default:
      return undefined; // unknown cadence → explicitly unannualized
  }
}

export function summarizeMoney(findings: SubscriptionFinding[]): {
  annualizedTotal: number;
  currencyOf: string | undefined;
} {
  let total = 0;
  let currencyOf: string | undefined;
  for (const f of findings) {
    if (f.annualized !== undefined && f.state !== "ignored") {
      total += f.annualized;
      currencyOf = currencyOf ?? f.currency;
    }
  }
  return { annualizedTotal: total, currencyOf };
}

/* ---------------------------------------------------------------------------
 * Scan-job state machine (mirrors the documented backend job states)
 * ------------------------------------------------------------------------- */

export type ScanPhase =
  | "idle"
  | "pending_consent"
  | "running"
  | "complete"
  | "failed";

export interface ScanCounters {
  discovered: number;
  processed: number;
  skipped: number;
  deduplicated: number;
  failed: number;
}

export interface ScanProgress {
  phase: ScanPhase;
  counters: ScanCounters;
  /** Bounded, non-sensitive activity log lines. */
  log: string[];
}

export const INITIAL_SCAN_PROGRESS: ScanProgress = {
  phase: "idle",
  counters: { discovered: 0, processed: 0, skipped: 0, deduplicated: 0, failed: 0 },
  log: [],
};

/** Percentage complete for the radial gauge; 0 when nothing discovered yet. */
export function scanPercent(p: ScanProgress): number {
  const { discovered, processed, skipped, deduplicated, failed } = p.counters;
  if (discovered <= 0) return 0;
  const done = processed + skipped + deduplicated + failed;
  return Math.min(100, Math.round((done / discovered) * 100));
}

export function scanLogLine(message: string): string {
  const stamp = new Date().toLocaleTimeString();
  return `[${stamp}] ${message}`;
}
