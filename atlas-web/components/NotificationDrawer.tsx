"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import {
  filterNotifications,
  NOTIFICATION_TABS,
  relativeTime,
  type AgentNotification,
} from "@/lib/notifications";
import { atlasSpring, useMotionPrefs } from "@/lib/motion";

/**
 * Notification slide-over with spring motion (stiffness 300 / damping 30 —
 * the documented drawer feel): overlay fade, panel slide, staggered card
 * entrance. ESC and overlay click close it; focus moves to the panel on
 * open; reduced-motion collapses the springs to near-instant transitions.
 */

type TabId = "all" | AgentNotification["category"];

export function NotificationDrawer({
  open,
  notifications,
  onClose,
  onDismiss,
}: {
  open: boolean;
  notifications: AgentNotification[];
  onClose: () => void;
  onDismiss: (id: string) => void;
}) {
  const [tab, setTab] = useState<TabId>("all");
  const panelRef = useRef<HTMLElement>(null);
  const reduced = useMotionPrefs();

  const visible = useMemo(
    () => filterNotifications(notifications, tab),
    [notifications, tab],
  );

  // Focus the panel on open so keyboard and screen-reader users land inside.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const spring = atlasSpring(reduced);

  return (
    <AnimatePresence>
      {open ? (
        <div className="drawer-root" role="presentation">
          <motion.button
            type="button"
            className="drawer-overlay"
            aria-label="Close notifications"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.01 : 0.18 }}
          />
          <motion.section
            ref={panelRef}
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            tabIndex={-1}
            initial={{ x: "110%" }}
            animate={{ x: 0 }}
            exit={{ x: "110%" }}
            transition={spring}
          >
            <header className="drawer-head">
              <h2>Notifications</h2>
              <button
                type="button"
                className="drawer-close"
                onClick={onClose}
                aria-label="Close notifications"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="drawer-tabs" role="tablist" aria-label="Notification filters">
              {NOTIFICATION_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`drawer-tab ${tab === t.id ? "drawer-tab-active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="drawer-list" aria-live="polite">
              {visible.length === 0 ? (
                <p className="drawer-empty">Nothing here right now.</p>
              ) : (
                visible.map((n, i) => (
                  <motion.article
                    key={n.id}
                    className={`notif-card urgency-${n.urgency} ${n.read ? "notif-read" : ""}`}
                    initial={reduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...spring,
                      delay: Math.min(i * 0.045, 0.25), // stagger, capped
                    }}
                  >
                    <header className="notif-head">
                      <span className="notif-category">{n.category}</span>
                      <span className="notif-time">{relativeTime(n.createdAt)}</span>
                    </header>
                    <h3>{n.title}</h3>
                    <p>{n.detail}</p>
                    <div className="notif-actions">
                      <Link
                        className="btn-primary notif-action"
                        href={n.action.href}
                        onClick={onClose}
                      >
                        {n.action.label}
                      </Link>
                      {!n.read ? (
                        <button
                          type="button"
                          className="btn-secondary notif-action"
                          onClick={() => onDismiss(n.id)}
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </div>
                  </motion.article>
                ))
              )}
            </div>

            <p className="drawer-footnote">
              Sentinel checks run on a schedule with your consent, read-only, and
              never act on your behalf.
            </p>
          </motion.section>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
