"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { RouteMark } from "@/components/RouteMark";
import { unreadCount, type AgentNotification } from "@/lib/notifications";

const TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/inbox/,              title: "Overview"        },
  { match: /^\/ask/,                title: "Ask Atlas"       },
  { match: /^\/wardrobe\/add/,      title: "Add garment"     },
  { match: /^\/wardrobe/,           title: "Wardrobe"        },
  { match: /^\/looks/,              title: "Looks"           },
  { match: /^\/money/,              title: "Money"           },
  { match: /^\/travel/,             title: "Travel"          },
  { match: /^\/tasks/,              title: "Tasks"           },
  { match: /^\/signals/,            title: "Signal"          },
  { match: /^\/sources/,            title: "Sources"         },
  { match: /^\/settings\/privacy/,  title: "Privacy & data"  },
  { match: /^\/settings\/preferences/, title: "Notifications" },
  { match: /^\/settings/,           title: "Settings"        },
];

export function AppHeader({ authControls }: { authControls?: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const unread = unreadCount(notifications);
  const title = TITLES.find((t) => t.match.test(pathname))?.title ?? "Atlas";

  // Large-title pattern: the bar shows the title only once the page's own
  // large title has scrolled away (or when the page has none).
  const [showTitle, setShowTitle] = useState(false);
  useEffect(() => {
    const hasLargeTitle = Boolean(document.querySelector("main h1"));
    const update = () => setShowTitle(!hasLargeTitle || window.scrollY > 48);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { notifications?: AgentNotification[] };
        if (Array.isArray(data.notifications)) setNotifications(data.notifications);
      }
    } catch { /* preserve the last server-confirmed state while offline */ } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Optimistic mark-read; roll back if the server does not confirm it.
  const onDismiss = useCallback(async (id: string) => {
    const previous = notifications;
    setNotifications((items) => items.map((n) => n.id === id ? { ...n, read: true } : n));
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("notification update failed");
    } catch {
      setNotifications(previous);
    }
  }, [notifications]);

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
            className="m-0 truncate text-[17px] font-semibold tracking-tight text-[var(--color-ink)]
                       transition-opacity duration-200"
            style={{ opacity: showTitle ? 1 : 0 }}
            aria-hidden={!showTitle}
          >
            {title}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden lg:inline-flex badge badge-good" title="Atlas only reads; it never acts without asking">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-good)]" aria-hidden="true" />
            Read-only
          </span>
          {authControls}
          <button
            type="button"
            onClick={() => { setDrawerOpen(true); void load(); }}
            aria-label={`Notifications (${unread} unread)`}
            aria-haspopup="dialog"
            className="press relative grid place-items-center w-11 h-11 lg:w-9 lg:h-9 rounded-full
                       bg-transparent border-0 text-[var(--color-accent)]
                       hover:bg-[var(--color-fill)] transition-colors duration-150"
          >
            <Bell size={20} aria-hidden="true" />
            {unread > 0 && (
              <span
                className="absolute top-1 right-1 lg:-top-0.5 lg:-right-0.5 min-w-[18px] h-[18px] rounded-full
                           bg-[var(--color-danger)] text-white text-[11px] font-semibold
                           grid place-items-center px-1"
                aria-hidden="true"
              >
                {unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <NotificationDrawer
        open={drawerOpen}
        notifications={notifications}
        onClose={() => setDrawerOpen(false)}
        onDismiss={onDismiss}
        refreshing={refreshing}
        onRefresh={() => void load()}
      />
    </>
  );
}
