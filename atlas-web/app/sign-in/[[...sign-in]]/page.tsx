import Link from "next/link";
import { RouteMark } from "@/components/RouteMark";
import { clerkConfigured, clerkSignInFallbackRedirectUrl } from "@/lib/server/clerkIdentity";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  // Loaded only when the provider is configured, so an unconfigured deployment
  // never pulls Clerk's UI into the bundle for this route.
  const { SignIn } = clerkConfigured() ? await import("@clerk/nextjs") : { SignIn: null };

  return (
    <main id="main" className="auth-page">
      <Link className="auth-brand" href="/">
        <RouteMark size={32} />
        <span>Atlas</span>
      </Link>

      {SignIn ? (
        <>
          <div className="auth-copy">
            <p className="auth-kicker">Your quiet command center</p>
            <h1>Welcome back</h1>
            <p>
              Review the next useful move, with the evidence beside it. Signing
              in is authentication only — connecting a mailbox or a bank stays a
              separate, revocable consent step.
            </p>
          </div>
          <div className="auth-card">
            <SignIn
              signUpUrl="/sign-up"
              fallbackRedirectUrl={clerkSignInFallbackRedirectUrl()}
              signUpFallbackRedirectUrl="/inbox"
            />
          </div>
        </>
      ) : (
        <>
          <div className="auth-copy">
            <p className="auth-kicker">Authentication not configured</p>
            <h1>Sign in is unavailable here</h1>
            <p>
              This deployment runs in the labelled local single-principal mode:
              no account exists and nothing pretends one does.
            </p>
          </div>
          <div className="auth-card auth-card-note" role="note">
            <h2>Enable real accounts</h2>
            <ol>
              <li>
                Add <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
                <code>CLERK_SECRET_KEY</code> to the environment.
              </li>
              <li>
                Point Clerk&rsquo;s sign-in and sign-up URLs at{" "}
                <code>/sign-in</code> and <code>/sign-up</code>.
              </li>
              <li>
                Redeploy. Atlas fails closed in production until the keys are
                present.
              </li>
            </ol>
            <p className="auth-card-foot">
              Full runbook: <code>PRODUCTION_SETUP.md</code> in the repository.
            </p>
          </div>
        </>
      )}

      <Link className="auth-back" href="/">
        Back to Atlas
      </Link>
    </main>
  );
}
