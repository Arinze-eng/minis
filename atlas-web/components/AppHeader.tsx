"use client";

import { useMutation, useQuery } from "convex/react";
import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { RouteMark } from "@/components/RouteMark";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AgentNotification } from "@/lib/notifications";

const TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/inbox/, title: "Today" },
  { match: /^\/ask/, title: "Stylist" },
  { match: /^\/wardrobe\/add/, title: "Add clothes" },
  { match: /^\/wardrobe/, title: "Wardrobe" },
  { match: /^\/looks/, title: "Looks" },
  { match: /^\/money/, title: "Money" },
  { match: /^\/travel/, title: "Travel" },
  { match: /^\/tasks/, title: "Tasks" },
  { match: /^\/signals/, title: "Signal" },
  { match: /^\/sources/, title: "Sources" },
  { match: /^\/settings\/privacy/, title: "Privacy & data" },
  { match: /^\/settings\/preferences/, title: "Preferences" },
  { match: /^\/settings\/photos/, title: "Your photos" },
  { match: /^\/settings/, title: "Settings" },
  { match: /^\/admin/, title: "Admin" },
];

const URGENCY: Record<string, AgentNotification["urgency"]> = { high: "urgent", urgent: "urgent", review: "review" };

export function AppHeader({ authControls }: { authControls?: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const rows = useQuery(api.inbox.notifications);
  const markRead = useMutation(api.inbox.markRead);
  const title = TITLES.find((t) => t.match.test(pathname))?.title ?? "Atlas";

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

  // Large-title pattern: the bar shows the title once the page's own large title scrolls away.
  const [showTitle, setShowTitle] = useState(false);
  useEffect(() => {
    const hasLargeTitle = Boolean(document.querySelector("main h1"));
    const update = () => setShowTitle(!hasLargeTitle || window.scrollY > 48);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-3 h-[52px] px-4 lg:px-8
                   bg-[var(--material-bar)] backdrop-blur-xl backdrop-saturate-[1.8]
                   border-b border-[var(--color-line)]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="lg:hidden shrink-0" aria-hidden="true">
            <RouteMark size={24} />
          </span>
          <p
            className="m-0 truncate text-[17px] font-semibold tracking-tight text-[var(--color-ink)] transition-opacity duration-200"
            style={{ opacity: showTitle ? 1 : 0 }}
            aria-hidden={!showTitle}
          >
            {title}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {authControls}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Notifications (${unread} unread)`}
            aria-haspopup="dialog"
            className="press relative grid place-items-center w-11 h-11 lg:w-9 lg:h-9 rounded-full
                       bg-transparent border-0 text-[var(--color-accent)] hover:bg-[var(--color-fill)] transition-colors duration-150"
          >
            <Bell size={20} aria-hidden="true" />
            {unread > 0 && (
              <span
                className="absolute top-1 right-1 lg:-top-0.5 lg:-right-0.5 min-w-[18px] h-[18px] rounded-full
                           bg-[var(--color-danger)] text-white text-[11px] font-semibold grid place-items-center px-1"
                aria-hidden="true"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <NotificationDrawer
        open={drawerOpen}
        notifications={notifications}
        onClose={() => setDrawerOpen(false)}
        onDismiss={(id) => void markRead({ notificationId: id as Id<"notifications"> })}
      />
    </>
  );
}
