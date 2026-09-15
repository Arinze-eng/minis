import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Clock, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import AtlasShell from "@/components/AtlasShell";
import { trpc } from "@/lib/trpc";

export default function Ask() {
  const [request, setRequest] = useState("");
  const [occasion, setOccasion] = useState("");
  const [location, setLocation] = useState("Local");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chat = trpc.atlas.chat.useMutation();
  const history = trpc.atlas.chatHistory.useQuery(undefined, { retry: 1 });

  useEffect(() => {
    const latest = history.data?.find((item) => item.role === "assistant");
    if (!answer && latest) setAnswer(latest.content);
  }, [history.data, answer]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!request.trim()) return;
    setError(null);
    setAnswer(null);
    const context = [occasion && `Occasion: ${occasion}`, location && `Location: ${location}`].filter(Boolean).join(". ");
    try {
      const result = await chat.mutateAsync({ message: context ? `${request.trim()}\n\n${context}` : request.trim() });
      setAnswer(result.reply);
      setRequest("");
      await history.refetch();
    } catch {
      setError("Drip could not answer right now. Your request was not sent anywhere else; try again in a moment.");
    }
  };

  return <AtlasShell><div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-12 lg:py-10"><div className="space-y-2"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#1e4ed8]"><Sparkles size={15} /> Ask Drip · live bounded agent</div><h2 className="text-3xl font-semibold tracking-tight">What deserves your attention next?</h2><p className="max-w-xl text-sm leading-6 text-slate-500">Ask for a recommendation using evidence Drip actually holds. It proposes; you decide. No hidden actions, purchases, messages, or changes.</p></div><div className="mt-8 rounded-2xl border border-[#e3e8f0] bg-white p-5 shadow-sm sm:p-6"><form onSubmit={submit} className="space-y-5"><div><label htmlFor="ask-request" className="mb-2 block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Your request</label><textarea id="ask-request" value={request} onChange={(event) => setRequest(event.target.value)} placeholder="e.g. What should I focus on this morning?" rows={5} className="w-full rounded-xl border border-[#e3e8f0] bg-[#fbfcff] px-4 py-3 text-sm outline-none transition focus:border-[#5d8af0] focus:ring-4 focus:ring-blue-100" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="occasion" className="mb-2 block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Occasion / vibe</label><input id="occasion" value={occasion} onChange={(event) => setOccasion(event.target.value)} placeholder="Workday, travel, dinner" className="w-full rounded-xl border border-[#e3e8f0] bg-[#fbfcff] px-3 py-2.5 text-sm outline-none focus:border-[#5d8af0]" /></div><div><label htmlFor="location" className="mb-2 block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Location context</label><input id="location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Local or London, UK" className="w-full rounded-xl border border-[#e3e8f0] bg-[#fbfcff] px-3 py-2.5 text-sm outline-none focus:border-[#5d8af0]" /></div></div><div className="flex flex-col gap-4 border-t border-[#edf0f5] pt-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="text-emerald-500" size={16} /> Read-only context · persisted conversation</div><button type="submit" disabled={!request.trim() || chat.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#173a9b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#123080] disabled:cursor-not-allowed disabled:opacity-50">{chat.isPending ? <><Clock className="animate-spin" size={16} /> Evaluating context...</> : <><Sparkles size={16} /> Ask Drip</>}</button></div></form></div>{error && <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-800" role="alert"><AlertCircle className="mr-2 inline" size={17} />{error}</div>}{answer && <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5" role="status"><div className="flex gap-3"><MessageCircle className="shrink-0 text-[#1e4ed8]" size={19} /><div><p className="font-semibold">Drip’s response</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{answer}</p><button onClick={() => setAnswer(null)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1e4ed8]">Ask another question <ArrowRight size={14} /></button></div></div></div>}</div></AtlasShell>;
}
