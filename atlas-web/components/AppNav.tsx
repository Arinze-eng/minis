"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox, MessageCircle, Shirt, Layers, Wallet, Plane, CheckSquare,
  Radio, Shield, Bell, Settings, Plus,
} from "lucide-react";
import { RouteMark } from "@/components/RouteMark";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Primary navigation, per the HIG:
 *  - phones/tablets: a bottom tab bar of five single-word tabs that only
 *    navigate (no "More" tab, nothing hidden). Everything else is reachable
 *    from Settings.
 *  - desktop (≥1024px): a sidebar of at most two levels that follows the
 *    current appearance, with the primary action at the top, not the bottom.
 */

type Item = { href: string; label: string; icon: typeof Inbox; also?: string[] };

const SIDEBAR: { label?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox, also: ["/signals"] },
      { href: "/ask", label: "Ask Atlas", icon: MessageCircle },
    ],
  },
  {
    label: "Life",
    items: [
      { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
      { href: "/looks", label: "Looks", icon: Layers },
      { href: "/money", label: "Money", icon: Wallet },
      { href: "/travel", label: "Travel", icon: Plane },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings", label: "General", icon: Settings },
      { href: "/sources", label: "Sources", icon: Radio },
      { href: "/settings/privacy", label: "Privacy & data", icon: Shield },
      { href: "/settings/preferences", label: "Notifications", icon: Bell },
    ],
  },
];

const TABS: Item[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox, also: ["/signals"] },
  { href: "/ask", label: "Ask", icon: MessageCircle },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt, also: ["/looks"] },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings, also: ["/sources", "/travel", "/tasks"] },
];

function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar rows match exactly (so /settings ≠ /settings/privacy); tabs match subtrees. */
function sidebarActive(pathname: string, item: Item): boolean {
  if (item.href === "/settings") return pathname === "/settings";
  return under(pathname, item.href) || (item.also ?? []).some((h) => under(pathname, h));
}

function tabActive(pathname: string, item: Item): boolean {
  return under(pathname, item.href) || (item.also ?? []).some((h) => under(pathname, h));
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        className="hidden lg:flex fixed inset-y-0 left-0 w-[260px] flex-col z-40
                   bg-[var(--color-surface)] border-r border-[var(--color-line)]"
        aria-label="Primary navigation"
      >
        <Link
          href="/inbox"
          className="flex items-center gap-2.5 px-5 pt-6 pb-4 no-underline shrink-0"
          aria-label="Atlas inbox"
        >
          <RouteMark size={28} />
          <strong className="text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">Atlas</strong>
        </Link>

        <div className="px-3 pb-3 shrink-0">
          <Link href="/wardrobe/add" className="btn-primary w-full">
            <Plus size={16} aria-hidden="true" />
            Add garment
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-5 scrollbar-none">
          {SIDEBAR.map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label && (
                <p className="text-[12px] font-semibold text-[var(--color-ink-muted)] mb-1 ml-3">
                  {group.label}
                </p>
              )}
              <ul className="flex flex-col gap-px list-none m-0 p-0">
                {group.items.map((item) => {
                  const active = sidebarActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex items-center gap-3 px-3 min-h-9 rounded-[10px] text-[15px] no-underline",
                          "transition-colors duration-150",
                          active
                            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-deep)] font-semibold"
                            : "text-[var(--color-ink)] hover:bg-[var(--color-fill)]",
                        ].join(" ")}
                      >
                        <Icon
                          size={18}
                          aria-hidden="true"
                          className={active ? "" : "text-[var(--color-accent)]"}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-[var(--color-line)] flex items-center justify-between gap-2">
          <span className="text-[13px] text-[var(--color-ink-muted)]">Appearance</span>
          <ThemeToggle />
        </div>
      </nav>

      {/* Phone / tablet tab bar */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5
                   bg-[var(--material-bar)] backdrop-blur-xl backdrop-saturate-[1.8]
                   border-t border-[var(--color-line)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Primary navigation"
      >
        {TABS.map((item) => {
          const active = tabActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex flex-col items-center justify-center gap-0.5 h-[50px] no-underline",
                "text-[11px] font-medium tracking-normal press",
                active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]",
              ].join(" ")}
            >
              <Icon size={24} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
