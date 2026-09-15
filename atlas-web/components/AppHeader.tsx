"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, RefreshCw } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { unreadCount, type AgentNotification } from "@/lib/notifications";

const TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/inbox/, title: "Overview" }, { match: /^\/ask/, title: "Ask Atlas" },
  { match: /^\/wardrobe\/add/, title: "Add garment" }, { match: /^\/wardrobe/, title: "Wardrobe" },
  { match: /^\/looks/, title: "Looks" }, { match: /^\/money/, title: "Money review" },
  { match: /^\/travel/, title: "Travel" }, { match: /^\/tasks/, title: "Tasks" },
  { match: /^\/signals/, title: "Signal" }, { match: /^\/sources/, title: "Sources" },
  { match: /^\/settings\/privacy/, title: "Privacy & data" }, { match: /^\/settings/, title: "Preferences" },
];

export function AppHeader({ authControls }: { authControls?: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const unread = unreadCount(notifications);
  const title = TITLES.find((item) => item.match.test(pathname))?.title ?? "Atlas";
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { notifications?: AgentNotification[] };
        if (Array.isArray(data.notifications)) setNotifications(data.notifications);
      }
    } catch { /* preserve the last server-confirmed state while offline */ }
    finally { setLoaded(true); setRefreshing(false); }
  }, []);
  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const onDismiss = useCallback(async (id: string) => {
    const previous = notifications;
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item));
    try {
      const res = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error("notification update failed");
    } catch {
      setNotifications(previous);
    }
  }, [notifications]);

  return <>
    <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between gap-4 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-bg)_78%,transparent)] px-5 py-4 backdrop-blur-2xl sm:px-8">
      <div className="min-w-0"><div className="flex items-center gap-2 text-[.68rem] font-semibold uppercase tracking-[.16em] text-[var(--color-ink-muted)]"><span className="size-1.5 rounded-full bg-cyan-500" /> Personal command center <ChevronRight size={12} /></div><h1 className="mt-1 truncate font-display text-xl font-semibold tracking-[-.03em] text-[var(--color-ink)]">{title}</h1></div>
      <div className="flex shrink-0 items-center gap-2">{authControls}<ThemeToggle /><button type="button" onClick={() => { setDrawerOpen(true); void load(); }} aria-label={`Notifications (${unread} unread)`} aria-haspopup="dialog" className="relative grid size-10 place-items-center rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm transition hover:border-[var(--color-accent)] hover:shadow-[0_0_0_4px_var(--color-accent-soft)] active:scale-95"><Bell size={17} />{unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-danger)] px-1 text-[.58rem] font-bold text-white">{unread}</span>}</button></div>
    </header>
    <NotificationDrawer open={drawerOpen} notifications={notifications} onClose={() => setDrawerOpen(false)} onDismiss={onDismiss} refreshing={refreshing} onRefresh={() => void load()} />
  </>;
}
