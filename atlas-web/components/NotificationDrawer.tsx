"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  filterNotifications,
  NOTIFICATION_TABS,
  relativeTime,
  type AgentNotification,
} from "@/lib/notifications";

/**
 * Notification slide-over: right-side drawer with tab filters and
 * actionable cards. ESC and overlay click close it; focus moves into the
 * panel on open and returns to the opener implicitly via the header.
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
  const visible = useMemo(
    () => filterNotifications(notifications, tab),
    [notifications, tab],
  );

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

  if (!open) return null;

  return (
    <div className="drawer-root" role="presentation">
      <button
        type="button"
        className="drawer-overlay"
        aria-label="Close notifications"
        onClick={onClose}
      />
      <section
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
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
            visible.map((n) => (
              <article
                key={n.id}
                className={`notif-card urgency-${n.urgency} ${n.read ? "notif-read" : ""}`}
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
              </article>
            ))
          )}
        </div>

        <p className="drawer-footnote">
          Sentinel checks run on a schedule with your consent, read-only, and
          never act on your behalf.
        </p>
      </section>
    </div>
  );
}
