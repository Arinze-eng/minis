"use client";

import { useEffect, useState } from "react";
import { Moon, Bell, ShieldCheck, Check, Save, AlertCircle } from "lucide-react";
import { RouteMark } from "@/components/RouteMark";

/**
 * Delivery preferences, persisted server-side per verified principal. The
 * save button reflects the real request result — success, validation error,
 * or failure — and never claims a save that did not happen.
 */

interface Preferences {
  quietHoursEnabled?: boolean;
  quietStart?: string;
  quietEnd?: string;
  webuiNotifications?: boolean;
  telegramDelivery?: boolean;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export default function PreferencesPage() {
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:30");
  const [webuiNotifications, setWebuiNotifications] = useState(true);
  const [telegramDelivery, setTelegramDelivery] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/preferences");
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { preferences?: Preferences };
        const p = body.preferences ?? {};
        if (typeof p.quietHoursEnabled === "boolean") setQuietHoursEnabled(p.quietHoursEnabled);
        if (typeof p.quietStart === "string") setQuietStart(p.quietStart);
        if (typeof p.quietEnd === "string") setQuietEnd(p.quietEnd);
        if (typeof p.webuiNotifications === "boolean") setWebuiNotifications(p.webuiNotifications);
        if (typeof p.telegramDelivery === "boolean") setTelegramDelivery(p.telegramDelivery);
      } catch {
        setLoadFailed(true);
      }
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quietHoursEnabled,
          quietStart,
          quietEnd,
          webuiNotifications,
          telegramDelivery,
        }),
      });
      if (res.ok) {
        setSaveState({ kind: "saved" });
        setTimeout(() => setSaveState({ kind: "idle" }), 2500);
      } else {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setSaveState({
          kind: "error",
          message: body.message ?? body.error ?? `Save failed (${res.status}).`,
        });
      }
    } catch {
      setSaveState({ kind: "error", message: "Network error — preferences were not saved." });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--atlas-lilac)]">
          <RouteMark className="w-4 h-4" />
          <span>Settings · Preferences & Quiet Hours</span>
        </div>
        <h1 className="text-3xl font-display font-semibold tracking-tight text-[var(--atlas-ink)]">
          Delivery Preferences & Controls
        </h1>
        <p className="text-sm text-[var(--atlas-ink)]/70 max-w-xl">
          Configure quiet-hours windows and notification delivery channels. Atlas never sends unauthorized external messages during quiet hours.
        </p>
      </div>

      {loadFailed && (
        <div className="border border-[var(--atlas-amber)]/40 bg-[var(--atlas-amber)]/10 rounded-xl p-5 flex gap-3" role="alert">
          <AlertCircle className="w-5 h-5 text-[var(--atlas-amber)] shrink-0" />
          <p className="text-sm text-[var(--atlas-ink)]">
            Current preferences could not be loaded. Values shown are defaults —
            saving will store them for real once the connection works.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b border-[var(--atlas-line)] pb-3">
            <Moon className="w-5 h-5 text-[var(--atlas-lilac)]" />
            <div>
              <h2 className="text-base font-display font-semibold text-[var(--atlas-ink)]">
                Quiet Hours Window
              </h2>
              <p className="text-xs text-[var(--atlas-ink)]/60">
                Suppress non-urgent delivery notifications during rest hours.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                className="rounded border-[var(--atlas-line)] text-[var(--atlas-lime)] focus:ring-[var(--atlas-lime)]"
              />
              <span className="text-sm font-medium text-[var(--atlas-ink)]">Enable Quiet Hours Policy</span>
            </label>

            {quietHoursEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label htmlFor="quiet-start" className="block text-xs font-mono uppercase text-[var(--atlas-ink)]/60 mb-1">
                    Start Time
                  </label>
                  <input
                    id="quiet-start"
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                    className="w-full rounded-lg border border-[var(--atlas-line)] bg-background px-3 py-2 text-sm font-mono text-[var(--atlas-ink)]"
                  />
                </div>
                <div>
                  <label htmlFor="quiet-end" className="block text-xs font-mono uppercase text-[var(--atlas-ink)]/60 mb-1">
                    End Time
                  </label>
                  <input
                    id="quiet-end"
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                    className="w-full rounded-lg border border-[var(--atlas-line)] bg-background px-3 py-2 text-sm font-mono text-[var(--atlas-ink)]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b border-[var(--atlas-line)] pb-3">
            <Bell className="w-5 h-5 text-[var(--atlas-lime)]" />
            <div>
              <h2 className="text-base font-display font-semibold text-[var(--atlas-ink)]">
                Delivery Channels
              </h2>
              <p className="text-xs text-[var(--atlas-ink)]/60">
                Choose where Atlas surfaces Signal Cards and reminders.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 rounded-lg border border-[var(--atlas-line)] bg-background cursor-pointer">
              <span className="text-sm font-medium text-[var(--atlas-ink)]">Browser WebUI Notifications</span>
              <input
                type="checkbox"
                checked={webuiNotifications}
                onChange={(e) => setWebuiNotifications(e.target.checked)}
                className="rounded border-[var(--atlas-line)] text-[var(--atlas-lime)]"
              />
            </label>

            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--atlas-line)] bg-background opacity-70">
              <div>
                <div className="text-sm font-medium text-[var(--atlas-ink)]">Telegram Delivery Gate</div>
                <div className="text-xs text-[var(--atlas-ink)]/60">
                  Not configurable yet — activates when the Telegram channel is
                  connected and you grant delivery consent.
                </div>
              </div>
              <input
                type="checkbox"
                checked={false}
                disabled
                aria-label="Telegram delivery (not yet configurable)"
                className="rounded border-[var(--atlas-line)]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {saveState.kind === "saved" && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20" role="status">
              <Check className="w-4 h-4" />
              <span>Preferences saved to your account</span>
            </div>
          )}
          {saveState.kind === "error" && (
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--atlas-amber)] bg-[var(--atlas-amber)]/10 px-3 py-1.5 rounded-lg border border-[var(--atlas-amber)]/30" role="alert">
              <AlertCircle className="w-4 h-4" />
              <span>{saveState.message}</span>
            </div>
          )}
          {saveState.kind === "idle" && <div />}

          <button
            type="submit"
            disabled={saveState.kind === "saving"}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--atlas-lime)] text-[var(--atlas-graphite)] font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-[0.98]"
          >
            {saveState.kind === "saving" ? (
              <>
                <Save className="w-4 h-4 animate-pulse" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Save Preferences</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
