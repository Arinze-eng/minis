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
import { AuthControls } from "@/components/AuthControls";
import "./landing.css";

const STATS = [
  {
    value: "2",
    label: "Engines on watch",
    note: "Wardrobe cost-per-wear and money review run side by side.",
  },
  {
    value: "3",
    label: "Scheduled checks a day",
    note: "07:30 outfit · 14:00 renewals · 20:00 cost-per-wear.",
  },
  {
    value: "0",
    label: "Actions without your approval",
    note: "Nothing is sent, bought, cancelled, or mutated for you.",
  },
];

const PREVIEW_QUEUE = [
  {
    accent: "alert",
    title: "Review a pending trial before it renews",
    detail: "Recurring-charge evidence · 48h window · read-only source",
  },
  {
    accent: "accent",
    title: "Plan a focused work block",
    detail: "Suggested for this morning from your own signals",
  },
  {
    accent: "good",
    title: "Compare two confirmed pairs of shoes",
    detail: "Cost-per-wear 12.60 vs 13.80 · both already owned",
  },
];

const PREVIEW_SOURCES = [
  { name: "Wardrobe", mode: "local-first", state: "ready" as const },
  { name: "Money review", mode: "deterministic", state: "ready" as const },
  { name: "Gmail (read-only)", mode: "consent-gated", state: "off" as const },
  { name: "Weather", mode: "placeholder", state: "off" as const },
];

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
    <main id="main" className="landing">
      <header className="land-header">
        <Link href="/" className="land-brand" aria-label="Atlas home">
          <RouteMark size={28} />
          <span className="land-brand-copy">
            <strong>Atlas</strong>
            <small>personal lifestyle command center</small>
          </span>
        </Link>
        <div className="land-header-actions">
          <AuthControls />
          <ThemeToggle />
          <Link className="btn-primary" href="/inbox">
            Open Atlas
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <Reveal y={10}>
        <section className="hero" aria-labelledby="hero-h">
          <span className="hero-orb hero-orb-a" aria-hidden="true" />
          <span className="hero-orb hero-orb-b" aria-hidden="true" />
          <div className="hero-body">
            <span className="hero-status">
              <span className="hero-status-dot" aria-hidden="true" />
              Atlas is online — read-only
            </span>
            <h1 id="hero-h">Your next best move is already in view.</h1>
            <p className="hero-sub">
              Two engines run on your behalf: a wardrobe engine that turns a
              closet into cost-per-wear reality, and a financial engine that
              catches subscription leaks before they renew. Both ask before
              anything moves.
            </p>
            <div className="hero-cta">
              <Link className="btn-hero" href="/inbox">
                Open the Inbox
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="btn-hero-ghost" href="/sources">
                See what data touches
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ---------- Stat strip ---------- */}
      <Reveal delay={0.05}>
        <section className="stat-grid land-stats" aria-label="How Atlas behaves">
          {STATS.map((stat) => (
            <article className="stat" key={stat.label}>
              <span className="stat-label">{stat.label}</span>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-note">{stat.note}</span>
            </article>
          ))}
        </section>
      </Reveal>

      {/* ---------- Command-center preview ---------- */}
      <Reveal delay={0.05}>
        <section className="land-preview" aria-labelledby="preview-h">
          <div className="land-section-head">
            <div>
              <h2 id="preview-h" className="section-title">
                What the surface looks like
              </h2>
              <p className="section-sub">
                A priority queue with its evidence beside it, and a pulse of the
                sources Atlas can actually reach.
              </p>
            </div>
            <span className="badge badge-warn">Example layout</span>
          </div>

          <div className="preview-grid">
            <div className="card">
              <div className="card-head">
                <h3>Priority queue</h3>
                <span className="badge">What deserves your attention</span>
              </div>
              <ul className="row-list">
                {PREVIEW_QUEUE.map((item) => (
                  <li className="row" key={item.title}>
                    <span
                      className={`queue-dot queue-dot-${item.accent}`}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="row-title">{item.title}</span>
                      <span className="row-detail">{item.detail}</span>
                    </span>
                    <span className="row-meta">prepare</span>
                  </li>
                ))}
              </ul>
              <p className="card-foot">
                Illustrative rows — Atlas only shows signals derived from
                evidence it actually holds.
              </p>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>System pulse</h3>
                <span className="badge badge-good">Read-only</span>
              </div>
              <ul className="row-list">
                {PREVIEW_SOURCES.map((source) => (
                  <li className="row" key={source.name}>
                    <span
                      className={`source-dot ${source.state === "ready" ? "source-dot-on" : "source-dot-off"}`}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="row-title">{source.name}</span>
                      <span className="row-detail">{source.mode}</span>
                    </span>
                    <span
                      className={`badge ${source.state === "ready" ? "badge-good" : "badge-off"}`}
                    >
                      {source.state === "ready" ? "available" : "not connected"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="card-foot">
                Connectors activate only with explicit, revocable consent — and
                the status shown is the status that is true.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ---------- Dual-engine preview (CSS-only interactivity) ---------- */}
      <Reveal delay={0.05}>
        <section className="engines" aria-labelledby="engines-h">
          <h2 id="engines-h" className="section-title">
            Two engines, one calm surface
          </h2>
          <div className="engine-tabs">
            <input
              type="radio"
              name="engine"
              id="engine-wardrobe"
              defaultChecked
              className="engine-radio"
            />
            <input type="radio" name="engine" id="engine-money" className="engine-radio" />
            <div className="engine-tabbar" role="tablist" aria-label="Engine preview">
              <label htmlFor="engine-wardrobe" className="engine-tab">
                <Shirt size={16} aria-hidden="true" /> Wardrobe engine
              </label>
              <label htmlFor="engine-money" className="engine-tab">
                <Wallet size={16} aria-hidden="true" /> Financial engine
              </label>
            </div>

            <div className="engine-stage">
              <article
                className="engine-panel engine-panel-wardrobe"
                aria-label="Wardrobe engine preview"
              >
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

              <article
                className="engine-panel engine-panel-money"
                aria-label="Financial engine preview"
              >
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
                    Extraction is ephemeral and read-only; only bounded fields
                    are kept — never full messages.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ---------- Daily loop ---------- */}
      <Reveal delay={0.05}>
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
      <Reveal delay={0.05}>
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
        <h2>See tomorrow&rsquo;s briefing in thirty seconds</h2>
        <p>Opens in labelled demo mode. No account, no data, no risk.</p>
        <div className="hero-cta hero-cta-center">
          <Link className="btn-primary btn-large" href="/inbox">
            Enter Atlas
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link className="btn-secondary" href="/sign-in">
            Sign in with an account
          </Link>
        </div>
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
