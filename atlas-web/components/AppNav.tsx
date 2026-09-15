"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Map,
  Radio,
  Settings,
  Shirt,
  Sparkles,
  Wallet,
  Plane,
  CheckSquare,
  HelpCircle,
  LayoutGrid,
  Sliders,
  Menu,
  X,
} from "lucide-react";
import { RouteMark } from "@/components/RouteMark";

/**
 * Adaptive navigation.
 *
 *  - >=1024px: labelled sidebar with grouped destinations and a focus card.
 *  - <1024px: sticky brand bar, bottom tab bar for the five primary surfaces,
 *    and a drawer holding the complete navigation (so nothing is unreachable
 *    on a phone).
 *
 * Every destination is a real, reachable route; active state is `aria-current`.
 */

const NAV_GROUPS = [
  {
    label: "Today",
    items: [
      { href: "/inbox", label: "Inbox", icon: Sparkles },
      { href: "/ask", label: "Ask Atlas", icon: HelpCircle },
    ],
  },
  {
    label: "Life engines",
    items: [
      { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
      { href: "/looks", label: "Looks", icon: Map },
      { href: "/money", label: "Money review", icon: Wallet },
      { href: "/travel", label: "Travel", icon: Plane },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sources", label: "Sources", icon: Radio },
      { href: "/settings/privacy", label: "Privacy & data", icon: Settings },
      { href: "/settings/preferences", label: "Preferences", icon: Sliders },
    ],
  },
] as const;

/** Primary surfaces for the mobile tab bar (the rest live in the drawer). */
const TAB_ITEMS = [
  { href: "/inbox", label: "Inbox", icon: Sparkles },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/looks", label: "Looks", icon: Map },
  { href: "/money", label: "Money", icon: Wallet },
] as const;

function useActive(href: string): boolean {
  const pathname = usePathname();
  if (href === "/inbox") return pathname === "/inbox" || pathname.startsWith("/signals");
  if (href === "/settings/privacy") return pathname.startsWith("/settings/privacy");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, Icon }: { href: string; label: string; Icon: typeof Map }) {
  const active = useActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`nav-item ${active ? "nav-item-active" : ""}`}
    >
      <span className="nav-item-icon">
        <Icon size={17} aria-hidden="true" />
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function AppNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation completes, and on Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      {/* Desktop sidebar (>=1024px) */}
      <nav className="sidebar" aria-label="Primary">
        <Link href="/" className="sidebar-brand" aria-label="Atlas home">
          <RouteMark size={30} />
          <span className="sidebar-brand-copy">
            <strong>Atlas</strong>
            <small>personal lifestyle command center</small>
          </span>
        </Link>

        <div className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              <div className="nav-group-items">
                {group.items.map(({ href, label, icon }) => (
                  <NavLink key={href} href={href} label={label} Icon={icon} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="focus-card">
            <p className="focus-kicker">Today&rsquo;s focus</p>
            <p className="focus-copy">
              Make progress on the one thing that matters — the Inbox ranks
              what deserves attention first.
            </p>
            <Link className="focus-link" href="/inbox">
              Start focus mode →
            </Link>
          </div>
        </div>
      </nav>

      {/* Mobile / tablet brand bar */}
      <div className="mobile-bar">
        <Link href="/" className="mobile-brand" aria-label="Atlas home">
          <RouteMark size={24} />
          <span>Atlas</span>
        </Link>
        <div className="mobile-bar-actions">
          <button
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="tabbar" aria-label="Primary">
        {TAB_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`tab-item ${active ? "tab-item-active" : ""}`}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="tab-label">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`tab-item ${menuOpen ? "tab-item-active" : ""}`}
          onClick={() => setMenuOpen(true)}
          aria-label="More navigation"
          aria-haspopup="dialog"
        >
          <LayoutGrid size={20} aria-hidden="true" />
          <span className="tab-label">More</span>
        </button>
      </nav>

      {/* Full navigation drawer (<1024px) */}
      {menuOpen ? (
        <div className="drawer-root">
          <button
            type="button"
            className="drawer-overlay"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="drawer-panel drawer-panel-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="drawer-head">
              <h2>Navigate</h2>
              <button
                type="button"
                className="drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="drawer-nav-body">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="nav-group-label">{group.label}</p>
                  <div className="nav-group-items">
                    {group.items.map(({ href, label, icon }) => (
                      <NavLink key={href} href={href} label={label} Icon={icon} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
