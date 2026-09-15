"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles, HelpCircle, Shirt, Map, Wallet, Plane,
  CheckSquare, Radio, Settings, Sliders, LayoutGrid, Menu, X, Plus,
} from "lucide-react";
import { RouteMark } from "@/components/RouteMark";

const NAV_GROUPS = [
  {
    label: "Today",
    items: [
      { href: "/inbox",  label: "Inbox",     icon: Sparkles   },
      { href: "/ask",    label: "Ask Atlas",  icon: HelpCircle },
    ],
  },
  {
    label: "Life engines",
    items: [
      { href: "/wardrobe", label: "Wardrobe",       icon: Shirt       },
      { href: "/looks",    label: "Looks",           icon: Map         },
      { href: "/money",    label: "Money review",    icon: Wallet      },
      { href: "/travel",   label: "Travel",          icon: Plane       },
      { href: "/tasks",    label: "Tasks",           icon: CheckSquare },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sources",              label: "Sources",        icon: Radio    },
      { href: "/settings/privacy",     label: "Privacy & data", icon: Settings },
      { href: "/settings/preferences", label: "Preferences",    icon: Sliders  },
    ],
  },
] as const;

const TAB_ITEMS = [
  { href: "/inbox",    label: "Inbox",    icon: Sparkles },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt    },
  { href: "/money",    label: "Money",    icon: Wallet   },
  { href: "/sources",  label: "Sources",  icon: Radio    },
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
      className={[
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
        active
          ? "bg-white/10 text-white font-semibold"
          : "text-white/50 hover:bg-white/7 hover:text-white/85",
      ].join(" ")}
    >
      <Icon
        size={16}
        aria-hidden="true"
        className={active ? "text-blue-400 opacity-100" : "opacity-60"}
      />
      <span>{label}</span>
    </Link>
  );
}

export function AppNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Desktop sidebar ≥1024px                                            */}
      {/* ------------------------------------------------------------------ */}
      <nav
        className="hidden lg:flex fixed inset-y-0 left-0 w-[260px] flex-col z-50
                   bg-[#0f111a] border-r border-white/[0.06]
                   shadow-[4px_0_24px_rgba(0,0,0,0.18),inset_-1px_0_0_rgba(255,255,255,0.04)]"
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-3 px-5 py-7 border-b border-white/[0.06] shrink-0"
          aria-label="Atlas home"
        >
          <RouteMark size={28} />
          <div className="leading-tight">
            <strong className="block text-white font-bold text-[1.05rem] tracking-tight">Atlas</strong>
            <small className="block text-white/35 text-[0.62rem] mt-px tracking-wide">
              personal lifestyle command center
            </small>
          </div>
        </Link>

        {/* Nav groups */}
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-5 scrollbar-none">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-white/28 mb-1 ml-2">
                {group.label}
              </p>
              <div className="flex flex-col gap-px">
                {group.items.map(({ href, label, icon }) => (
                  <NavLink key={href} href={href} label={label} Icon={icon} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer quick actions */}
        <div className="shrink-0 p-3 border-t border-white/[0.06]">
          <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-white/28 mb-2.5">
              Quick actions
            </p>
            <Link
              href="/wardrobe/add"
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white/85 hover:bg-white/8
                         px-2 py-1.5 rounded-md transition-all duration-150"
            >
              <Plus size={13} aria-hidden="true" />
              Add garment
            </Link>
            <Link
              href="/money"
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white/85 hover:bg-white/8
                         px-2 py-1.5 rounded-md transition-all duration-150"
            >
              <Wallet size={13} aria-hidden="true" />
              Money review
            </Link>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile top bar <1024px                                             */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="lg:hidden sticky top-0 z-50 flex items-center justify-between h-14 px-4
                   bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-line)]"
      >
        <Link href="/" className="flex items-center gap-2 font-bold text-[1rem]" aria-label="Atlas home">
          <RouteMark size={22} />
          <span>Atlas</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          className="grid place-items-center w-9 h-9 rounded-lg border border-[var(--color-line-strong)]
                     bg-[var(--color-surface)] text-[var(--color-ink)]
                     hover:border-[var(--color-accent)] transition-colors duration-150"
        >
          <Menu size={17} aria-hidden="true" />
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile bottom tab bar                                              */}
      {/* ------------------------------------------------------------------ */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-50 flex justify-around items-stretch
                   bg-[var(--color-chrome)]/92 backdrop-blur-2xl border-t border-white/[0.07]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "calc(56px + env(safe-area-inset-bottom,0px))" }}
        aria-label="Primary navigation"
      >
        {TAB_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex flex-col items-center justify-center gap-1 flex-1 text-[0.58rem] font-semibold",
                "rounded-lg mx-1 my-1.5 transition-all duration-150",
                active
                  ? "text-blue-400 bg-blue-400/14"
                  : "text-white/45 hover:text-white/70",
              ].join(" ")}
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="More navigation"
          className={[
            "flex flex-col items-center justify-center gap-1 flex-1 text-[0.58rem] font-semibold",
            "rounded-lg mx-1 my-1.5 transition-all duration-150",
            menuOpen ? "text-blue-400 bg-blue-400/14" : "text-white/45 hover:text-white/70",
          ].join(" ")}
        >
          <LayoutGrid size={19} aria-hidden="true" />
          More
        </button>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile nav drawer                                                  */}
      {/* ------------------------------------------------------------------ */}
      {menuOpen && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm border-0 cursor-pointer"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            style={{ animation: "overlay-in 280ms ease" }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-[min(300px,88vw)] bg-[var(--color-surface)]
                       border-r border-[var(--color-line)] shadow-xl flex flex-col overflow-y-auto"
            style={{ animation: "drawer-in-left 280ms cubic-bezier(0.32,0.72,0,1)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
              <h2 className="font-bold text-base">Navigate</h2>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
                className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--color-line-strong)]
                           hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 flex flex-col gap-5 p-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.13em] text-[var(--color-ink-muted)] mb-1 ml-2">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map(({ href, label, icon }) => (
                      <NavLink key={href} href={href} label={label} Icon={icon} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
