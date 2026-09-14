"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, ShieldCheck, Clock, MapPin, AlertCircle } from "lucide-react";
import Link from "next/link";
import { RouteMark } from "@/components/RouteMark";

/**
 * Ask Atlas. The server returns either a deterministic proposal from the
 * user's confirmed wardrobe or an honest no-candidate/unavailable state —
 * this surface never fabricates a response locally (product contract §7).
 */

interface AskResponse {
  capability?: "prepare" | "advise";
  title?: string;
  implication?: string;
  pieces?: string[];
  evidence?: string[];
  boundaries?: string[];
  error?: string;
  message?: string;
}

export default function AskAtlasPage() {
  const [requestText, setRequestText] = useState("");
  const [occasion, setOccasion] = useState("");
  const [location, setLocation] = useState("Local");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [responseResult, setResponseResult] = useState<AskResponse | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestText.trim()) return;
    setIsSubmitting(true);
    setResponseResult(null);
    setRequestFailed(false);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: occasion ? `${requestText} (${occasion})` : requestText,
          location,
        }),
      });

      if (res.ok) {
        setResponseResult((await res.json()) as AskResponse);
      } else {
        // Real failure (auth, store unavailable) — surface it, never fake it.
        setRequestFailed(true);
      }
    } catch {
      setRequestFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--atlas-lilac)]">
          <RouteMark className="w-4 h-4" />
          <span>Ask Atlas · Bounded Agent Query</span>
        </div>
        <h1 className="text-3xl font-display font-semibold tracking-tight text-[var(--atlas-ink)]">
          What deserves your attention next?
        </h1>
        <p className="text-sm text-[var(--atlas-ink)]/70 max-w-xl">
          Atlas prepares the next move from evidence it actually holds: your
          confirmed wardrobe. It proposes — you decide.
        </p>
      </div>

      <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase text-[var(--atlas-ink)]/70 mb-2" htmlFor="ask-prompt">
              Your Request
            </label>
            <textarea
              id="ask-prompt"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="e.g. Recommend an outfit for an afternoon coffee meeting in London (18°C clear)…"
              rows={4}
              className="w-full rounded-lg border border-[var(--atlas-line)] bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--atlas-lime)] text-[var(--atlas-ink)]"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-[var(--atlas-ink)]/70 mb-1" htmlFor="ask-occasion">
                Occasion / Vibe (Optional)
              </label>
              <input
                id="ask-occasion"
                type="text"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="Smart Casual, Client Dinner, Travel"
                className="w-full rounded-lg border border-[var(--atlas-line)] bg-background px-3 py-2 text-sm text-[var(--atlas-ink)]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-[var(--atlas-ink)]/70 mb-1" htmlFor="ask-location">
                Location Context
              </label>
              <input
                id="ask-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="London, UK or Local"
                className="w-full rounded-lg border border-[var(--atlas-line)] bg-background px-3 py-2 text-sm text-[var(--atlas-ink)]"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-[var(--atlas-ink)]/60">
              <ShieldCheck className="w-4 h-4 text-[var(--atlas-lime)]" />
              <span>Atlas policy active · No unauthorized side effects</span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !requestText.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--atlas-lime)] text-[var(--atlas-graphite)] font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>Evaluating context...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Ask Atlas</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {requestFailed && (
        <div className="border border-[var(--atlas-amber)]/40 bg-[var(--atlas-amber)]/10 rounded-xl p-5 flex gap-3" role="alert">
          <AlertCircle className="w-5 h-5 text-[var(--atlas-amber)] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[var(--atlas-ink)]">Atlas could not complete that request.</p>
            <p className="text-xs text-[var(--atlas-ink)]/70 mt-1">
              The request failed server-side (authentication or store
              unavailable). Nothing was invented in its place — try again.
            </p>
          </div>
        </div>
      )}

      {responseResult?.error === "no_candidate" && (
        <div className="border border-[var(--atlas-amber)]/40 bg-[var(--atlas-amber)]/10 rounded-xl p-5 flex gap-3" role="status">
          <AlertCircle className="w-5 h-5 text-[var(--atlas-amber)] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[var(--atlas-ink)]">Nothing to propose yet — honestly.</p>
            <p className="text-xs text-[var(--atlas-ink)]/70 mt-1">{responseResult.message}</p>
            <Link href="/wardrobe/add" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--atlas-ink)] hover:underline mt-2">
              Add your first garment <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {responseResult && !responseResult.error && (
        <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--atlas-line)] pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-[var(--atlas-lime)]/20 text-[var(--atlas-graphite)] font-semibold">
                {responseResult.capability || "prepare"}
              </span>
              <h2 className="text-lg font-display font-semibold text-[var(--atlas-ink)]">
                {responseResult.title}
              </h2>
            </div>
            <span className="text-xs font-mono text-[var(--atlas-ink)]/60">Just now</span>
          </div>

          <p className="text-sm text-[var(--atlas-ink)]">{responseResult.implication}</p>

          {responseResult.pieces && (
            <div className="bg-background border border-[var(--atlas-line)] rounded-lg p-4 space-y-2">
              <div className="text-xs font-mono uppercase text-[var(--atlas-ink)]/60">From your confirmed wardrobe</div>
              <div className="flex flex-wrap gap-2">
                {responseResult.pieces.map((g, i) => (
                  <span key={i} className="px-2.5 py-1 rounded bg-[var(--atlas-paper)] border border-[var(--atlas-line)] text-xs font-medium text-[var(--atlas-ink)]">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-[var(--atlas-ink)]/60">Supporting Evidence</div>
            <ul className="text-xs text-[var(--atlas-ink)]/80 space-y-1 list-disc list-inside">
              {responseResult.evidence?.map((ev, idx) => (
                <li key={idx}>{ev}</li>
              ))}
            </ul>
          </div>

          {responseResult.boundaries && (
            <div className="space-y-1">
              <div className="text-xs font-mono uppercase text-[var(--atlas-ink)]/60">What Atlas did not do</div>
              <ul className="text-xs text-[var(--atlas-ink)]/70 space-y-1">
                {responseResult.boundaries.map((b, idx) => (
                  <li key={idx}>· {b}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t border-[var(--atlas-line)] flex items-center justify-end text-xs">
            <Link
              href="/looks"
              className="inline-flex items-center gap-1 text-[var(--atlas-ink)] hover:underline font-medium"
            >
              <span>View in Outfit Planner</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
