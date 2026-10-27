"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";

// ---- Errors and toasts -----------------------------------------------------------------------

/** The readable message from a Convex app error (`appError`), or a generic one. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data && "message" in error.data) {
    return String((error.data as { message: unknown }).message);
  }
  // Our own client-side errors are readable; raw Convex server errors are not.
  if (error instanceof Error && error.message && !error.message.includes("[CONVEX")) return error.message;
  return "Something went wrong. Try again.";
}

type Toast = { id: number; text: string; tone: "good" | "bad" };
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, tone: Toast["tone"] = "good") {
  const id = Date.now() + Math.random();
  toasts = [...toasts.slice(-2), { id, text, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4200);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => toasts,
    () => toasts,
  );
  return (
    <div className="toaster" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "bad" ? "toast-bad" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Wraps a mutation/action call: tracks busy state and shows the error (or a success note) as a toast. */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const value = await fn();
      if (success) toast(success);
      return value;
    } catch (error) {
      toast(errorMessage(error), "bad");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy };
}

// ---- Account gate -----------------------------------------------------------------------------

/** Children render only once Convex has verified the token and the user row exists. */
export function RequireUser({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (isLoading || (isAuthenticated && me === undefined) || (isAuthenticated && me === null)) {
    return <PageLoading label={isAuthenticated ? "Setting up your account…" : "Signing you in…"} />;
  }
  if (!isAuthenticated) {
    return (
      <div className="page page-narrow">
        <Empty title="You're signed out" body="Sign in again to see your wardrobe." action={{ href: "/sign-in", label: "Sign in" }} />
      </div>
    );
  }
  return <>{children}</>;
}

// ---- Layout pieces ---------------------------------------------------------------------------

export function PageHead({ title, sub, actions, crumb, eyebrow }: { title: string; sub?: ReactNode; actions?: ReactNode; crumb?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <header className="page-head page-head-row">
      <div className="min-w-0">
        {crumb && (
          <p className="crumb">
            <Link href={crumb.href}>‹ {crumb.label}</Link>
          </p>
        )}
        {eyebrow && <p className="kicker">{eyebrow}</p>}
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="page-loading" role="status">
      <Loader2 size={22} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonGrid({ count = 8, tall = false }: { count?: number; tall?: boolean }) {
  return (
    <div className="tile-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton ${tall ? "aspect-[3/4]" : "aspect-square"}`} />
      ))}
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  body,
  action,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty-icon" aria-hidden="true">
          <Icon size={26} />
        </span>
      )}
      <h2 className="empty-title">{title}</h2>
      {body && <p className="empty-body">{body}</p>}
      {(action || children) && (
        <div className="empty-actions">
          {action && (
            <Link href={action.href} className="btn-primary">
              {action.label}
            </Link>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-hidden="true" />;
}

/** Progress for a background job (scan, extraction, try-on). */
export function JobProgress({ job }: { job: { progress: number; status: string; steps: { label: string; status: string }[] } | null | undefined }) {
  if (!job || job.status !== "running") return null;
  const current = job.steps.find((s) => s.status === "running") ?? job.steps.find((s) => s.status === "pending");
  return (
    <div className="job-progress">
      <div className="job-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
        <span style={{ width: `${Math.max(6, job.progress * 100)}%` }} />
      </div>
      {current && <p className="job-label">{current.label}…</p>}
    </div>
  );
}

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), "day");
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
