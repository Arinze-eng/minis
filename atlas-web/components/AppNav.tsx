"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Map,
  Radio,
  Settings,
  Shirt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { RouteMark } from "@/components/RouteMark";

/**
 * Adaptive navigation: fixed bottom tab-bar on mobile (<768px), slim left
 * dock on desktop. Active state renders as an indicator; every icon-only
 * control carries an accessible label (aria-label + visually-hidden text).
 */

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox", icon: Sparkles },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/looks", label: "Looks", icon: Map },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/sources", label: "Sources", icon: Radio },
  { href: "/settings/privacy", label: "Privacy", icon: Settings },
] as const;

function useActive(href: string): boolean {
  const pathname = usePathname();
  if (href === "/inbox") return pathname === "/inbox" || pathname.startsWith("/signals");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  label,
  Icon,
  layout,
}: {
  href: string;
  label: string;
  Icon: typeof Map;
  layout: "dock" | "tabbar";
}) {
  const active = useActive(href);
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={
        layout === "dock"
          ? `dock-item ${active ? "dock-item-active" : ""}`
          : `tab-item ${active ? "tab-item-active" : ""}`
      }
    >
      <Icon size={layout === "dock" ? 19 : 20} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
      {layout === "tabbar" ? <span className="tab-label">{label}</span> : null}
    </Link>
  );
}

export function AppNav() {
  return (
    <>
      {/* Desktop dock (>=768px) */}
      <nav className="dock" aria-label="Primary">
        <Link href="/" className="dock-brand" aria-label="Atlas home">
          <RouteMark size={30} />
        </Link>
        <div className="dock-items">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <NavItem key={href} href={href} label={label} Icon={Icon} layout="dock" />
          ))}
        </div>
      </nav>

      {/* Mobile bottom tab bar (<768px), safe-area padded */}
      <nav className="tabbar" aria-label="Primary">
        {NAV_ITEMS.slice(0, 6).map(({ href, label, icon: Icon }) => (
          <NavItem key={href} href={href} label={label} Icon={Icon} layout="tabbar" />
        ))}
      </nav>
    </>
  );
}
