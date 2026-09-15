import { SignUp } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/server/clerkIdentity";
import { RouteMark } from "@/components/RouteMark";
import Link from "next/link";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  if (!clerkConfigured()) {
    return (
      <main id="main" className="auth-page">
        <div className="auth-brand"><RouteMark size={32} /><span>Atlas</span></div>
        <h1>Create account</h1>
        <p className="auth-unconfigured" role="note">
          Authentication is not configured on this deployment. Atlas is running
          in the labelled local single-principal mode. Set the Clerk keys to
          enable real accounts.
        </p>
      </main>
    );
  }
  return (
    <main id="main" className="auth-page">
      <div className="auth-brand"><RouteMark size={32} /><span>Atlas</span></div>
      <div className="auth-copy"><p className="auth-kicker">A calmer way forward</p><h1>Start with one next move</h1><p>Atlas keeps your evidence, consent, and decisions in view.</p></div>
      <div className="auth-card"><SignUp signInUrl="/sign-in" forceRedirectUrl="/inbox" /></div>
      <Link className="auth-back" href="/">Back to Atlas</Link>
    </main>
  );
}
