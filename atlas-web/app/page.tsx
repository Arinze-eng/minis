import Link from "next/link";
import {
  ArrowRight,
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

const FEATURES = [
  {
    icon: Shirt,
    title: "Wardrobe Intelligence",
    detail:
      "Track cost-per-wear across every item you own. Plan outfits from confirmed pieces, not invented ones. Every suggestion is grounded in your real wardrobe.",
    iconBg: "bg-[var(--color-accent-soft)]",
    iconColor: "text-[var(--color-accent-deep)]",
  },
  {
    icon: Wallet,
    title: "Money Guard",
    detail:
      "Surface subscription renewals, trial end dates, and price changes before they hit your account. Read-only receipt checks with ephemeral extraction.",
    iconBg: "bg-[var(--color-alert-soft)]",
    iconColor: "text-[var(--color-alert-deep)]",
  },
  {
    icon: Lock,
    title: "Privacy First",
    detail:
      "Read-only access only. Ephemeral extraction keeps bounded fields — merchant, amount, cadence, date. Full message bodies are never stored. One-click wipe removes everything.",
    iconBg: "bg-[var(--color-good-soft)]",
    iconColor: "text-[var(--color-good-deep)]",
  },
  {
    icon: Check,
    title: "Always Waiting",
    detail:
      "Atlas prepares the next move and surfaces the evidence. Nothing is sent, bought, cancelled, or mutated until you approve. The model never authorizes itself.",
    iconBg: "bg-[var(--color-lavender-soft)]",
    iconColor: "text-[var(--color-lavender)]",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Connect your sources",
    detail:
      "Grant read-only access to the signals you choose. Every connector is consent-gated and revocable at any time from your settings.",
  },
  {
    number: "02",
    title: "Atlas analyses and surfaces insights",
    detail:
      "Two intelligence engines run on your behalf — wardrobe cost-per-wear and financial subscription review — producing evidence-backed findings.",
  },
  {
    number: "03",
    title: "You approve every action",
    detail:
      "Every recommendation arrives as a bounded approval card. Nothing moves without your explicit confirmation. Full audit trail retained.",
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
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-bg)]/80 border-b border-[var(--color-line)]">
        <div className="max-w-[1120px] mx-auto px-6 h-[60px] flex items-center gap-4">
          {/* Brand */}
          <Link
            href="/"
            className="inline-flex items-center gap-[10px] no-underline flex-none"
            aria-label="Atlas home"
          >
            <RouteMark size={28} />
            <strong className="font-bold text-[1.05rem] tracking-[0.01em] text-[var(--color-ink)]">
              Atlas
            </strong>
          </Link>

          {/* Nav — hidden on mobile, shown md+ */}
          <nav
            className="hidden md:flex items-center gap-1 flex-1 justify-center"
            aria-label="Site navigation"
          >
            <a
              href="#features"
              className="text-sm font-medium text-[var(--color-ink-muted)] no-underline px-3 py-1.5 rounded-[var(--radius-control)] hover:text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] transition-colors duration-150"
            >
              Features
            </a>
            <Link
              href="/sources"
              className="text-sm font-medium text-[var(--color-ink-muted)] no-underline px-3 py-1.5 rounded-[var(--radius-control)] hover:text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] transition-colors duration-150"
            >
              Sources
            </Link>
            <Link
              href="/settings/privacy"
              className="text-sm font-medium text-[var(--color-ink-muted)] no-underline px-3 py-1.5 rounded-[var(--radius-control)] hover:text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] transition-colors duration-150"
            >
              Privacy
            </Link>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto flex-none">
            <AuthControls />
            <ThemeToggle />
            <Link
              className="hidden sm:inline-flex items-center gap-[8px] text-sm font-bold px-[22px] py-3 rounded-[var(--radius-control)] bg-[var(--color-accent)] text-[var(--color-on-accent)] no-underline hover:bg-[var(--color-accent-deep)] active:scale-95 transition-all duration-150"
              href="/inbox"
            >
              Open Atlas
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ── Hero ── */}
        <section
          className="relative isolate overflow-hidden bg-gradient-to-br from-[var(--color-hero)] to-[var(--color-hero-deep)] text-[var(--color-on-hero)]"
          aria-labelledby="hero-h"
        >
          {/* Decorative orbs */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-60 -right-44 w-[560px] h-[560px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.13),transparent_64%)] -z-10"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-48 -left-24 w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_68%)] -z-10"
          />

          <div className="max-w-[1120px] mx-auto px-6 py-20 md:py-24">
            <div className="max-w-[44rem]">
              <h1
                id="hero-h"
                className="text-4xl md:text-5xl font-bold leading-[1.08] tracking-[-0.02em] text-[var(--color-on-hero)] max-w-[20ch] m-0"
              >
                The life-admin assistant that asks before it acts.
              </h1>
              <p className="mt-6 max-w-[54ch] text-[1.05rem] leading-relaxed text-[var(--color-on-hero-muted)]">
                Atlas watches your wardrobe and finances, prepares the next smart
                move, and waits for your approval before doing anything.
              </p>
              <div className="flex items-center gap-3 flex-wrap mt-8">
                <Link
                  className="inline-flex items-center gap-2 text-[0.95rem] font-bold px-[22px] py-3 rounded-[var(--radius-control)] bg-[var(--color-on-hero)] text-[var(--color-hero-deep)] no-underline hover:bg-white active:scale-95 transition-all duration-150"
                  href="/inbox"
                >
                  Open Atlas
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <a
                  className="inline-flex items-center gap-2 text-[0.95rem] font-semibold px-[22px] py-3 rounded-[var(--radius-control)] border border-[var(--color-hero-line)] bg-white/[0.06] text-[var(--color-on-hero)] no-underline hover:bg-white/[0.13] active:scale-95 transition-all duration-150"
                  href="#features"
                >
                  See how it works
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Proof strip ── */}
        <Reveal delay={0.05}>
          <section
            className="max-w-[1120px] mx-auto px-6 py-12 flex items-center justify-center flex-wrap border-b border-[var(--color-line)]"
            aria-label="Atlas by the numbers"
          >
            <article className="flex flex-col items-center gap-1 px-8 py-4 text-center flex-1 min-w-[160px]">
              <span className="text-5xl font-bold tabular-nums leading-none tracking-[-0.02em] text-[var(--color-ink)]">
                0
              </span>
              <span className="text-[0.85rem] text-[var(--color-ink-muted)] font-medium max-w-[16ch] leading-snug">
                actions without approval
              </span>
            </article>

            <span
              aria-hidden="true"
              className="hidden sm:block w-px h-12 bg-[var(--color-line-strong)] self-center flex-none"
            />

            <article className="flex flex-col items-center gap-1 px-8 py-4 text-center flex-1 min-w-[160px]">
              <span className="text-5xl font-bold tabular-nums leading-none tracking-[-0.02em] text-[var(--color-ink)]">
                2
              </span>
              <span className="text-[0.85rem] text-[var(--color-ink-muted)] font-medium max-w-[16ch] leading-snug">
                intelligence engines
              </span>
            </article>

            <span
              aria-hidden="true"
              className="hidden sm:block w-px h-12 bg-[var(--color-line-strong)] self-center flex-none"
            />

            <article className="flex flex-col items-center gap-1 px-8 py-4 text-center flex-1 min-w-[160px]">
              <span className="text-5xl font-bold tabular-nums leading-none tracking-[-0.02em] text-[var(--color-ink)]">
                100%
              </span>
              <span className="text-[0.85rem] text-[var(--color-ink-muted)] font-medium max-w-[16ch] leading-snug">
                read-only access
              </span>
            </article>
          </section>
        </Reveal>

        {/* ── Features grid ── */}
        <Reveal delay={0.05}>
          <section
            id="features"
            className="max-w-[1120px] mx-auto px-6 py-16"
            aria-labelledby="features-h"
          >
            <div className="inline-flex items-center gap-2 mb-3 text-[0.72rem] font-extrabold tracking-[0.13em] uppercase text-[var(--color-accent-deep)]">
              What Atlas does
            </div>
            <h2
              id="features-h"
              className="text-3xl font-bold tracking-[-0.015em] leading-[1.15] m-0 text-[var(--color-ink)]"
            >
              Two engines. One calm surface.
            </h2>
            <p className="mt-3 text-[var(--color-ink-muted)] text-base max-w-[58ch] leading-relaxed">
              Wardrobe intelligence and financial oversight running side by side,
              both waiting on your word before anything changes.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              {FEATURES.map(({ icon: Icon, title, detail, iconBg, iconColor }) => (
                <article
                  key={title}
                  className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-7 hover:-translate-y-1 hover:shadow-[var(--shadow-pop)] transition-all duration-150"
                >
                  <div
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-[10px] mb-4 ${iconBg} ${iconColor}`}
                  >
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <h3 className="text-[1.05rem] font-bold mb-3 m-0 text-[var(--color-ink)]">
                    {title}
                  </h3>
                  <p className="m-0 text-[0.92rem] text-[var(--color-ink-muted)] leading-relaxed">
                    {detail}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ── How it works ── */}
        <Reveal delay={0.05}>
          <section
            className="max-w-[1120px] mx-auto px-6 py-16 border-t border-[var(--color-line)]"
            aria-labelledby="how-h"
          >
            <div className="inline-flex items-center gap-2 mb-3 text-[0.72rem] font-extrabold tracking-[0.13em] uppercase text-[var(--color-accent-deep)]">
              How it works
            </div>
            <h2
              id="how-h"
              className="text-3xl font-bold tracking-[-0.015em] leading-[1.15] m-0 text-[var(--color-ink)]"
            >
              Ready in three steps
            </h2>

            <ol
              className="relative list-none m-0 mt-8 p-0 grid gap-0 md:max-w-[680px]"
              role="list"
            >
              {/* Connecting line */}
              <span
                aria-hidden="true"
                className="absolute top-7 left-7 w-0.5 h-[calc(100%-56px)] bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-good)] opacity-30 pointer-events-none"
              />

              {STEPS.map((step, i) => (
                <li
                  key={step.number}
                  className={`relative grid grid-cols-[56px_1fr] gap-6 ${
                    i < STEPS.length - 1 ? "pb-8" : ""
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className="relative z-10 w-14 h-14 rounded-full bg-[var(--color-accent-soft)] border-2 border-[var(--color-accent)]/35 flex items-center justify-center text-[0.85rem] font-extrabold tabular-nums text-[var(--color-accent-deep)] flex-none"
                  >
                    {step.number}
                  </div>
                  <div className="pt-3">
                    <h3 className="text-[1.05rem] font-bold mb-2 m-0 text-[var(--color-ink)]">
                      {step.title}
                    </h3>
                    <p className="m-0 text-[0.92rem] text-[var(--color-ink-muted)] max-w-[52ch] leading-[1.65]">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        {/* ── Privacy matrix ── */}
        <Reveal delay={0.05}>
          <section
            className="max-w-[1120px] mx-auto px-6 py-16 border-t border-[var(--color-line)]"
            aria-labelledby="privacy-h"
          >
            <div className="inline-flex items-center gap-2 mb-3 text-[0.72rem] font-extrabold tracking-[0.13em] uppercase text-[var(--color-accent-deep)]">
              Privacy
            </div>
            <h2
              id="privacy-h"
              className="text-3xl font-bold tracking-[-0.015em] leading-[1.15] m-0 text-[var(--color-ink)]"
            >
              The zero-mutation guarantee
            </h2>
            <p className="mt-3 text-[var(--color-ink-muted)] text-base max-w-[58ch] leading-relaxed">
              Deterministic policy code enforces every boundary below — the model
              never authorizes anything on your behalf.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              {PRIVACY_MATRIX.map(({ icon: Icon, title, detail }) => (
                <article
                  key={title}
                  className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl p-6 hover:-translate-y-0.5 hover:border-[var(--color-good)]/45 transition-all duration-150"
                >
                  <Icon
                    size={18}
                    aria-hidden="true"
                    className="text-[var(--color-good)] mb-3 block"
                  />
                  <h3 className="text-[0.98rem] font-bold mb-2 m-0 text-[var(--color-ink)]">
                    {title}
                  </h3>
                  <p className="m-0 text-[0.88rem] text-[var(--color-ink-muted)] leading-relaxed">
                    {detail}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ── Final CTA ── */}
        <section
          className="text-center px-6 py-16 border-t border-[var(--color-line)] bg-gradient-to-br from-[var(--color-hero)] to-[var(--color-hero-deep)] text-[var(--color-on-hero)]"
          aria-labelledby="final-h"
        >
          <h2
            id="final-h"
            className="text-3xl md:text-4xl font-bold tracking-[-0.018em] text-[var(--color-on-hero)] m-0 mb-3"
          >
            Start with zero risk
          </h2>
          <p className="text-[var(--color-on-hero-muted)] text-base max-w-[48ch] mx-auto mb-8 leading-relaxed">
            Read-only access. No purchases, no transfers, no mutations. You stay
            in control at every step.
          </p>
          <Link
            className="inline-flex items-center gap-2 text-base font-bold px-7 py-3.5 rounded-[var(--radius-control)] bg-[var(--color-on-hero)] text-[var(--color-hero-deep)] no-underline hover:bg-white active:scale-95 transition-all duration-150"
            href="/inbox"
          >
            Open Atlas
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="max-w-[1120px] mx-auto px-6 py-6 flex items-center gap-6 flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center gap-[10px] no-underline flex-none"
            aria-label="Atlas home"
          >
            <RouteMark size={22} />
            <strong className="font-bold text-[1.05rem] tracking-[0.01em] text-[var(--color-ink)]">
              Atlas
            </strong>
          </Link>

          <nav
            className="flex items-center gap-1 flex-wrap"
            aria-label="Footer navigation"
          >
            <Link
              href="/sources"
              className="text-[0.85rem] text-[var(--color-ink-muted)] no-underline px-[10px] py-1 rounded-[var(--radius-control)] hover:text-[var(--color-accent-deep)] hover:bg-[var(--color-accent-soft)] transition-colors duration-150"
            >
              Sources
            </Link>
            <Link
              href="/settings/privacy"
              className="text-[0.85rem] text-[var(--color-ink-muted)] no-underline px-[10px] py-1 rounded-[var(--radius-control)] hover:text-[var(--color-accent-deep)] hover:bg-[var(--color-accent-soft)] transition-colors duration-150"
            >
              Privacy
            </Link>
            <Link
              href="/settings"
              className="text-[0.85rem] text-[var(--color-ink-muted)] no-underline px-[10px] py-1 rounded-[var(--radius-control)] hover:text-[var(--color-accent-deep)] hover:bg-[var(--color-accent-soft)] transition-colors duration-150"
            >
              Settings
            </Link>
          </nav>

          <p className="m-0 text-[0.82rem] text-[var(--color-ink-muted)] ml-auto">
            Atlas prepares the next move. You decide.
          </p>
        </div>
      </footer>
    </div>
  );
}
