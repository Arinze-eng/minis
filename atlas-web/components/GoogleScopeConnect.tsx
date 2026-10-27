"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { toast, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";

const SCOPES = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  google_tasks: "https://www.googleapis.com/auth/tasks.readonly",
} as const;

type Provider = keyof typeof SCOPES;

/**
 * Connect a Google source. Users who signed in with Google are asked for just the extra read-only
 * scope on their existing Google account (incremental authorization via Clerk), so there is one Google
 * grant for sign-in, Gmail and Tasks. Everyone else uses Atlas's own OAuth flow.
 * Rendered only when `clerk: boolean` (from the server's clerkConfigured()) is true.
 */
export function GoogleScopeConnect({ clerk, provider, label, disabled }: { clerk: boolean; provider: Provider; label: string; disabled?: boolean }) {
  return clerk ? <ViaClerk provider={provider} label={label} disabled={disabled} /> : <ViaOAuth provider={provider} label={label} disabled={disabled} />;
}

function ViaOAuth({ provider, label, disabled }: { provider: Provider; label: string; disabled?: boolean }) {
  const allow = useMutation(api.sources.allowAutoConnect);
  return (
    <a
      href={`/api/oauth/${provider}/connect`}
      onClick={() => void allow({ provider })}
      className={`btn-primary ${disabled ? "pointer-events-none opacity-40" : ""}`}
      aria-disabled={disabled}
    >
      {label}
    </a>
  );
}

function ViaClerk({ provider, label, disabled }: { provider: Provider; label: string; disabled?: boolean }) {
  const { user } = useUser();
  const allow = useMutation(api.sources.allowAutoConnect);
  const { run, busy } = useRun();
  const google = user?.externalAccounts.find((a) => a.provider === "google");
  if (!google) return <ViaOAuth provider={provider} label={label} disabled={disabled} />;

  const connect = () =>
    run(async () => {
      await allow({ provider });
      const updated = await google.reauthorize({
        additionalScopes: [SCOPES[provider]],
        redirectUrl: `${window.location.origin}/sources?${provider}=linked`,
      });
      const next = updated.verification?.externalVerificationRedirectURL;
      if (next) window.location.assign(next.toString());
      else toast("Already allowed — linking now");
    });

  return (
    <button type="button" className="btn-primary" disabled={disabled || busy} onClick={connect}>
      {label}
    </button>
  );
}
