import { SignUp } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/server/clerkIdentity";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  if (!clerkConfigured()) {
    return (
      <main id="main" className="auth-page">
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
      <SignUp signInUrl="/sign-in" />
    </main>
  );
}
