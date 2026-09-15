"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

/**
 * Header identity control. Rendered only when Clerk is configured (the server
 * layout passes the flag); in labelled local mode the header shows no account
 * control because there is genuinely no account — identity labelling lives in
 * the surfaces themselves.
 */
export function AuthControls({ clerkEnabled }: { clerkEnabled: boolean }) {
  if (!clerkEnabled) return null;
  return (
    <div className="auth-controls">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="btn-secondary auth-signin">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
