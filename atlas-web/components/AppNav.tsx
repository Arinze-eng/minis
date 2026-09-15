"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles, HelpCircle, Shirt, Map, Wallet, Plane, CheckSquare,
  Radio, Settings, Sliders, LayoutGrid, Menu, X, Plus, ArrowUpRight,
} from "lucide-react";
import { RouteMark } from "@/components/RouteMark";

const NAV_GROUPS = [
  { label: "Today", items: [
    { href: "/inbox", label: "Overview", icon: Sparkles },
    { href: "/ask", label: "Ask Atlas", icon: HelpCircle },
  ] },
  { label: "Life engines", items: [
    { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
    { href: "/looks", label: "Looks", icon: Map },
    { href: "/money", label: "Money review", icon: Wallet },
    { href: "/travel", label: "Travel", icon: Plane },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
  ] },
  { label: "System", items: [
    { href: "/sources", label: "Sources", icon: Radio },
    { href: "/settings/privacy", label: "Privacy & data", icon: Settings },
    { href: "/settings/preferences", label: "Preferences", icon: Sliders },
  ] },
] as const;

const TAB_ITEMS = [
  { href: "/inbox", label: "Home", icon: Sparkles },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/sources", label: "Sources", icon: Radio },
] as const;

function useActive(href: string) {
  const pathname = usePathname();
  if (href === "/inbox") return pathname === "/inbox" || pathname.startsWith("/signals");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, Icon, onClick }: { href: string; label: string; Icon: typeof Map; onClick?: () => void }) {
  const active = useActive(href);
  return (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[0.86rem] font-medium transition-all duration-200 active:scale-[.98] ${
        active ? "bg-white/[.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]" : "text-white/52 hover:bg-white/[.07] hover:text-white/90"
      }`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl transition-colors ${active ? "bg-cyan-300/15 text-cyan-200" : "bg-white/[.05] text-white/48 group-hover:text-white/80"}`}>
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <span className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(165,243,252,.9)]" aria-hidden="true" />}
    </Link>
  );
}

export function AppNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[276px] flex-col overflow-hidden border-r border-white/[.08] bg-[#101419]/95 px-4 py-5 shadow-[20px_0_70px_rgba(7,12,18,.16)] backdrop-blur-2xl lg:flex" aria-label="Primary navigation">
        <Link href="/" className="mb-5 flex items-center gap-3 rounded-2xl px-3 py-3" aria-label="Atlas home">
          <RouteMark size={36} />
          <span className="min-w-0 leading-tight"><strong className="block text-[1.05rem] font-semibold tracking-[-.02em] text-white">Atlas</strong><small className="mt-1 block text-[.64rem] tracking-[.08em] text-white/38">LIFE, WITH CLARITY</small></span>
        </Link>
        <div className="mb-5 rounded-2xl border border-cyan-200/10 bg-gradient-to-br from-cyan-200/[.12] to-white/[.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
          <div className="mb-2 flex items-center justify-between"><span className="text-[.64rem] font-semibold uppercase tracking-[.14em] text-cyan-100/65">Atlas status</span><span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.9)]" /></div>
          <p className="text-[.82rem] leading-relaxed text-white/68">Watching your connected life, ready when you are.</p>
        </div>
        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 scrollbar-none">
          {NAV_GROUPS.map((group) => <section key={group.label}><p className="mb-2 px-3 text-[.62rem] font-semibold uppercase tracking-[.16em] text-white/28">{group.label}</p><div className="space-y-1">{group.items.map(({ href, label, icon }) => <NavLink key={href} href={href} label={label} Icon={icon} />)}</div></section>)}
        </nav>
        <div className="mt-4 space-y-2 border-t border-white/[.08] pt-4">
          <Link href="/wardrobe/add" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[.8rem] font-medium text-white/56 transition hover:bg-white/[.06] hover:text-white"><Plus size={15} /> Add garment <ArrowUpRight className="ml-auto size-3.5 opacity-40" /></Link>
          <Link href="/sources" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[.8rem] font-medium text-white/56 transition hover:bg-white/[.06] hover:text-white"><Radio size={15} /> Connect a source <ArrowUpRight className="ml-auto size-3.5 opacity-40" /></Link>
        </div>
      </aside>

      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-bg)_78%,transparent)] px-4 backdrop-blur-2xl lg:hidden">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-[var(--color-ink)]" aria-label="Atlas home"><RouteMark size={27} /><span>Atlas</span></Link>
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen} className="grid size-10 place-items-center rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm transition hover:border-[var(--color-accent)] active:scale-95"><Menu size={18} /></button>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-50 flex h-[66px] items-stretch rounded-2xl border border-white/[.1] bg-[#14191f]/90 p-1.5 shadow-[0_16px_50px_rgba(10,15,22,.28)] backdrop-blur-2xl lg:hidden" aria-label="Primary navigation">
        {TAB_ITEMS.map(({ href, label, icon: Icon }) => { const active = useActive(href); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[.62rem] font-semibold transition ${active ? "bg-white/[.12] text-cyan-200" : "text-white/45 hover:text-white/75"}`}><Icon size={18} /><span>{label}</span></Link>; })}
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="More navigation" className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[.62rem] font-semibold text-white/45 transition hover:text-white/75"><LayoutGrid size={18} /><span>More</span></button>
      </nav>

      {menuOpen && <div className="fixed inset-0 z-[100] lg:hidden"><button type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="absolute inset-0 cursor-pointer border-0 bg-slate-950/55 backdrop-blur-sm" /><div role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 flex w-[min(340px,88vw)] flex-col overflow-y-auto border-r border-white/[.1] bg-[#12171d] p-5 shadow-2xl"><div className="mb-7 flex items-center justify-between"><span className="text-sm font-semibold text-white">Navigate Atlas</span><button type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation" className="grid size-9 place-items-center rounded-xl border border-white/10 text-white/70 hover:bg-white/10"><X size={16} /></button></div>{NAV_GROUPS.map((group) => <section key={group.label} className="mb-6"><p className="mb-2 px-3 text-[.62rem] font-semibold uppercase tracking-[.16em] text-white/30">{group.label}</p><div className="space-y-1">{group.items.map(({ href, label, icon }) => <NavLink key={href} href={href} label={label} Icon={icon} onClick={() => setMenuOpen(false)} />)}</div></section>)}</div></div>}
    </>
  );
}
