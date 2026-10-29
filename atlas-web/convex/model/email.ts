/**
 * Deterministic, metadata-only extraction (ported from atlas-web lib/server/emailExtraction.ts).
 * Only subject, sender and date are read — never message bodies. Pure functions, unit-tested.
 */

export const EXTRACTION_VERSION = "2026-10.1";

const PROVIDER_HOSTS = new Set(["gmail.com", "googlemail.com", "google.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"]);
const CURRENCY: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₦": "NGN" };
const CADENCE: [RegExp, string][] = [
  [/\bper month\b|\bmonthly\b|\/\s*mo(nth)?\b/i, "monthly"],
  [/\bper year\b|\bannually\b|\bannual\b|\/\s*(yr|year)\b/i, "yearly"],
  [/\bper week\b|\bweekly\b|\/\s*(wk|week)\b/i, "weekly"],
];

/** Clothing retailers for receipts → wardrobe suggestions. Lower-case, matched on merchant name. */
const CLOTHING_MERCHANTS = [
  "zara", "uniqlo", "asos", "h&m", "hm", "nike", "adidas", "gap", "mango", "cos", "arket", "everlane", "levi",
  "shein", "zalando", "nordstrom", "primark", "jd sports", "new balance", "lululemon", "aritzia", "massimo dutti",
  "next", "marks & spencer", "m&s", "abercrombie", "hollister", "urban outfitters", "pull&bear", "bershka",
  "reebok", "puma", "converse", "vans", "farfetch", "ssense", "net-a-porter", "boohoo", "prettylittlething",
];

export type ExtractedFinding = {
  kind: "trial_notice" | "recurring_charge" | "renewal_notice" | "receipt";
  merchant: string;
  amount?: number;
  currency?: string;
  cadence?: string;
  nextRenewal?: number;
  messageRef: string;
  snippet: string;
  confidence: number;
  occurredAt?: number;
  clothing: boolean;
};

export function merchantFromHeaders(headers: Record<string, string>): string | null {
  const from = headers.from ?? "";
  const display = from.match(/^"?([^"<]+?)"?\s*</)?.[1]?.trim();
  if (display && display.length >= 2 && !/^(no[-.]?reply|donotreply|mailer|notifications?)$/i.test(display)) {
    return display.slice(0, 60);
  }
  const addr = from.match(/<?([\w.+-]+)@([\w.-]+)>?/);
  if (!addr) return null;
  const domain = addr[2]!.toLowerCase();
  const root = domain.split(".").slice(-2).join(".");
  if (PROVIDER_HOSTS.has(root) || PROVIDER_HOSTS.has(domain)) return null;
  const brand = root.split(".")[0]!;
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function amountOf(subject: string): { amount: number; currency: string; cadence?: string } | null {
  const m = subject.match(/([$€£¥₹₦])\s?(\d[\d.,]*)(?:\s*\/\s*(mo|month|yr|year|wk|week))?/i);
  if (!m) return null;
  // A separator followed by exactly two final digits is the decimal point; every other one groups thousands.
  const raw = m[2]!.replace(/[.,]$/, "");
  const decimal = raw.match(/[.,](\d{2})$/);
  const amount = Number(`${(decimal ? raw.slice(0, -3) : raw).replace(/[.,]/g, "")}${decimal ? `.${decimal[1]}` : ""}`);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = m[3]?.toLowerCase();
  const cadence = unit ? (unit.startsWith("mo") ? "monthly" : unit.startsWith("y") ? "yearly" : "weekly") : undefined;
  return { amount, currency: CURRENCY[m[1]!] ?? "USD", cadence };
}

export function dateIn(subject: string, now = Date.now()): number | undefined {
  const iso = subject.match(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b/);
  if (iso) {
    const t = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (!Number.isNaN(t)) return t;
  }
  const named = subject.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (!named) return undefined;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[1]!.toLowerCase().slice(0, 3));
  const day = Number(named[2]);
  if (month < 0 || day < 1 || day > 31) return undefined;
  let year = new Date(now).getUTCFullYear();
  if (Date.UTC(year, month, day) < now - 86_400_000) year += 1;
  return Date.UTC(year, month, day);
}

/** Whole-word match, so "Next" matches "Next Retail" but not "Nextdoor". */
export function isClothingMerchant(merchant: string): boolean {
  const name = ` ${merchant.toLowerCase().replace(/[^a-z0-9&-]+/g, " ")} `;
  return CLOTHING_MERCHANTS.some((m) => name.includes(` ${m} `));
}

export function extractFinding(input: { messageId: string; headers: Record<string, string>; occurredAt?: number; now?: number }): ExtractedFinding | null {
  const subject = (input.headers.subject ?? "").slice(0, 200);
  if (!subject) return null;
  // Marketing ("₦3,000 OFF your order", "20% off") is not a purchase.
  if (/\d\s*%|\boff\b|\b(sale|discount|coupon|promo(tion)?|deal)s?\b/i.test(subject)) return null;
  const merchant = merchantFromHeaders(input.headers);
  if (!merchant) return null;

  const money = amountOf(subject);
  const cadence = money?.cadence ?? CADENCE.find(([re]) => re.test(subject))?.[1];
  const isTrial = /\btrial\b/i.test(subject);
  const isRenewal = /\brenew/i.test(subject) || /\brecurring\b/i.test(subject);
  const isReceipt = /\b(receipt|invoice|order|payment|purchase)\b/i.test(subject) || Boolean(money);
  if (!money && !cadence && !isTrial && !isRenewal && !isReceipt) return null;

  const kind: ExtractedFinding["kind"] = isTrial
    ? "trial_notice"
    : (isRenewal || money) && cadence
      ? "recurring_charge"
      : isRenewal
        ? "renewal_notice"
        : "receipt";
  const nextRenewal = isRenewal || isTrial ? dateIn(subject, input.now) : undefined;

  let confidence = 0.3;
  if (money) confidence += 0.25;
  if (cadence) confidence += 0.2;
  if (nextRenewal) confidence += 0.15;
  if (isTrial || isRenewal) confidence += 0.1;

  return {
    kind,
    merchant,
    amount: money?.amount,
    currency: money?.currency,
    cadence,
    nextRenewal,
    messageRef: input.messageId,
    snippet: subject.slice(0, 120),
    confidence: Math.round(Math.min(0.9, confidence) * 100) / 100,
    occurredAt: input.occurredAt,
    clothing: kind === "receipt" && isClothingMerchant(merchant),
  };
}
