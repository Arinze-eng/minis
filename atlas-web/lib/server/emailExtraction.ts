import type { EmailFindingRow } from "./store";

/**
 * Deterministic bounded extraction (product contract §7): the ONLY fields that
 * survive a scan, derived purely from message metadata (subject, from, date).
 * No model, no body reads, no unbounded storage. Pure functions — pinned by
 * tests. Extraction version bumps whenever rules change so re-scans can
 * refresh derived fields.
 */

export const EXTRACTION_VERSION = "2026-09.1";

const PROVIDER_HOSTS = new Set([
  "gmail.com", "googlemail.com", "google.com", "outlook.com", "hotmail.com",
  "yahoo.com", "icloud.com", "noreply", "no-reply",
]);

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₦": "NGN",
};

const CADENCE_PATTERNS: [RegExp, string][] = [
  [/\bper month\b|\bmonthly\b|\/\s*mo(nth)?\b/i, "monthly"],
  [/\bper year\b|\bannually\b|\bannual\b|\/\s*(yr|year)\b/i, "yearly"],
  [/\bper week\b|\bweekly\b|\/\s*wk\b|\/\s*week\b/i, "weekly"],
];

function merchantFromHeaders(headers: Record<string, string>): string | null {
  const from = headers["from"] ?? "";
  const displayMatch = from.match(/^"?([^"<]+?)"?\s*</);
  if (displayMatch) {
    const display = displayMatch[1]!.trim();
    if (display.length >= 2 && !/^(no[-.]?reply|donotreply|mailer|notifications?)$/i.test(display)) {
      return display.slice(0, 60);
    }
  }
  const addrMatch = from.match(/<?([\w.+-]+)@([\w.-]+)>?/);
  if (!addrMatch) return null;
  const domain = addrMatch[2]!.toLowerCase();
  const root = domain.split(".").slice(-2).join(".");
  if (PROVIDER_HOSTS.has(root) || PROVIDER_HOSTS.has(domain)) return null;
  const brand = root.split(".")[0]!;
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function extractAmount(
  subject: string,
): { amount: number; currency: string; cadence: string | null } | null {
  // "$10.99/mo", "Total: $59.00", "€12,00 per month", "£9.99"
  const m = subject.match(
    /([$€£¥₹₦])\s?(\d{1,6}(?:[.,]\d{2})?)(?:\s*\/\s*(mo|month|yr|year|wk|week))?/i,
  );
  if (!m) return null;
  const currency = CURRENCY_SYMBOLS[m[1]!] ?? "USD";
  const amount = Number(m[2]!.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = m[3]?.toLowerCase();
  let cadence: string | null = null;
  if (unit) {
    if (unit.startsWith("mo")) cadence = "monthly";
    else if (unit.startsWith("y") || unit.startsWith("yea")) cadence = "yearly";
    else cadence = "weekly";
  }
  return { amount, currency, cadence };
}

function extractCadence(subject: string): string | null {
  for (const [re, cadence] of CADENCE_PATTERNS) {
    if (re.test(subject)) return cadence;
  }
  return null;
}

function extractIsoDate(subject: string): string | null {
  // ISO: 2026-09-20 (also 2026/09/20)
  const iso = subject.match(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  // "September 20" / "Sept 20" / "Sep 20" (year inferred: next occurrence)
  const named = subject.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i,
  );
  if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mi = months.indexOf(named[1]!.toLowerCase().slice(0, 3));
    const day = Number(named[2]!);
    if (mi >= 0 && day >= 1 && day <= 31) {
      const now = new Date();
      let year = now.getUTCFullYear();
      const candidate = new Date(Date.UTC(year, mi, day));
      if (candidate.getTime() < now.getTime() - 86400000) year += 1;
      return new Date(Date.UTC(year, mi, day)).toISOString();
    }
  }
  return null;
}

export interface ScanMessageInput {
  messageId: string;
  headers: Record<string, string>;
  /** ISO timestamp of the message. */
  occurredAt: string | null;
}

/**
 * Extract one bounded finding candidate from metadata. Returns null when the
 * message carries no recognizable subscription/receipt signal.
 */
export function extractFinding(msg: ScanMessageInput): Omit<EmailFindingRow, "principalId"> | null {
  const subject = (msg.headers["subject"] ?? "").slice(0, 200);
  if (!subject) return null;

  const merchant = merchantFromHeaders(msg.headers);
  if (!merchant) return null;

  const amountInfo = extractAmount(subject);
  const cadence = amountInfo?.cadence ?? extractCadence(subject);
  const isTrial = /\btrial\b/i.test(subject);
  const isRenewal = /\brenew/i.test(subject) || /\brecurring\b/i.test(subject);
  const isReceipt = /\b(receipt|invoice|order|payment)\b/i.test(subject) || Boolean(amountInfo);

  if (!amountInfo && !cadence && !isTrial && !isRenewal && !isReceipt) return null;

  let kind: string;
  if (isTrial) kind = "trial_notice";
  else if (isRenewal && cadence) kind = "recurring_charge";
  else if (isRenewal) kind = "renewal_notice";
  else if (amountInfo && cadence) kind = "recurring_charge";
  else kind = "receipt";

  const renewalRaw = isRenewal || isTrial ? extractIsoDate(subject) : null;
  const nextRenewal = renewalRaw;

  // Confidence: bounded heuristic — more corroborated fields, higher value.
  let confidence = 0.3;
  if (amountInfo) confidence += 0.25;
  if (cadence) confidence += 0.2;
  if (renewalRaw) confidence += 0.15;
  if (isTrial || isRenewal) confidence += 0.1;
  confidence = Math.min(0.9, confidence);

  const amount = amountInfo?.amount ?? null;
  const currency = amountInfo?.currency ?? null;

  const annualized =
    amount !== null && cadence !== null
      ? cadence === "monthly"
        ? amount * 12
        : cadence === "weekly"
          ? amount * 52
          : amount
      : null;

  return {
    id: `emf_${msg.messageId}`,
    kind,
    merchant,
    productName: null,
    amount,
    currency,
    cadence,
    nextRenewal,
    messageRef: msg.messageId,
    snippet: subject.slice(0, 120),
    confidence: Math.round(confidence * 100) / 100,
    extractionVersion: EXTRACTION_VERSION,
    occurredAt: msg.occurredAt,
  };
}

/** Convenience: annualized estimate shown only when both inputs exist. */
export function annualize(amount: number, cadence: string): number | null {
  if (cadence === "monthly") return amount * 12;
  if (cadence === "yearly") return amount;
  if (cadence === "weekly") return amount * 52;
  return null;
}
