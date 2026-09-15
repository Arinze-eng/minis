"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { unreadCount, type AgentNotification } from "@/lib/notifications";

const TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/inbox/,              title: "Inbox"           },
  { match: /^\/ask/,                title: "Ask Atlas"       },
  { match: /^\/wardrobe\/add/,      title: "Add garment"     },
  { match: /^\/wardrobe/,           title: "Wardrobe"        },
  { match: /^\/looks/,              title: "Looks"           },
  { match: /^\/money/,              title: "Money review"    },
  { match: /^\/travel/,             title: "Travel"          },
  { match: /^\/tasks/,              title: "Tasks"           },
  { match: /^\/signals/,            title: "Signal"          },
  { match: /^\/sources/,            title: "Sources"         },
  { match: /^\/settings\/privacy/,  title: "Privacy & data"  },
  { match: /^\/settings/,           title: "Preferences"     },
];

export function AppHeader({ authControls }: { authControls?: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const unread = unreadCount(notifications);
  const title = TITLES.find((t) => t.match.test(pathname))?.title ?? "Atlas";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: AgentNotification[] };
      if (Array.isArray(data.notifications)) setNotifications(data.notifications);
    } catch { /* offline */ } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const onDismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }, []);

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-4 h-16 px-6
                   bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-line)]
                   lg:px-8"
      >
        {/* Left: title + sentinel */}
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-display text-[1.05rem] font-semibold tracking-tight text-[var(--color-ink)] m-0 truncate">
            {title}
          </h1>

          {/* Sentinel pill — desktop only */}
          <span className="hidden lg:inline-flex items-center gap-1.5 text-[0.68rem] font-semibold
                           text-[var(--color-good-deep)] bg-[var(--color-good-soft)]
                           border border-[color-mix(in_srgb,var(--color-good)_30%,transparent)]
                           rounded-full px-2.5 py-0.5 whitespace-nowrap">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--color-good)]"
              style={{ animation: "sentinel-breathe 2.8s ease infinite" }}
              aria-hidden="true"
            />
            Active · read-only
          </span>
        </div>

        {/* Right: auth controls + theme toggle + bell */}
        <div className="flex items-center gap-2 shrink-0">
          {authControls}
          <ThemeToggle />
          <button
            type="button"
            onClick={() => { setDrawerOpen(true); void load(); }}
            aria-label={`Notifications (${unread} unread)`}
            aria-haspopup="dialog"
            className="relative grid place-items-center w-9 h-9 rounded-lg
                       border border-[var(--color-line-strong)] bg-[var(--color-surface)]
                       text-[var(--color-ink)] transition-all duration-150
                       hover:border-[var(--color-accent)] hover:shadow-[0_0_0_3px_var(--color-accent-soft)]
                       active:scale-95"
          >
            <Bell size={16} aria-hidden="true" />
            {unread > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full
                           bg-[var(--color-danger)] text-white text-[0.6rem] font-bold
                           grid place-items-center px-1 border-2 border-[var(--color-bg)]"
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
      />
    </>
  );
}
