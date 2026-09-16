"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Bell, Check, Moon, Save, ShieldCheck, Sliders } from "lucide-react";

/**
 * Delivery preferences, persisted server-side per verified principal. The
 * save button reflects the real request result — success, validation error, or
 * failure — and never claims a save that did not happen.
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
    <main id="main" className="page page-narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Sliders size={14} aria-hidden="true" />
            Settings · preferences &amp; quiet hours
          </p>
          <h1>Delivery preferences &amp; controls</h1>
          <p className="page-sub">
            Configure quiet-hours windows and notification delivery channels.
            Atlas never sends unauthorized external messages during quiet hours.
          </p>
        </div>
      </div>

      {loadFailed ? (
        <div className="notice notice-warn" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            Current preferences could not be loaded. The values shown are
            defaults — saving will store them for real once the connection
            works.
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSave} className="stack-md">
        <section className="card" aria-labelledby="quiet-h">
          <div className="card-head">
            <h2 id="quiet-h">
              <Moon size={15} aria-hidden="true" /> Quiet hours window
            </h2>
            <span className="badge">Local time</span>
          </div>
          <div className="card-pad stack-md">
            <label className="check-row">
              <span>
                <span className="row-title">Enable quiet-hours policy</span>
                <span className="row-detail">
                  Suppress non-urgent delivery notifications during rest hours.
                </span>
              </span>
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
              />
            </label>

            {quietHoursEnabled ? (
              <div className="form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="quiet-start">
                    Start time
                  </label>
                  <input
                    id="quiet-start"
                    className="input tabular"
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="quiet-end">
                    End time
                  </label>
                  <input
                    id="quiet-end"
                    className="input tabular"
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <p className="card-foot">
            Overnight windows are normal — a 22:00 → 07:30 window wraps midnight.
          </p>
        </section>

        <section className="card" aria-labelledby="channels-h">
          <div className="card-head">
            <h2 id="channels-h">
              <Bell size={15} aria-hidden="true" /> Delivery channels
            </h2>
          </div>
          <div className="card-pad stack-sm">
            <label className="check-row">
              <span>
                <span className="row-title">Browser / WebUI notifications</span>
                <span className="row-detail">
                  Signal cards and reminders surface in this app.
                </span>
              </span>
              <input
                type="checkbox"
                checked={webuiNotifications}
                onChange={(e) => setWebuiNotifications(e.target.checked)}
              />
            </label>

            <label className="check-row">
              <span>
                <span className="row-title">Telegram delivery gate</span>
                <span className="row-detail">
                  Save your preference here. Actual delivery remains blocked
                  unless the server has Telegram configured and the Atlas
                  consent and policy checks pass.
                </span>
              </span>
              <input
                type="checkbox"
                checked={telegramDelivery}
                onChange={(e) => setTelegramDelivery(e.target.checked)}
                aria-label="Enable Telegram delivery gate"
              />
            </label>
          </div>
        </section>

        <div className="form-submit">
          <div>
            {saveState.kind === "saved" ? (
              <span className="notice notice-good" role="status">
                <Check size={16} aria-hidden="true" />
                <span>Preferences saved to your account</span>
              </span>
            ) : null}
            {saveState.kind === "error" ? (
              <span className="notice notice-warn" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{saveState.message}</span>
              </span>
            ) : null}
          </div>
          <button type="submit" className="btn-primary" disabled={saveState.kind === "saving"}>
            {saveState.kind === "saving" ? (
              <>
                <Save size={15} aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <ShieldCheck size={15} aria-hidden="true" />
                Save preferences
              </>
            )}
          </button>
        </div>
      </form>
    </main>
  );
}
