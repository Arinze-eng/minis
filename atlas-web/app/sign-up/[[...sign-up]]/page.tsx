import Link from "next/link";
import { RouteMark } from "@/components/RouteMark";
import { clerkConfigured, clerkSignUpFallbackRedirectUrl } from "@/lib/server/clerkIdentity";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  // Loaded only when the provider is configured (see the sign-in page note).
  const { SignUp } = clerkConfigured() ? await import("@clerk/nextjs") : { SignUp: null };

  return (
    <main id="main" className="auth-page">
      <Link className="auth-brand" href="/">
        <RouteMark size={32} />
        <span>Atlas</span>
      </Link>

      {SignUp ? (
        <>
          <div className="auth-copy">
            <p className="auth-kicker">A calmer way forward</p>
            <h1>Start with one next move</h1>
            <p>
              Atlas keeps your evidence, consent, and decisions in view. Create
              an account to see the Inbox for your own wardrobe and money
              review.
            </p>
          </div>
          <div className="auth-card">
            <SignUp
              signInUrl="/sign-in"
              fallbackRedirectUrl={clerkSignUpFallbackRedirectUrl()}
              signInFallbackRedirectUrl="/inbox"
            />
          </div>
        </>
      ) : (
        <>
          <div className="auth-copy">
            <p className="auth-kicker">Authentication not configured</p>
            <h1>Accounts are unavailable here</h1>
            <p>
              This deployment runs in the labelled local single-principal mode.
              No account is created or simulated.
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
