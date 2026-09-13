"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Signal state controls: snooze (bounded presets), dismiss, reactivate.
 * PATCH /api/signals is owner-scoped server-side; refresh re-reads state.
 */
export function SignalStateControls({
  signalId,
  state,
}: {
  signalId: string;
  state: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  const patch = useCallback(
    async (nextState: string, until?: string) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/signals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: signalId, state: nextState, until }),
        });
        if (!res.ok) {
          setError("The change did not stick — try again.");
          return;
        }
        startTransition(() => router.refresh());
      } catch {
        setError("You appear to be offline.");
      } finally {
        setBusy(false);
      }
    },
    [signalId],
  );

  const snooze = (days: number) => {
    const until = new Date(Date.now() + days * 86_400_000).toISOString();
    void patch("snoozed", until);
  };

  return (
    <div className="next-controls">
      {state === "active" || state === "paused" ? (
        <>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => snooze(1)}>
            Snooze 1 day
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => snooze(7)}>
            Snooze 1 week
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void patch("dismissed")}>
            Dismiss
          </button>
        </>
      ) : (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void patch("active")}>
          Reactivate
        </button>
      )}
      {error ? (
        <span role="alert" className="next-note">
          {error}
        </span>
      ) : null}
    </div>
  );
}
