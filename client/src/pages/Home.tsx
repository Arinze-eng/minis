import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleAlert,
  Compass,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Search,
  Settings2,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const tasks = [
  { title: "Review your pending tasks", source: "Google Tasks", meta: "1 overdue · 3 due soon", tone: "rose" },
  { title: "Plan a focused work block", source: "Drip Advice", meta: "Suggested for this morning", tone: "amber" },
  { title: "Compare black running shoes", source: "Shopping research", meta: "Under $100 · 5 sources", tone: "blue" },
];

const integrations = [
  { label: "Groq / Strands", status: "Live", detail: "Agent runtime", color: "bg-emerald-400" },
  { label: "Google Tasks", status: "Connected", detail: "Read-only", color: "bg-emerald-400" },
  { label: "SerpApi", status: "Connected", detail: "Research", color: "bg-emerald-400" },
  { label: "Telegram", status: "Safe mode", detail: "Delivery disabled", color: "bg-amber-400" },
];

export default function Home() {
  const [activeView, setActiveView] = useState("Overview");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);

  const filteredTasks = useMemo(
    () => tasks.filter((task) => `${task.title} ${task.source}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const markDone = (title: string) => {
    setCompleted((items) => (items.includes(title) ? items : [...items, title]));
    setNotice("Marked as complete. Your next drip will reflect the update.");
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#172033]">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-[#e3e8f0] bg-white px-5 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1e4ed8] text-white shadow-[0_8px_20px_rgba(30,78,216,.22)]"><Sparkles size={19} /></div>
          <div><p className="font-semibold tracking-tight">drip advisor</p><p className="text-[11px] text-slate-400">personal intelligence</p></div>
        </div>
        <nav className="mt-12 space-y-2">
          {[{ label: "Overview", icon: LayoutDashboard }, { label: "Ask Drip", icon: MessageCircle }, { label: "Research", icon: Compass }, { label: "Settings", icon: Settings2 }].map(({ label, icon: Icon }) => (
            <button key={label} onClick={() => setActiveView(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${activeView === label ? "bg-[#eaf0ff] font-semibold text-[#1e4ed8]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
              <Icon size={17} />{label}{label === "Ask Drip" && <span className="ml-auto rounded-full bg-[#dbe5ff] px-2 py-0.5 text-[10px] font-semibold">AI</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-[#f1f5ff] p-4"><div className="mb-3 flex items-center gap-2 text-[#1e4ed8]"><Target size={16} /><span className="text-xs font-semibold">Today’s focus</span></div><p className="text-sm font-medium leading-5">Make progress on the one thing that matters.</p><button onClick={() => setNotice("Focus mode is ready for your next task.")} className="mt-4 text-xs font-semibold text-[#1e4ed8]">Start focus mode <ArrowUpRight className="ml-1 inline" size={13} /></button></div>
      </aside>

      <main className="lg:pl-[248px]">
        <header className="sticky top-0 z-10 border-b border-[#e3e8f0]/80 bg-[#f7f9fc]/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 lg:hidden"><Menu size={20} /></button><div><p className="text-xs font-medium uppercase tracking-[.18em] text-slate-400">Monday · September 15, 2026</p><h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Good morning, there.</h1></div></div><div className="flex items-center gap-2"><button className="relative rounded-xl border border-[#e1e7f0] bg-white p-2.5 text-slate-500"><Bell size={17} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#f97362]" /></button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#dce7ff] text-sm font-semibold text-[#1e4ed8] sm:flex">A</div></div></div>
        </header>

        <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 lg:px-12 lg:py-10">
          <section className="relative overflow-hidden rounded-[26px] bg-[#173a9b] p-6 text-white shadow-[0_18px_45px_rgba(23,58,155,.18)] sm:p-8"><div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[28px] border-white/10" /><div className="absolute -bottom-36 right-28 h-72 w-72 rounded-full border-[26px] border-white/5" /><div className="relative max-w-2xl"><div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-blue-100"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Drip is online</div><h2 className="max-w-xl text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">Your next best move is already in view.</h2><p className="mt-4 max-w-lg text-sm leading-6 text-blue-100 sm:text-base">I’ve connected your signals, found one overdue task, and lined up the context you need to move forward.</p><button onClick={() => setNotice("Your focused plan is ready — start with the overdue task.")} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#173a9b] transition hover:bg-blue-50">Show me what matters <ChevronRight size={16} /></button></div></section>

          {notice && <div className="mt-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span className="flex items-center gap-2"><Check size={16} /> {notice}</span><button onClick={() => setNotice(null)}><X size={15} /></button></div>}

          <div className="mt-8 grid gap-5 md:grid-cols-3"><div className="rounded-2xl border border-[#e3e8f0] bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">Open loops</span><CircleAlert className="text-[#f97362]" size={18} /></div><p className="mt-4 text-3xl font-semibold">04</p><p className="mt-1 text-xs text-slate-400">1 needs attention today</p></div><div className="rounded-2xl border border-[#e3e8f0] bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">Research trails</span><Compass className="text-[#1e4ed8]" size={18} /></div><p className="mt-4 text-3xl font-semibold">05</p><p className="mt-1 text-xs text-slate-400">sources synthesized this week</p></div><div className="rounded-2xl border border-[#e3e8f0] bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">Agent confidence</span><Sparkles className="text-[#e9a23b]" size={18} /></div><p className="mt-4 text-3xl font-semibold">High</p><p className="mt-1 text-xs text-slate-400">all active connectors healthy</p></div></div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]"><section className="rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">Priority queue</p><h3 className="mt-1 text-xl font-semibold">What deserves your attention</h3></div><div className="flex items-center gap-2 rounded-xl border border-[#e3e8f0] bg-[#fafbfe] px-3 py-2 text-sm text-slate-400"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" className="w-24 bg-transparent outline-none placeholder:text-slate-400" /></div></div><div className="mt-5 space-y-3">{filteredTasks.map((task) => { const done = completed.includes(task.title); return <div key={task.title} className={`group flex items-center gap-4 rounded-xl border p-4 transition ${done ? "border-emerald-100 bg-emerald-50/40" : "border-[#edf0f5] hover:border-blue-200 hover:bg-blue-50/30"}`}><div className={`h-2.5 w-2.5 shrink-0 rounded-full ${task.tone === "rose" ? "bg-[#f97362]" : task.tone === "amber" ? "bg-[#e9a23b]" : "bg-[#5d8af0]"}`} /><div className="min-w-0 flex-1"><p className={`font-medium ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</p><p className="mt-1 text-xs text-slate-400">{task.source} · {task.meta}</p></div><button onClick={() => markDone(task.title)} className="rounded-lg border border-[#e3e8f0] bg-white px-3 py-2 text-xs font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100 hover:border-emerald-200 hover:text-emerald-700">{done ? "Done" : "Mark done"}</button></div>})}</div></section><aside className="rounded-2xl border border-[#e3e8f0] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">System pulse</p><h3 className="mt-1 text-xl font-semibold">Connected signals</h3></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Healthy</span></div><div className="mt-6 space-y-5">{integrations.map((item) => <div key={item.label} className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${item.color}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-700">{item.label}</p><p className="text-xs text-slate-400">{item.detail}</p></div><span className="text-[11px] font-medium text-slate-400">{item.status}</span></div>)}</div><div className="mt-7 border-t border-[#edf0f5] pt-5"><Button variant="outline" onClick={() => setNotice("Connector settings are available in the repository runtime.")} className="w-full justify-between rounded-xl">Manage connections <ArrowUpRight size={15} /></Button></div></aside></div>
          <footer className="mt-10 flex flex-col gap-2 border-t border-[#e3e8f0] pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>Drip Advisor · Atlas intelligence layer</span><span>Read-only mode · Telegram delivery off</span></footer>
        </div>
      </main>
    </div>
  );
}
