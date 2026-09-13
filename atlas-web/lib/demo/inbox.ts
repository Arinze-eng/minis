import type { AtlasInboxPayload, SignalCard } from "@/lib/atlas";

/**
 * Synthetic demo inbox — deterministic and clearly labelled.
 *
 * Rules (product contract §7): demo data is never presented as private user
 * data; timestamps are generated relative to "now" so freshness states render
 * realistically; the payload always carries mode="demo" and a label the UI
 * must render.
 */

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function hoursAhead(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

const cards: SignalCard[] = [
  {
    id: "demo-renewal-rental",
    title: "Your rental rotation renews tomorrow",
    implication:
      "Two wears logged in 30 days against a recurring charge — a review opportunity, not a verdict.",
    noticed:
      "A renewal message and a recurring charge line up on the same day.",
    urgency: "review",
    domains: ["money", "wardrobe"],
    sources: [
      { name: "Gmail (read-only)", retrievedAt: hoursAgo(3), freshness: "fresh" },
      { name: "Transactions (sandbox)", retrievedAt: hoursAgo(6), freshness: "fresh" },
      { name: "Wear log", retrievedAt: hoursAgo(48), freshness: "fresh" },
    ],
    uncertainty: 0.35,
    primaryAction: { label: "Review the renewal", kind: "review" },
    capability: "prepare",
    evidence: [
      { label: "Recurring charge", detail: "$29.00/month, next on the renewal date" },
      { label: "Renewal message", detail: "Subject received from the merchant (snippet only)" },
      { label: "Wear events", detail: "2 confirmed wears in the last 30 days" },
    ],
    createdAt: hoursAgo(2),
  },
  {
    id: "demo-price-change",
    title: "A subscription price changed this cycle",
    implication:
      "The annualized cost is higher than the last cycle; confirm the new cadence assumption.",
    noticed: "The same merchant charged a different amount than prior cycles.",
    urgency: "normal",
    domains: ["money"],
    sources: [
      { name: "Transactions (sandbox)", retrievedAt: hoursAgo(9), freshness: "fresh" },
    ],
    uncertainty: 0.45,
    primaryAction: { label: "Compare cycles", kind: "review" },
    capability: "advise",
    evidence: [
      { label: "Prior amount", detail: "$11.99/month (3 cycles)" },
      { label: "New amount", detail: "$13.99/month (this cycle)" },
    ],
    createdAt: hoursAgo(8),
  },
  {
    id: "demo-garment-confirmation",
    title: "One garment is waiting for your confirmation",
    implication:
      "The suggested tags need your eyes before the piece joins outfit planning.",
    noticed: "An uploaded item has model-suggested attributes, unconfirmed.",
    urgency: "normal",
    domains: ["wardrobe"],
    sources: [
      { name: "Wardrobe", retrievedAt: hoursAgo(26), freshness: "fresh" },
    ],
    uncertainty: 0.2,
    primaryAction: { label: "Confirm tags", kind: "open" },
    capability: "prepare",
    evidence: [
      { label: "Suggested", detail: "Category: top · warmth 2/3 · formality 2/3" },
      { label: "Provenance", detail: "Model suggestion — not yet user-confirmed" },
    ],
    createdAt: hoursAgo(26),
  },
  {
    id: "demo-weather-context",
    title: "Rain likely where your errands are planned",
    implication:
      "Weather-aware outfit candidates can favor the water-ready outer layer.",
    noticed: "The forecast shows showers during your planned window.",
    urgency: "normal",
    domains: ["wardrobe", "general"],
    sources: [
      { name: "Weather", retrievedAt: hoursAgo(1), freshness: "fresh" },
    ],
    uncertainty: 0.5,
    primaryAction: { label: "Plan around it", kind: "ask" },
    capability: "advise",
    evidence: [
      { label: "Forecast", detail: "Showers likely, high chance of precipitation" },
    ],
    createdAt: hoursAgo(1),
  },
];

export function demoInbox(): AtlasInboxPayload {
  return {
    mode: "demo",
    demoLabel: "Demo mode — synthetic data, nothing here is private or live",
    cards,
    sources: [
      { name: "Gmail (read-only)", connected: false, mode: "demo", detail: "Not connected — synthetic summaries only" },
      { name: "Transactions (sandbox)", connected: false, mode: "demo", detail: "Sandbox fixtures, labelled everywhere" },
      { name: "Wardrobe", connected: true, mode: "demo", detail: "Local demo wardrobe on this device" },
      { name: "Weather", connected: false, mode: "demo", detail: "Sample snapshot" },
    ],
    quietHours: { enabled: false, from: "22:00", to: "07:00" },
  };
}

export { hoursAgo, hoursAhead };
