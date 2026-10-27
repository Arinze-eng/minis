"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowUp, Bookmark, Check, MessageCircle, Plus, Trash2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PageHead, PageLoading, relativeTime, Spinner, useRun } from "@/components/ui";
import { OutfitStrip } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const STARTERS = ["What should I wear to work tomorrow?", "Put together a weekend brunch look", "Something warm for a rainy day", "What goes with my favourite jeans?"];

type Proposal = { _id: Id<"outfits">; name: string; reasoning?: string; savedAt?: number; pieces: { _id: string; name: string; url: string | null }[] };

function ProposalCard({ outfit }: { outfit: Proposal }) {
  const save = useMutation(api.outfits.save);
  const { run, busy } = useRun();
  return (
    <div className="card card-pad stack-sm">
      <div className="flex items-center gap-2">
        <Link href={`/looks/${outfit._id}`} className="list-title flex-1 no-underline text-[var(--color-ink)] hover:underline">
          {outfit.name}
        </Link>
        {outfit.savedAt ? (
          <span className="badge badge-good">
            <Check size={12} aria-hidden="true" /> Saved
          </span>
        ) : (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => save({ outfitId: outfit._id }), "Saved to Looks")}>
            <Bookmark size={15} aria-hidden="true" /> Save
          </button>
        )}
      </div>
      <OutfitStrip pieces={outfit.pieces} />
      {outfit.reasoning && <p className="list-sub">{outfit.reasoning}</p>}
    </div>
  );
}

function ApprovalCard({ approval }: { approval: Doc<"approvals"> }) {
  const decide = useMutation(api.approvals.decide);
  const { run, busy } = useRun();
  const expired = approval.status === "pending" && approval.expiresAt <= Date.now();
  return (
    <div className="card card-pad stack-sm border-l-4 border-[var(--color-accent)]">
      <p className="list-title flex items-center gap-2">
        <Wand2 size={16} aria-hidden="true" /> Try this on?
      </p>
      <p className="list-sub">{approval.summary}</p>
      {approval.status === "pending" && !expired ? (
        <div className="flex gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => decide({ approvalId: approval._id, approve: true }), "Try-on started — it'll appear in the look")}>
            Approve
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => decide({ approvalId: approval._id, approve: false }))}>
            <X size={15} aria-hidden="true" /> No thanks
          </button>
        </div>
      ) : (
        <p className="list-sub">
          {approval.status === "approved" ? (
            <Link href={`/looks/${approval.outfitId}`} className="inline-link">
              Approved — see the try-on
            </Link>
          ) : approval.status === "rejected" ? (
            "Declined."
          ) : (
            "Expired. Ask again if you still want it."
          )}
        </p>
      )}
    </div>
  );
}

function Chat() {
  const params = useSearchParams();
  const router = useRouter();
  const threadId = params.get("t");
  // "Ask about this" links pass ?about=item:<id> or outfit:<id>; the server checks ownership.
  const about = params.get("about")?.match(/^(item|outfit):([\w-]{1,64})$/);
  const context = about ? { kind: about[1] as "item" | "outfit", id: about[2]! } : undefined;
  const threads = useQuery(api.stylist.threads);
  const thread = useQuery(api.stylist.thread, threadId ? { threadId } : "skip");
  const send = useMutation(api.stylist.send);
  const removeThread = useMutation(api.stylist.removeThread);
  const { run, busy } = useRun();
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const answering = thread?.thread.busy ?? false;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages.length, answering]);

  const submit = async (body: string) => {
    const message = body.trim();
    if (!message || busy || answering) return;
    setText("");
    const id = await run(() => send({ threadId: (thread?.thread._id ?? undefined) as Id<"threads"> | undefined, text: message, context }));
    if (!id) setText(message);
    else if (id !== threadId || context) router.replace(`/ask?t=${id}`, { scroll: false });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(text);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(text);
    }
  };

  if (threadId && thread === undefined) return <PageLoading />;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Conversations">
        <Link href="/ask" className="btn w-full mb-3">
          <Plus size={16} aria-hidden="true" /> New chat
        </Link>
        <div className="list-card">
          {(threads ?? []).map((t) => (
            <Link key={t._id} href={`/ask?t=${t._id}`} className={`list-row !py-2.5 ${t._id === threadId ? "bg-[var(--color-accent-soft)]" : ""}`}>
              <div className="list-main">
                <div className="text-[14px] font-medium truncate">{t.title}</div>
                <div className="list-sub">{relativeTime(t.lastMessageAt)}</div>
              </div>
            </Link>
          ))}
          {threads?.length === 0 && <p className="muted p-4 text-[13px]">No conversations yet.</p>}
        </div>
      </aside>

      <div className="min-w-0 flex flex-col min-h-[60vh]">
        {!thread ? (
          <div className="flex-1 grid place-items-center text-center py-10">
            <div className="stack-md justify-items-center">
              <span className="empty-icon" aria-hidden="true">
                <MessageCircle size={26} />
              </span>
              <h2 className="empty-title">What are we dressing for?</h2>
              <p className="empty-body">The stylist only uses clothes you own. It can suggest looks and ask before any try-on.</p>
              <div className="pill-row justify-center">
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="chip" disabled={busy} onClick={() => submit(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="chat flex-1">
            <div className="flex justify-end lg:hidden">
              <Link href="/ask" className="btn-ghost">
                <Plus size={16} aria-hidden="true" /> New chat
              </Link>
            </div>
            {thread.messages.map((m, index) => (
              <div key={m._id} className="contents">
                {m.role === "assistant" && m.status === "streaming" && !m.text ? (
                  <div className="bubble bubble-bot flex items-center gap-2 text-[var(--color-ink-muted)]" role="status">
                    <Spinner /> {m.activity?.at(-1) ?? "Thinking"}…
                  </div>
                ) : (
                  m.text && (
                    <div className={`bubble ${m.role === "user" ? "bubble-user" : "bubble-bot"} ${m.status === "error" ? "!text-[var(--color-danger-deep)]" : ""}`}>
                      {m.text}
                      {m.status === "streaming" && <span className="caret" aria-hidden="true" />}
                    </div>
                  )
                )}
                {m.role === "assistant" && m.status !== "streaming" && (m.activity?.length ?? 0) > 0 && (
                  <details className="activity">
                    <summary>{m.activity!.length} step{m.activity!.length === 1 ? "" : "s"}</summary>
                    <ul>
                      {m.activity!.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {m.question && (
                  <div className="bot-extra">
                    <p className="bubble bubble-bot !m-0">{m.question.prompt}</p>
                    {index === thread.messages.length - 1 && (
                      <div className="pill-row">
                        {m.question.options.map((o) => (
                          <button key={o} type="button" className="chip" disabled={busy || answering} onClick={() => submit(o)}>
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {(m.outfits.length > 0 || m.approval) && (
                  <div className="bot-extra">
                    {m.outfits.map((o) => (
                      <ProposalCard key={o._id} outfit={o} />
                    ))}
                    {m.approval && <ApprovalCard approval={m.approval} />}
                  </div>
                )}
              </div>
            ))}
            {answering && thread.messages.at(-1)?.role === "user" && (
              <div className="bubble bubble-bot flex items-center gap-2 text-[var(--color-ink-muted)]" role="status">
                <Spinner /> Looking through your wardrobe…
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}

        {context && (
          <p className="policy-line mb-1">
            Asking about this {context.kind === "item" ? "piece" : "look"}.{" "}
            <Link href={threadId ? `/ask?t=${threadId}` : "/ask"} className="inline-link">
              Remove
            </Link>
          </p>
        )}
        <form className="composer" onSubmit={onSubmit}>
          <label className="flex-1">
            <span className="visually-hidden">Message the stylist</span>
            <textarea className="textarea" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Ask for a look…" maxLength={2000} />
          </label>
          <button type="submit" className="btn-primary !rounded-full !w-11 !h-11 !p-0" aria-label="Send" disabled={!text.trim() || busy || answering}>
            <ArrowUp size={20} aria-hidden="true" />
          </button>
          {thread && (
            <button
              type="button"
              className="btn-ghost !w-11 !h-11 !p-0"
              aria-label="Delete conversation"
              disabled={busy || answering}
              onClick={() => {
                if (confirm("Delete this conversation? Saved looks stay.")) void run(() => removeThread({ threadId: thread.thread._id })).then((r) => r !== undefined && router.replace("/ask"));
              }}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function AskPage() {
  return (
    <div className="page">
      <PageHead title="Stylist" sub="Looks from clothes you already own." />
      <Suspense fallback={<PageLoading />}>
        <Chat />
      </Suspense>
    </div>
  );
}
