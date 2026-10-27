"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowUp, Bookmark, Check, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PageLoading, relativeTime, Spinner, useRun } from "@/components/ui";
import { OutfitStrip } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const STARTERS = ["What should I wear to work tomorrow?", "Put together a weekend brunch look", "Something warm for a rainy day", "What am I missing?"];

export type ChatContext = { kind: "item" | "outfit"; id: string };

type Proposal = { _id: Id<"outfits">; name: string; reasoning?: string; savedAt?: number; pieces: { _id: string; name: string; url: string | null }[] };

function ProposalCard({ outfit }: { outfit: Proposal }) {
  const save = useMutation(api.outfits.save);
  const { run, busy } = useRun();
  return (
    <div className="proposal">
      <div className="flex items-center gap-2">
        <Link href={`/looks/${outfit._id}`} className="proposal-name">
          {outfit.name}
        </Link>
        {outfit.savedAt ? (
          <span className="badge badge-good">
            <Check size={12} aria-hidden="true" /> Saved
          </span>
        ) : (
          <button type="button" className="btn-secondary !min-h-8" disabled={busy} onClick={() => run(() => save({ outfitId: outfit._id }), "Saved to Looks")}>
            <Bookmark size={14} aria-hidden="true" /> Save
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
    <div className="proposal border-l-2 !border-l-[var(--color-ink)]">
      <p className="proposal-name flex items-center gap-2">
        <Wand2 size={15} aria-hidden="true" /> Try this on?
      </p>
      <p className="list-sub">{approval.summary}</p>
      {approval.status === "pending" && !expired ? (
        <div className="flex gap-2">
          <button type="button" className="btn-primary !min-h-8" disabled={busy} onClick={() => run(() => decide({ approvalId: approval._id, approve: true }), "Try-on started — it'll appear in the look")}>
            Approve
          </button>
          <button type="button" className="btn !min-h-8" disabled={busy} onClick={() => run(() => decide({ approvalId: approval._id, approve: false }))}>
            <X size={14} aria-hidden="true" /> No thanks
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

/**
 * The stylist conversation. Used full-page (/ask, with the thread list) and in the docked panel.
 * Navigation is the caller's: it owns which thread is open and any page context.
 */
export function StylistChat({
  threadId,
  onThread,
  context,
  onClearContext,
  showThreads = false,
}: {
  threadId: string | null;
  onThread: (id: string | null) => void;
  context?: ChatContext;
  onClearContext?: () => void;
  showThreads?: boolean;
}) {
  const threads = useQuery(api.stylist.threads, showThreads ? {} : "skip");
  const thread = useQuery(api.stylist.thread, threadId ? { threadId } : "skip");
  const send = useMutation(api.stylist.send);
  const removeThread = useMutation(api.stylist.removeThread);
  const { run, busy } = useRun();
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const answering = thread?.thread.busy ?? false;
  const lastText = thread?.messages.at(-1)?.text.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages.length, lastText, answering]);

  // A thread that was deleted or belongs to someone else: start fresh.
  useEffect(() => {
    if (threadId && thread === null) onThread(null);
  }, [threadId, thread, onThread]);

  const submit = async (body: string) => {
    const message = body.trim();
    if (!message || busy || answering) return;
    setText("");
    const id = await run(() => send({ threadId: (thread?.thread._id ?? undefined) as Id<"threads"> | undefined, text: message, context }));
    if (!id) setText(message);
    else {
      if (context) onClearContext?.();
      if (id !== threadId) onThread(id);
    }
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

  const conversation = (
    <div className="min-w-0 flex flex-col h-full">
      {!thread ? (
        <div className="flex-1 grid place-items-center text-center py-10">
          <div className="stack-md justify-items-center max-w-md">
            <span className="empty-icon" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <h2 className="empty-title">What are we dressing for?</h2>
            <p className="empty-body">Only clothes you own. The stylist checks the weather, names what&apos;s missing, and asks before any try-on.</p>
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
                  <summary>
                    {m.activity!.length} step{m.activity!.length === 1 ? "" : "s"}
                  </summary>
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
        <p className="context-chip">
          <Sparkles size={13} aria-hidden="true" /> Asking about this {context.kind === "item" ? "piece" : "look"}
          <button type="button" aria-label="Don't include this page" onClick={onClearContext}>
            <X size={13} aria-hidden="true" />
          </button>
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
              if (confirm("Delete this conversation? Saved looks stay.")) void run(() => removeThread({ threadId: thread.thread._id })).then((r) => r !== undefined && onThread(null));
            }}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        )}
      </form>
    </div>
  );

  if (!showThreads) return conversation;
  return (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] min-h-[65vh]">
      <aside className="hidden lg:block" aria-label="Conversations">
        <button type="button" className="btn w-full mb-3" onClick={() => onThread(null)}>
          <Plus size={16} aria-hidden="true" /> New chat
        </button>
        <nav className="thread-list">
          {(threads ?? []).map((t) => (
            <button key={t._id} type="button" aria-current={t._id === threadId ? "page" : undefined} onClick={() => onThread(t._id)}>
              <span className="truncate">{t.title}</span>
              <span className="tile-kicker">{relativeTime(t.lastMessageAt)}</span>
            </button>
          ))}
          {threads?.length === 0 && <p className="muted p-2 text-[13px]">No conversations yet.</p>}
        </nav>
      </aside>
      {conversation}
    </div>
  );
}
