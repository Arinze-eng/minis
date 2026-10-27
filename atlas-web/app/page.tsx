import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AuthControls } from "@/components/AuthControls";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SAMPLES } from "@/convex/model/samples";

const FEATURES = [
  ["01", "Photograph once", "A pile on the bed is enough. Atlas finds every piece, removes the background and tags colour, fabric, season and formality."],
  ["02", "Dressed for the day", "Ask the stylist for a look. It checks the weather, uses only what you own, and tells you plainly what's missing."],
  ["03", "See it on you", "Try any outfit on your own photo. Atlas asks first, every time, and the image stays yours."],
  ["04", "Pack and plan", "A packing list from your wardrobe for the forecast at your destination, with flights and stays one tap away."],
] as const;

const TRUST = [
  ["Read-only", "Gmail and Tasks are read, never written. Disconnect deletes what Atlas found."],
  ["Asks first", "Try-ons and anything that costs money wait for your approval."],
  ["Yours to take", "Export everything as JSON, or delete it all in one step."],
] as const;

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export default function LandingPage() {
  const showcase = SAMPLES.slice(0, 8);
  return (
    <div className="studio">
      <header className="topbar">
        <div className="topbar-row">
          <Link href="/" className="wordmark" aria-label="Atlas">
            <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M14 3 25 25H3L14 3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M8.5 18h11" stroke="currentColor" strokeWidth="2.2" />
            </svg>
            <span>
              atlas<span className="text-[var(--color-ink-muted)]">.</span>
            </span>
          </Link>
          <nav className="topnav" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="topbar-actions">
            <ThemeToggle />
            <div className="topbar-account">
              <AuthControls />
            </div>
          </div>
        </div>
      </header>

      <main className="studio-main">
        <section className="landing-hero">
          <p className="kicker">Wardrobe · Stylist · Travel</p>
          <h1>Your wardrobe, styled.</h1>
          <p className="landing-lede">
            Atlas turns photos of your clothes into a wardrobe you can search, dress from and pack from — with a stylist that only uses what you
            already own.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link href="/inbox" className="btn-primary">
              Open Atlas <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="#how" className="btn">
              How it works
            </a>
          </div>
        </section>

        <section className="landing-showcase" aria-label="Example wardrobe">
          {showcase.map((piece) => (
            <figure key={piece.key}>
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element -- inline illustration */}
                <img src={svgUrl(piece.svg)} alt="" />
              </div>
              <figcaption>
                <span>{piece.name}</span>
                <span className="tile-kicker">{piece.category}</span>
              </figcaption>
            </figure>
          ))}
        </section>

        <section id="how" className="landing-features">
          {FEATURES.map(([n, title, body]) => (
            <article key={n}>
              <span className="tile-kicker">{n}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <section id="privacy" className="landing-trust">
          <div>
            <p className="kicker">Privacy</p>
            <h2>Your photos never train anyone&apos;s model.</h2>
          </div>
          <dl>
            {TRUST.map(([title, body]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="landing-footer">
          <span>© {new Date().getFullYear()} Atlas</span>
          <Link href="/settings/privacy">Privacy &amp; data</Link>
        </footer>
      </main>
    </div>
  );
}
