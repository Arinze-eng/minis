import Link from "next/link";
import { RouteMark } from "@/components/RouteMark";
import { clerkConfigured, clerkSignUpFallbackRedirectUrl } from "@/lib/server/clerkIdentity";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  // Loaded only when the provider is configured (see the sign-in page note).
  const { SignUp } = clerkConfigured() ? await import("@clerk/nextjs") : { SignUp: null };

  return (
    <main
      id="main"
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] px-4 py-12 relative"
    >
      {/* Soft radial glow */}
      <span
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_20%,var(--color-accent-soft),transparent_70%)] z-0"
      />

      {/* Brand */}
      <Link
        href="/"
        className="relative z-10 inline-flex items-center gap-[10px] no-underline text-[var(--color-ink)] mb-2 font-bold text-[1.2rem] tracking-[0.01em] hover:text-[var(--color-accent-deep)] transition-colors duration-150"
      >
        <RouteMark size={32} />
        <span>Atlas</span>
      </Link>

      {SignUp ? (
        <>
          {/* Copy */}
          <div className="relative z-10 w-full max-w-md text-center mb-6">
            <p className="m-0 mb-3 text-[0.74rem] font-extrabold tracking-[0.14em] uppercase text-[var(--color-accent-deep)]">
              A calmer way forward
            </p>
            <h1 className="text-4xl font-bold leading-[1.1] m-0 mb-4 text-[var(--color-ink)]">
              Start with one next move
            </h1>
            <p className="m-0 text-base text-[var(--color-ink-muted)] max-w-[38ch] mx-auto leading-relaxed">
              Atlas keeps your evidence, consent, and decisions in view. Create
              an account to see the Inbox for your own wardrobe and money
              review.
            </p>
          </div>

          {/* Clerk card */}
          <div className="relative z-10 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[var(--shadow-pop)] p-8 w-full max-w-md">
            <SignUp
              signInUrl="/sign-in"
              fallbackRedirectUrl={clerkSignUpFallbackRedirectUrl()}
              signInFallbackRedirectUrl="/inbox"
            />
          </div>
        </>
      ) : (
        <>
          {/* Copy — unconfigured */}
          <div className="relative z-10 w-full max-w-md text-center mb-6">
            <p className="m-0 mb-3 text-[0.74rem] font-extrabold tracking-[0.14em] uppercase text-[var(--color-accent-deep)]">
              Authentication not configured
            </p>
            <h1 className="text-4xl font-bold leading-[1.1] m-0 mb-4 text-[var(--color-ink)]">
              Accounts are unavailable here
            </h1>
            <p className="m-0 text-base text-[var(--color-ink-muted)] max-w-[38ch] mx-auto leading-relaxed">
              This deployment runs in the labelled local single-principal mode.
              No account is created or simulated.
            </p>
          </div>

          {/* Note card */}
          <div
            role="note"
            className="relative z-10 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[var(--shadow-pop)] p-8 w-full max-w-md"
          >
            <h2 className="text-[1.05rem] font-bold mb-3 m-0 text-[var(--color-ink)]">
              Enable real accounts
            </h2>
            <ol className="m-0 pl-[1.15rem] grid gap-2 text-[0.9rem] text-[var(--color-ink-muted)]">
              <li>
                Add{" "}
                <code className="text-[0.82rem] px-1.5 py-px rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-deep)]">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>{" "}
                and{" "}
                <code className="text-[0.82rem] px-1.5 py-px rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-deep)]">CLERK_SECRET_KEY</code>{" "}
                to the environment.
              </li>
              <li>
                Point Clerk&rsquo;s sign-in and sign-up URLs at{" "}
                <code className="text-[0.82rem] px-1.5 py-px rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-deep)]">/sign-in</code>{" "}
                and{" "}
                <code className="text-[0.82rem] px-1.5 py-px rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-deep)]">/sign-up</code>.
              </li>
              <li>
                Redeploy. Atlas fails closed in production until the keys are
                present.
              </li>
            </ol>
            <p className="mt-4 m-0 text-[0.8rem] text-[var(--color-ink-muted)]">
              Full runbook:{" "}
              <code className="text-[0.82rem] px-1.5 py-px rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-deep)]">PRODUCTION_SETUP.md</code>{" "}
              in the repository.
            </p>
          </div>
        </>
      )}

      {/* Back link */}
      <Link
        href="/"
        className="relative z-10 mt-4 text-[0.88rem] text-[var(--color-ink-muted)] no-underline hover:text-[var(--color-accent-deep)] transition-colors duration-150"
      >
        Back to Atlas
      </Link>
    </main>
  );
}
