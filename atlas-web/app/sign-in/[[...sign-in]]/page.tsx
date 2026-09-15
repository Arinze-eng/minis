import { SignIn } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/server/clerkIdentity";
import { RouteMark } from "@/components/RouteMark";
import Link from "next/link";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (!clerkConfigured()) {
    return (
      <main id="main" className="auth-page">
        <div className="auth-brand"><RouteMark size={32} /><span>Atlas</span></div>
        <h1>Sign in</h1>
        <p className="auth-unconfigured" role="note">
          Authentication is not configured on this deployment. Atlas is running
          in the labelled local single-principal mode — nothing is pretending to
          be a signed-in account. Set the Clerk publishable and secret keys to
          enable real accounts.
        </p>
      </main>
    );
  }
  return (
    <main id="main" className="auth-page">
      <div className="auth-brand"><RouteMark size={32} /><span>Atlas</span></div>
      <div className="auth-copy"><p className="auth-kicker">Your quiet command center</p><h1>Welcome back</h1><p>Review the next useful move, with the evidence beside it.</p></div>
      <div className="auth-card"><SignIn signUpUrl="/sign-up" forceRedirectUrl="/inbox" /></div>
      <Link className="auth-back" href="/">Back to Atlas</Link>
    </main>
  );
}
