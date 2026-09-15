import { useState } from "react";
import { Bell, ChevronRight, Compass, LayoutDashboard, Menu, MessageCircle, Settings2, Sparkles, Target, X } from "lucide-react";
import { Link, useLocation } from "wouter";

const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Ask Drip", href: "/ask", icon: MessageCircle },
  { label: "Research", href: "/research", icon: Compass },
  { label: "Settings", href: "/settings", icon: Settings2 },
];

export default function AtlasShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [location] = useLocation();
  const activeHref = location === "/" ? "/" : `/${location.split("/")[1]}`;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#172033]">
      {mobileNavOpen && <button aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#e3e8f0] bg-white px-5 py-6 shadow-2xl transition-transform duration-200 lg:z-20 lg:translate-x-0 lg:shadow-none ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-2"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1e4ed8] text-white shadow-[0_8px_20px_rgba(30,78,216,.22)]"><Sparkles size={19} /></div><div><p className="font-semibold tracking-tight">drip advisor</p><p className="text-[11px] text-slate-400">personal intelligence</p></div></div>
        <nav className="mt-12 space-y-2" aria-label="Primary navigation">{navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} onClick={() => setMobileNavOpen(false)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${activeHref === href ? "bg-[#eaf0ff] font-semibold text-[#1e4ed8]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><Icon size={17} />{label}{label === "Ask Drip" && <span className="ml-auto rounded-full bg-[#dbe5ff] px-2 py-0.5 text-[10px] font-semibold">AI</span>}</Link>)}</nav>
        <div className="mt-auto rounded-2xl bg-[#f1f5ff] p-4"><div className="mb-3 flex items-center gap-2 text-[#1e4ed8]"><Target size={16} /><span className="text-xs font-semibold">Today’s focus</span></div><p className="text-sm font-medium leading-5">Make progress on the one thing that matters.</p><Link href="/ask" onClick={() => setMobileNavOpen(false)} className="mt-4 inline-flex text-xs font-semibold text-[#1e4ed8]">Start focus mode <ChevronRight className="ml-1" size={13} /></Link></div>
      </aside>
      <main className="lg:pl-[248px]">
        <header className="sticky top-0 z-10 border-b border-[#e3e8f0]/80 bg-[#f7f9fc]/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-12"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="flex items-center gap-3"><button aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-white lg:hidden"><Menu size={20} /></button><div><p className="text-xs font-medium uppercase tracking-[.18em] text-slate-400">Monday · September 15, 2026</p><h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Good morning, there.</h1></div></div><div className="flex items-center gap-2"><button aria-label="Notifications" className="relative rounded-xl border border-[#e1e7f0] bg-white p-2.5 text-slate-500"><Bell size={17} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#f97362]" /></button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#dce7ff] text-sm font-semibold text-[#1e4ed8] sm:flex">A</div></div></div></header>
        {children}
      </main>
    </div>
  );
}
