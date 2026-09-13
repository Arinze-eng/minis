"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { demoNotifications } from "@/lib/demo/agent";
import { unreadCount, type AgentNotification } from "@/lib/notifications";

/**
 * App header: page identity, autonomous status pill ("Sentinel"), the
 * notification bell that opens the slide-over, and the theme toggle.
 * Sentinel copy states what the agent actually watches — no fake "AI".
 */

const TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/inbox/, title: "Inbox" },
  { match: /^\/wardrobe\/add/, title: "Add garment" },
  { match: /^\/wardrobe/, title: "Wardrobe" },
  { match: /^\/looks/, title: "Looks" },
  { match: /^\/money/, title: "Money review" },
  { match: /^\/sources/, title: "Sources" },
  { match: /^\/settings/, title: "Privacy & data" },
];

export function AppHeader() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>(() =>
    demoNotifications(),
  );
  const unread = unreadCount(notifications);
  const title =
    TITLES.find((t) => t.match.test(
      typeof window === "undefined" ? "" : window.location.pathname,
    ))?.title ?? "Atlas";

  return (
    <>
      <header className="app-header">
        <div className="app-header-identity">
          <h1 className="app-header-title">{title}</h1>
          <span className="sentinel-pill" title="Atlas runs scheduled, consented checks — read-only">
            <span className="sentinel-dot" aria-hidden="true" />
            Sentinel active · renewals &amp; weather
          </span>
        </div>
        <div className="app-header-actions">
          <ThemeToggle />
          <button
            type="button"
            className="bell-button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Notifications (${unread} unread)`}
            aria-haspopup="dialog"
          >
            <Bell size={18} aria-hidden="true" />
            {unread > 0 ? (
              <span className="bell-badge" aria-hidden="true">
                {unread}
              </span>
            ) : null}
          </button>
        </div>
      </header>
      <NotificationDrawer
        open={drawerOpen}
        notifications={notifications}
        onClose={() => setDrawerOpen(false)}
        onDismiss={(id) =>
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
          )
        }
      />
    </>
  );
}
