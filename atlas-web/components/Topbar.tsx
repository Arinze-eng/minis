"use client";

import { useMutation, useQuery } from "convex/react";
import { Activity, ArrowUpRight, Bell, Check, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { useStylistPanel } from "@/components/StylistPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JobProgress, Spinner } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AgentNotification } from "@/lib/notifications";

export const PRIMARY_NAV = [
  { href: "/inbox", label: "Today", also: ["/signals"] },
  { href: "/wardrobe", label: "Wardrobe", exact: true },
  { href: "/wardrobe/add", label: "Add clothes" },
  { href: "/looks", label: "Looks" },
  { href: "/travel", label: "Travel" },
  { href: "/money", label: "Money" },
] as const;

const SECONDARY_NAV = [
  { href: "/settings", label: "Settings" },
  { href: "/settings/photos", label: "Your photos" },
  { href: "/sources", label: "Sources" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings/privacy", label: "Privacy & data" },
];

function active(pathname: string, item: (typeof PRIMARY_NAV)[number]) {
  if ("exact" in item && item.exact) return pathname === item.href || (pathname.startsWith("/wardrobe/") && !pathname.startsWith("/wardrobe/add"));
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || ("also" in item && item.also.some((h) => pathname.startsWith(h)));
}

/** Small anchored popover: closes on outside click and Escape. */
function Popover({ label, icon, badge, children }: { label: string; icon: ReactNode; badge?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={root}>
      <button type="button" className="icon-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        {badge ? <span className="icon-badge">{badge > 9 ? "9+" : badge}</span> : null}
      </button>
      {open && <div className="popover">{children(() => setOpen(false))}</div>}
    </div>
  );
}

const JOB_TITLE: Record<string, string> = { scan: "Finding clothes", extract: "Cutting out pieces", tryon: "Try-on", gmail_scan: "Scanning Gmail" };

function ActivityMenu() {
  const jobs = useQuery(api.items.jobs);
  const review = useQuery(api.uploads.needsReview);
  const count = (jobs?.length ?? 0) + (review?.length ?? 0);
  return (
    <Popover label={count ? `Activity: ${count} in progress` : "Activity"} icon={jobs?.length ? <Spinner size={16} /> : <Activity size={17} />} badge={count}>
      {(close) => (
        <>
          <p className="popover-head">
            <span className="kicker">In the studio</span>
          </p>
          {count === 0 ? (
            <p className="popover-empty">
              <Check size={15} aria-hidden="true" /> All caught up. Imports and try-ons show here while they run.
            </p>
          ) : (
            <ul className="popover-list">
              {(review?.length ?? 0) > 0 && (
                <li>
                  <Link href="/wardrobe/add" onClick={close}>
                    <span className="flex-1">
                      <span className="block font-medium">Ready to review</span>
                      <span className="list-sub">
                        {review!.length} photo{review!.length === 1 ? "" : "s"} · choose what to add
                      </span>
                    </span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              )}
              {jobs?.map((job) => (
                <li key={job._id}>
                  <Link href={job.type === "tryon" ? "/looks" : job.type === "gmail_scan" ? "/sources" : "/wardrobe/add"} onClick={close}>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium">{JOB_TITLE[job.type] ?? job.type}</span>
                      <JobProgress job={job} />
                    </span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="popover-foot">Keep exploring — Atlas tells you when it&apos;s done.</p>
        </>
      )}
    </Popover>
  );
}

const URGENCY: Record<string, AgentNotification["urgency"]> = { high: "urgent", urgent: "urgent", review: "review" };

function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const rows = useQuery(api.inbox.notifications);
  const markRead = useMutation(api.inbox.markRead);
  const notifications = useMemo<AgentNotification[]>(
    () =>
      (rows ?? []).map((n) => ({
        id: n._id,
        category: n.category,
        title: n.title,
        detail: n.detail,
        action: { kind: "link", label: n.action.label, href: n.action.href },
        createdAt: new Date(n.createdAt).toISOString(),
        read: n.read,
        urgency: URGENCY[n.urgency] ?? "normal",
      })),
    [rows],
  );
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <>
      <button type="button" className="icon-btn" aria-label={`Notifications (${unread} unread)`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Bell size={17} aria-hidden="true" />
        {unread > 0 && <span className="icon-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <NotificationDrawer
        open={open}
        notifications={notifications}
        onClose={() => setOpen(false)}
        onDismiss={(id) => void markRead({ notificationId: id as Id<"notifications"> })}
      />
    </>
  );
}

export function Topbar({ account }: { account?: ReactNode }) {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const stylist = useStylistPanel();
  const onboarded = Boolean(me?.onboardedAt);

  return (
    <header className="topbar">
      <div className="topbar-row">
        <Link href="/inbox" className="wordmark" aria-label="Atlas home">
          <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M14 3 25 25H3L14 3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M8.5 18h11" stroke="currentColor" strokeWidth="2.2" />
          </svg>
          <span>
            atlas<span className="text-[var(--color-ink-muted)]">.</span>
          </span>
        </Link>
        {onboarded && (
          <nav aria-label="Main navigation" className="topnav">
            {PRIMARY_NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={active(pathname, item) ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="topbar-actions">
          {onboarded && (
            <button type="button" className="btn-primary topbar-ask" aria-expanded={stylist.open} aria-controls="stylist-panel" onClick={() => (pathname.startsWith("/ask") ? undefined : stylist.toggle())}>
              <Sparkles size={14} aria-hidden="true" />
              <span>Ask stylist</span>
            </button>
          )}
          {/* Phones trade the activity menu for the theme toggle; running jobs also show on Today. */}
          <span className="hidden sm:contents">
            <ActivityMenu />
          </span>
          <NotificationsButton />
          <ThemeToggle />
          <Popover label="Settings" icon={<Settings size={17} />}>
            {(close) => (
              <ul className="popover-list">
                {[...SECONDARY_NAV, ...(me?.role === "admin" ? [{ href: "/admin", label: "AI usage" }] : [])].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} onClick={close}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
          <div className="topbar-account">{account}</div>
        </div>
      </div>
      {onboarded && (
        <nav aria-label="Mobile navigation" className="topnav-mobile">
          {[...PRIMARY_NAV, { href: "/ask", label: "Stylist" } as const].map((item) => (
            <Link key={item.href} href={item.href} aria-current={("exact" in item ? active(pathname, item) : pathname.startsWith(item.href)) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
