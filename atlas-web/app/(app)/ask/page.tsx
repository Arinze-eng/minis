"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  AlertCircle,
} from "lucide-react";

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
    <main id="main" className="page page-narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            Ask Atlas · bounded request
          </p>
          <h1>What deserves your attention next?</h1>
          <p className="page-sub">
            Atlas prepares the next move from evidence it actually holds: your
            confirmed wardrobe. It proposes — you decide.
          </p>
        </div>
      </div>

      <div className="card card-pad">
        <form onSubmit={handleSubmit} className="form-stack">
          <div className="field">
            <label className="field-label" htmlFor="ask-prompt">
              Your request
            </label>
            <textarea
              id="ask-prompt"
              className="textarea"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="e.g. Recommend an outfit for an afternoon coffee meeting in London (18°C clear)…"
              rows={4}
              required
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="ask-occasion">
                Occasion / vibe (optional)
              </label>
              <input
                id="ask-occasion"
                className="input"
                type="text"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="Smart casual, client dinner, travel"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ask-location">
                Location context
              </label>
              <input
                id="ask-location"
                className="input"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="London, UK or Local"
              />
            </div>
          </div>

          <div className="form-submit">
            <p className="policy-line">
              <ShieldCheck size={15} aria-hidden="true" />
              Atlas policy active · no unauthorized side effects
            </p>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !requestText.trim()}
            >
              {isSubmitting ? (                <><Clock size={15} className="spin" aria-hidden="true" />
                  Evaluating context…
                </>
              ) : (
                <>
                  <Sparkles size={15} aria-hidden="true" />
                  Ask Atlas
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {requestFailed ? (
        <div className="notice notice-warn stack-md" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <p>
              <strong>Atlas could not complete that request.</strong>
            </p>
            <p className="muted">
              The request failed server-side (authentication or store
              unavailable). Nothing was invented in its place — try again.
            </p>
          </div>
        </div>
      ) : null}

      {responseResult?.error === "no_candidate" ? (
        <div className="notice notice-warn stack-md" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <p>
              <strong>Nothing to propose yet — honestly.</strong>
            </p>
            <p className="muted">{responseResult.message}</p>              <Link className="inline-link" href="/wardrobe/add">
              Add your first garment <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}

      {responseResult && !responseResult.error ? (
        <section className="card stack-md" aria-live="polite">
          <div className="card-head">
            <div className="result-head">
              <span className="badge badge-accent">
                {responseResult.capability ?? "prepare"}
              </span>
              <h2>{responseResult.title}</h2>
            </div>
            <span className="muted">Just now</span>
          </div>
          <div className="card-pad stack-md">
            <p>{responseResult.implication}</p>

            {responseResult.pieces?.length ? (
              <div className="stack-sm">
                <p className="field-label">From your confirmed wardrobe</p>
                <div className="pill-row">
                  {responseResult.pieces.map((piece) => (
                    <span className="pill" key={piece}>
                      {piece}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {responseResult.evidence?.length ? (
              <div className="stack-sm">
                <p className="field-label">Supporting evidence</p>
                <ul className="prose-list">
                  {responseResult.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {responseResult.boundaries?.length ? (
              <div className="stack-sm">
                <p className="field-label">What Atlas did not do</p>
                <ul className="prose-list">
                  {responseResult.boundaries.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="card-foot">
            <Link className="inline-link" href="/looks">
              View in the outfit planner <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
