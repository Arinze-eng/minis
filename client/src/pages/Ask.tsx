import { useState } from "react";
import { AlertCircle, ArrowRight, Clock, ShieldCheck, Sparkles } from "lucide-react";
import AtlasShell from "@/components/AtlasShell";

export default function Ask() {
  const [request, setRequest] = useState("");
  const [occasion, setOccasion] = useState("");
  const [location, setLocation] = useState("Local");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!request.trim()) return;
    setLoading(true);
    setSubmitted(false);
    window.setTimeout(() => { setLoading(false); setSubmitted(true); }, 650);
  };

  return <AtlasShell><div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-12 lg:py-10"><div className="space-y-2"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#1e4ed8]"><Sparkles size={15} /> Ask Drip · bounded agent query</div><h2 className="text-3xl font-semibold tracking-tight">What deserves your attention next?</h2><p className="max-w-xl text-sm leading-6 text-slate-500">Ask for a recommendation using evidence Drip actually holds. It proposes; you decide. No hidden actions, purchases, messages, or changes.</p></div><div className="mt-8 rounded-2xl border border-[#e3e8f0] bg-white p-5 shadow-sm sm:p-6"><form onSubmit={submit} className="space-y-5"><div><label htmlFor="ask-request" className="mb-2 block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Your request</label><textarea id="ask-request" value={request} onChange={(event) => setRequest(event.target.value)} placeholder="e.g. What should I focus on this morning?" rows={5} className="w-full rounded-xl border border-[#e3e8f0] bg-[#fbfcff] px-4 py-3 text-sm outline-none transition focus:border-[#5d8af0] focus:ring-4 focus:ring-blue-100" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="occasion" className="mb-2 block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Occasion / vibe</label><input id="occasion" value={occasion} onChange={(event) => setOccasion(event.target.value)} placeholder="Workday, travel, dinner" className="w-full rounded-xl border border-[#e3e8f0] bg-[#fbfcff] px-3 py-2.5 text-sm outline-none focus:border-[#5d8af0]" /></div><div><label htmlFor="location" className="mb-2 block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Location context</label><input id="location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Local or London, UK" className="w-full rounded-xl border border-[#e3e8f0] bg-[#fbfcff] px-3 py-2.5 text-sm outline-none focus:border-[#5d8af0]" /></div></div><div className="flex flex-col gap-4 border-t border-[#edf0f5] pt-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="text-emerald-500" size={16} /> Atlas policy active · read-only by default</div><button type="submit" disabled={!request.trim() || loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#173a9b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#123080] disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><Clock className="animate-spin" size={16} /> Evaluating context...</> : <><Sparkles size={16} /> Ask Drip</>}</button></div></form></div>{submitted && <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5" role="status"><div className="flex gap-3"><AlertCircle className="shrink-0 text-[#1e4ed8]" size={19} /><div><p className="font-semibold">Drip has a bounded suggestion ready.</p><p className="mt-2 text-sm leading-6 text-slate-600">Based on your request{occasion ? ` for ${occasion}` : ""} in {location}, start by reviewing the overdue task in your priority queue. This preview does not invent personal evidence or execute an external action.</p><button onClick={() => setSubmitted(false)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1e4ed8]">Ask another question <ArrowRight size={14} /></button></div></div></div>}</div></AtlasShell>;
}
