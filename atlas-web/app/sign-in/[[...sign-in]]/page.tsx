import { SignIn } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/server/clerkIdentity";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (!clerkConfigured()) {
    return (
      <main id="main" className="auth-page">
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
      <SignIn signUpUrl="/sign-up" />
    </main>
  );
}
