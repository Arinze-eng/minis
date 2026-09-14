"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { AuthControls } from "@/components/AuthControls";
import { unreadCount, type AgentNotification } from "@/lib/notifications";

/**
 * App header wired to the notifications API. Sentinel copy states what the
 * agent actually watches — no fake "AI". The drawer's data comes from the
 * store (derived server-side); dismiss marks the item read via PATCH.
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

export function AppHeader({ clerkEnabled }: { clerkEnabled: boolean }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const unread = unreadCount(notifications);
  const title =
    TITLES.find((t) => t.match.test(
      typeof window === "undefined" ? "" : window.location.pathname,
    ))?.title ?? "Atlas";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: AgentNotification[] };
      if (Array.isArray(data.notifications)) setNotifications(data.notifications);
    } catch {
      /* offline: keep whatever we have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const onDismiss = useCallback(
    (id: string) => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      void fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    },
    [],
  );

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
          <AuthControls clerkEnabled={clerkEnabled} />
          <ThemeToggle />
          <button
            type="button"
            className="bell-button"
            onClick={() => {
              setDrawerOpen(true);
              void load();
            }}
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
        onDismiss={onDismiss}
      />
    </>
  );
}
