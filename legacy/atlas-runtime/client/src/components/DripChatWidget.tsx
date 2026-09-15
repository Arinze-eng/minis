import { useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";

export default function DripChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "Hi — I’m Drip. Ask me about your priorities, wardrobe, research, money review, or next best move." },
  ]);
  const chat = trpc.atlas.chat.useMutation();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = message.trim();
    if (!value || chat.isPending) return;
    setMessage("");
    setMessages((items) => [...items, { role: "user", content: value }]);
    try {
      const result = await chat.mutateAsync({ message: value });
      setMessages((items) => [...items, { role: "assistant", content: result.reply }]);
    } catch {
      setMessages((items) => [...items, { role: "assistant", content: "I couldn’t reach the agent right now. You can still use the evidence pages while the connection recovers." }]);
    }
  };

  return <>
    {open && <section className="fixed bottom-24 right-4 z-50 flex w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#dce4f2] bg-white shadow-[0_20px_55px_rgba(15,38,85,.22)] sm:right-6" aria-label="Drip chat">
      <header className="flex items-center justify-between bg-[#173a9b] px-4 py-3 text-white"><div className="flex items-center gap-2"><div className="rounded-lg bg-white/15 p-1.5"><Sparkles size={15} /></div><div><p className="text-sm font-semibold">Ask Drip</p><p className="text-[10px] text-blue-100">Bounded agent · read-only by default</p></div></div><button aria-label="Close Drip chat" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10"><X size={16} /></button></header>
      <div className="max-h-[360px] space-y-3 overflow-y-auto p-4">{messages.map((item, index) => <div key={`${item.role}-${index}`} className={`flex gap-2 ${item.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-5 ${item.role === "user" ? "rounded-br-md bg-[#eaf0ff] text-[#173a9b]" : "rounded-bl-md bg-[#f5f7fb] text-slate-700"}`}>{item.role === "assistant" ? <Streamdown>{item.content}</Streamdown> : item.content}</div></div>)}{chat.isPending && <div className="flex items-center gap-2 text-xs text-slate-400"><Bot size={14} className="animate-pulse" /> Drip is thinking…</div>}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[#edf0f5] p-3"><input aria-label="Message Drip" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about your next move…" className="min-w-0 flex-1 rounded-xl border border-[#e3e8f0] px-3 py-2 text-sm outline-none focus:border-[#5d8af0]" /><button aria-label="Send message" disabled={!message.trim() || chat.isPending} className="rounded-xl bg-[#173a9b] p-2.5 text-white disabled:opacity-40"><Send size={16} /></button></form>
    </section>}
    <button aria-label={open ? "Close Drip chat" : "Open Drip chat"} onClick={() => setOpen((value) => !value)} className="fixed bottom-5 right-4 z-50 flex items-center gap-2 rounded-full bg-[#173a9b] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(23,58,155,.3)] transition hover:bg-[#123080] sm:right-6"><Sparkles size={16} /> <span className="hidden sm:inline">Ask Drip</span></button>
  </>;
}
