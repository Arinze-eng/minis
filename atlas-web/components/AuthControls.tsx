import Link from "next/link";
import { Check, CircleUser } from "lucide-react";
import { clerkConfigured, clerkSignInUrl } from "@/lib/server/clerkIdentity";

/**
 * Identity control for the app shell and the landing header.
 *
 * This is a Server Component on purpose: Clerk Core 3's `<Show>` is a server
 * component that awaits `auth()`, so it cannot be rendered from a client
 * component. The app shell therefore receives it as a slot.
 *
 * Clerk is imported lazily *after* the configured check, so an unconfigured
 * deployment never loads Clerk code at all — it renders one honest chip.
 *
 * Three honest states, always visible:
 *  - signed in  → "Signed in" + the Clerk user button (account menu, sign out);
 *  - signed out → "Not signed in" + sign-in / create-account actions;
 *  - unconfigured → a labelled local-mode chip. There is no account to sign in
 *    to, so nothing pretends otherwise.
 */
export async function AuthControls() {
  if (!clerkConfigured()) {
    return (
      <div className="identity">
        <span
          className="identity-chip identity-chip-local"
          title="Clerk is not configured on this deployment, so Atlas runs in the labelled local single-principal mode. Set the Clerk keys to enable real accounts."
        >
          <CircleUser size={13} aria-hidden="true" />
          Local dev mode · no account
        </span>
        <Link className="identity-link" href={clerkSignInUrl()}>
          Account setup
        </Link>
      </div>
    );
  }

  const { Show, SignInButton, SignUpButton, UserButton } = await import("@clerk/nextjs");

  return (
    <div className="identity">
      <Show when="signed-in">
        <span className="identity-chip identity-chip-in">
          <Check size={13} aria-hidden="true" />
          Signed in
        </span>
        <UserButton showName />
      </Show>
      <Show when="signed-out">
        <span className="identity-chip identity-chip-out">
          <CircleUser size={13} aria-hidden="true" />
          Not signed in
        </span>
        <SignInButton mode="modal">
          <button type="button" className="btn btn-secondary">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="btn btn-primary">
            Create account
          </button>
        </SignUpButton>
      </Show>
    </div>
  );
}
