import type { AgentNotification } from "@/lib/notifications";
import type { Garment } from "@/lib/wardrobe";
import { demoWardrobe } from "@/lib/demo/wardrobe";

/**
 * Demo agent state: the morning briefing payload and the notification
 * feed. Deterministic, labelled, mirrors the connected contract shapes.
 */

export interface WeatherChip {
  condition: string;
  temperatureC: number;
  precipitationChance: number;
  observedAt: string;
  /** Labelling honesty: sample snapshot, not a live forecast, in demo. */
  source: string;
}

export interface Briefing {
  greetingName: string;
  weather: WeatherChip;
  suggestion: {
    headline: string;
    garmentIds: string[];
    reason: string;
  };
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function hoursAhead(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

export function demoBriefing(): Briefing {
  const wardrobe = demoWardrobe();
  const ids = ["demo-merino-knit", "demo-pleated-trouser", "demo-retro-runner"];
  const names = ids
    .map((id) => wardrobe.garments.find((g) => g.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return {
    greetingName: "there",
    weather: {
      condition: "Overcast, light breeze",
      temperatureC: 14,
      precipitationChance: 35,
      observedAt: hoursAgo(1),
      source: "Sample snapshot (demo) — live forecast arrives with the weather connector",
    },
    suggestion: {
      headline: names.join(" + "),
      garmentIds: ids,
      reason:
        "Merino keeps the 14° morning comfortable; trousers match the overcast formality; runners ready for rain-adjacent pavement.",
    },
  };
}

/** Pure: recompute a garment's CPW after a wear is logged (no mutation here). */
export function withWearLogged(garment: Garment): Garment {
  return {
    ...garment,
    wearCount: garment.wearCount + 1,
    correctionHistory: [
      ...garment.correctionHistory,
      {
        field: "wearCount",
        from: String(garment.wearCount),
        to: String(garment.wearCount + 1),
        by: "user_confirmed",
        at: new Date().toISOString(),
      },
    ],
  };
}

export function demoNotifications(): AgentNotification[] {
  return [
    {
      id: "notif-trial-cloudnest",
      category: "renewals",
      title: "CloudNest trial ends in 48h",
      detail: "$9.99/mo starts unless you cancel. Sandbox fixture (demo).",
      action: { kind: "link", label: "Review in Money", href: "/money" },
      createdAt: hoursAgo(2),
      read: false,
      urgency: "urgent",
    },
    {
      id: "notif-trial-streamly",
      category: "renewals",
      title: "Streamly price changed to $13.99/mo",
      detail: "Up from $11.99 last cycle. Confirm the new annualized cost.",
      action: { kind: "link", label: "Review in Money", href: "/money" },
      createdAt: hoursAgo(8),
      read: false,
      urgency: "review",
    },
    {
      id: "notif-unworn-overshirt",
      category: "closet",
      title: "Utility Overshirt hasn't been worn in 45 days",
      detail: "Low rotation against its price — pair it into a look or plan to rotate it in.",
      action: { kind: "link", label: "Pair into a look", href: "/looks" },
      createdAt: hoursAhead(0),
      read: false,
      urgency: "normal",
    },
    {
      id: "notif-cpw-runner",
      category: "closet",
      title: "Retro Runner under $4 per wear",
      detail: "31 confirmed wears brought cost-per-wear to $3.55 — a healthy signal.",
      action: { kind: "link", label: "See the wardrobe", href: "/wardrobe?category=shoes" },
      createdAt: hoursAgo(26),
      read: true,
      urgency: "normal",
    },
    {
      id: "notif-scan-complete",
      category: "system",
      title: "Nightly leak audit finished (demo)",
      detail: "24 items discovered · 19 processed · 2 deduplicated. Results in Money.",
      action: { kind: "link", label: "Open Money review", href: "/money" },
      createdAt: hoursAgo(11),
      read: true,
      urgency: "normal",
    },
  ];
}
