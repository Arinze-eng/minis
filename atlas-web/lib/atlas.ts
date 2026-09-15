/**
 * Atlas wire types at the browser boundary.
 *
 * These mirror the backend's ``nanobot/atlas/contracts.py`` shapes that the
 * Atlas WebUI consumes. Policy is never evaluated in the browser: these are
 * presentation projections of server decisions, plus explicit states so the
 * UI can never mistake synthetic demo data for live provider data.
 */

export type DataSourceMode = "demo" | "connected";

export type SignalUrgency = "normal" | "review" | "urgent";

export type AtlasCapabilityStatement = "advise" | "prepare";

/** One evidence-backed Signal Card (the core Atlas product object). */
export interface SignalCard {
  id: string;
  title: string;
  implication: string;
  /** What Atlas noticed, in one plain-language sentence. */
  noticed: string;
  urgency: SignalUrgency;
  domains: Array<"money" | "wardrobe" | "tasks" | "email" | "general">;
  sources: Array<{
    name: string;
    retrievedAt: string;
    freshness: "fresh" | "stale" | "provider_unavailable";
  }>;
  /** 0..1; rendered as a soft gap in the route motif, never a certainty % */
  uncertainty: number;
  primaryAction: {
    label: string;
    kind: "review" | "open" | "ask";
  };
  capability: AtlasCapabilityStatement;
  evidence: Array<{
    label: string;
    detail: string;
  }>;
  createdAt: string;
}

export interface SignalStateChange {
  signalId: string;
  state: "active" | "snoozed" | "dismissed" | "paused";
  until?: string;
}

export interface SourceHealth {
  name: string;
  connected: boolean;
  mode: DataSourceMode;
  detail: string;
}

export interface DemoSeedMeta {
  mode: "demo";
  label: string;
}

/** The demo inbox payload: synthetic, labelled, deterministic. */
export interface AtlasInboxPayload {
  mode: DataSourceMode;
  demoLabel?: string;
  cards: SignalCard[];
  sources: SourceHealth[];
  quietHours: { enabled: boolean; from: string; to: string };
}

export function isSnoozeUntil(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
