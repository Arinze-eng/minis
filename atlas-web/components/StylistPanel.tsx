"use client";

import { Maximize2, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { StylistChat, type ChatContext } from "@/components/StylistChat";

type Panel = { open: boolean; toggle: () => void; close: () => void; ask: (context?: ChatContext) => void };

const PanelContext = createContext<Panel>({ open: false, toggle: () => {}, close: () => {}, ask: () => {} });
const THREAD_KEY = "atlas-stylist-thread";

/** The stylist is one tap away on every page (Fitcheck's docked panel), with the page as context. */
export function useStylistPanel(): Panel {
  return useContext(PanelContext);
}

export function StylistProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<ChatContext | undefined>();
  const [threadId, setThreadId] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setThreadId(window.localStorage.getItem(THREAD_KEY));
    } catch {
      /* storage blocked: start a fresh thread */
    }
  }, []);
  const chooseThread = useCallback((id: string | null) => {
    setThreadId(id);
    try {
      if (id) window.localStorage.setItem(THREAD_KEY, id);
      else window.localStorage.removeItem(THREAD_KEY);
    } catch {
      /* per-device convenience only */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const value = useMemo<Panel>(
    () => ({
      open,
      toggle: () => setOpen((o) => !o),
      close: () => setOpen(false),
      ask: (next) => {
        setContext(next);
        setOpen(true);
      },
    }),
    [open],
  );

  // The full-page stylist replaces the panel.
  const show = open && !pathname.startsWith("/ask");

  return (
    <PanelContext.Provider value={value}>
      <div className={show ? "panel-open" : undefined}>{children}</div>
      {show && (
        <>
          <button type="button" className="panel-scrim" aria-label="Close stylist" onClick={() => setOpen(false)} />
          <aside id="stylist-panel" className="stylist-panel" aria-label="Stylist">
            <header className="stylist-panel-head">
              <div>
                <p className="kicker">Stylist</p>
                <p className="font-medium">Dress from what you own</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="icon-btn" aria-label="New chat" title="New chat" onClick={() => chooseThread(null)}>
                  <Plus size={16} aria-hidden="true" />
                </button>
                <Link href={threadId ? `/ask?t=${threadId}` : "/ask"} className="icon-btn" aria-label="Open full page" title="Open full page" onClick={() => setOpen(false)}>
                  <Maximize2 size={15} aria-hidden="true" />
                </Link>
                <button type="button" className="icon-btn" aria-label="Close stylist" onClick={() => setOpen(false)}>
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
            </header>
            <div className="stylist-panel-body">
              <StylistChat threadId={threadId} onThread={chooseThread} context={context} onClearContext={() => setContext(undefined)} />
            </div>
          </aside>
        </>
      )}
    </PanelContext.Provider>
  );
}
