import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  Eye,
  Lock,
  RefreshCw,
  Shirt,
  Wallet,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RouteMark } from "@/components/RouteMark";
import { Reveal } from "@/components/Reveal";
import "./landing.css";

const LOOP = [
  {
    time: "07:30",
    title: "Curates today's look",
    detail:
      "Local weather and closet rotation in, one outfit suggestion out — composed only from garments you confirmed.",
    accent: "accent" as const,
  },
  {
    time: "14:00",
    title: "Watches renewals and prices",
    detail:
      "Scheduled, read-only receipt checks surface trial end dates and price changes — ephemeral extraction, bounded fields only.",
    accent: "alert" as const,
  },
  {
    time: "20:00",
    title: "Rebalances cost-per-wear",
    detail:
      "Items you log as worn update CPW the same evening, so the numbers you see tomorrow are earned, not estimated.",
    accent: "good" as const,
  },
];

const PRIVACY_MATRIX = [
  {
    icon: Lock,
    title: "gmail.readonly, nothing more",
    detail:
      "The only mailbox scope requested is read-only. No send, no delete, no archive — enforced in server policy code, not promises.",
  },
  {
    icon: Eye,
    title: "Zero raw storage",
    detail:
      "Ephemeral extraction keeps bounded fields — merchant, amount, cadence, dates. Full message bodies are never stored.",
  },
  {
    icon: RefreshCw,
    title: "One-click export",
    detail:
      "Your wardrobe records, findings, signals, and audit trail export to a machine-readable copy at any time.",
  },
  {
    icon: Check,
    title: "One-click wipe",
    detail:
      "Assets, metadata, evidence, findings, jobs, drafts, and indexes — a complete, confirmed, irreversible deletion.",
  },
];

export default function LandingPage() {
  return (
    <main id="main">
      <header className="land-header">
        <Link href="/" className="land-brand" aria-label="Atlas home">
          <RouteMark size={26} />
          <span className="land-wordmark">Atlas</span>
        </Link>
        <div className="land-header-actions">
          <ThemeToggle />
          <Link className="land-enter" href="/inbox">
            Open Atlas
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="hero">
        <p className="hero-kicker">A personal lifestyle agent</p>
        <h1>
          Atlas balances what you <span className="hero-underline">wear</span>{" "}
          against what you <span className="hero-underline">owe</span> —
          quietly, in the background.
        </h1>
        <p className="hero-sub">
          Two engines run on your behalf: a wardrobe engine that turns a closet
          into cost-per-wear reality, and a financial engine that catches
          subscription leaks before they renew. Both ask before anything moves.
        </p>
        <div className="hero-cta">
          <Link className="btn-primary" href="/inbox">
            Enter Atlas — no account needed
          </Link>
          <Link className="btn-ghost" href="/sources">
            See what data touches
          </Link>
        </div>
      </section>

      {/* ---------- Dual-engine preview (CSS-only interactivity) ---------- */}
      <Reveal>
        <section className="engines" aria-labelledby="engines-h">
          <h2 id="engines-h" className="section-title">
            Two engines, one calm surface
          </h2>
        <div className="engine-tabs">
          {/* Wardrobe engine panel */}
          <input
            type="radio"
            name="engine"
            id="engine-wardrobe"
            defaultChecked
            className="engine-radio"
          />
          <input type="radio" name="engine" id="engine-money" className="engine-radio" />
          <div className="engine-tabbar">
            <label htmlFor="engine-wardrobe" className="engine-tab">
              <Shirt size={16} aria-hidden="true" /> Wardrobe engine
            </label>
            <label htmlFor="engine-money" className="engine-tab">
              <Wallet size={16} aria-hidden="true" /> Financial engine
            </label>
          </div>

          <div className="engine-stage">
            <article className="engine-panel engine-panel-wardrobe" aria-label="Wardrobe engine preview">
              <p className="engine-caption">
                Garment cost-per-wear recalculates every time you log a wear.
              </p>
              <div className="cpw-demo">
                {[
                  { name: "Retro Runner", price: 110, wears: 31, pct: 92 },
                  { name: "Straight Denim", price: 74, wears: 22, pct: 78 },
                  { name: "Utility Overshirt", price: 82, wears: 2, pct: 9 },
                ].map((g) => (
                  <div key={g.name} className="cpw-row">
                    <span className="cpw-name">{g.name}</span>
                    <div className="cpw-bar">
                      <span className="cpw-fill" style={{ width: `${g.pct}%` }} />
                    </div>
                    <span className="cpw-value">
                      ${(g.price / g.wears).toFixed(2)}
                      <span className="cpw-per">/wear</span>
                    </span>
                  </div>
                ))}
                <p className="cpw-note">
                  Weather-aware planning rides on the same confirmed garments —
                  never invented pieces.
                </p>
              </div>
            </article>

            <article className="engine-panel engine-panel-money" aria-label="Financial engine preview">
              <p className="engine-caption">
                Read-only receipt checks surface leaks before they renew.
              </p>
              <div className="leak-demo">
                <div className="leak-row leak-hot">
                  <BellRing size={15} aria-hidden="true" />
                  <span className="leak-name">CloudNest trial</span>
                  <span className="leak-detail">ends in 48h · $9.99/mo</span>
                </div>
                <div className="leak-row">
                  <span className="leak-dot" aria-hidden="true" />
                  <span className="leak-name">Streamly</span>
                  <span className="leak-detail">$11.99 → $13.99 this cycle</span>
                </div>
                <div className="leak-row">
                  <span className="leak-dot" aria-hidden="true" />
                  <span className="leak-name">ThreadRenew</span>
                  <span className="leak-detail">$348/yr · renews tomorrow</span>
                </div>
                <p className="leak-note">
                  Extraction is ephemeral and read-only; only bounded fields are
                  kept — never full messages.
                </p>
              </div>
            </article>
          </div>
        </div>
        </section>
      </Reveal>

      {/* ---------- Daily loop ---------- */}
      <Reveal>
        <section className="loop" aria-labelledby="loop-h">
          <h2 id="loop-h" className="section-title">
            The daily loop runs itself
          </h2>
          <ol className="loop-timeline">
            {LOOP.map((step) => (
              <li key={step.time} className={`loop-step loop-${step.accent}`}>
                <span className="loop-time">{step.time}</span>
                <span className="loop-node" aria-hidden="true" />
                <div className="loop-body">
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="loop-footnote">
            Sentinel status stays visible in the app header — you always know
            what the agent is watching.
          </p>
        </section>
      </Reveal>

      {/* ---------- Privacy matrix ---------- */}
      <Reveal>
        <section className="privacy" aria-labelledby="privacy-h">
          <h2 id="privacy-h" className="section-title">
            The zero-mutation guarantee
          </h2>
        <div className="privacy-grid">
          {PRIVACY_MATRIX.map(({ icon: Icon, title, detail }) => (
            <article key={title} className="privacy-cell">
              <Icon size={18} aria-hidden="true" className="privacy-icon" />
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <p className="privacy-note">
          Deterministic policy code enforces every boundary above — the model
          never authorizes anything.
        </p>
        </section>
      </Reveal>

      {/* ---------- Final CTA ---------- */}
      <section className="land-final">
        <h2>See tomorrow's briefing in thirty seconds</h2>
        <p>Opens in labelled demo mode. No account, no data, no risk.</p>
        <Link className="btn-primary btn-large" href="/inbox">
          Enter Atlas
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>

      <footer className="land-footer">
        <p>
          Atlas prepares the next move. You decide. Read the{" "}
          <Link href="/sources">source boundaries</Link> or review{" "}
          <Link href="/settings/privacy">privacy controls</Link> before
          connecting anything.
        </p>
      </footer>
    </main>
  );
}
