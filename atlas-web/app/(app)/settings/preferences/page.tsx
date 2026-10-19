"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent } from "react";
import { PageHead, PageLoading, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";

const PRESENTATIONS = [
  ["feminine", "Feminine"],
  ["masculine", "Masculine"],
  ["neutral", "Neutral"],
] as const;
const FITS = ["slim", "regular", "relaxed", "oversized"] as const;

export default function PreferencesPage() {
  const me = useQuery(api.users.me);
  const update = useMutation(api.users.updatePrefs);
  const { run, busy } = useRun();
  if (me === undefined || me === null) return <PageLoading />;
  const p = me.prefs;

  const save = (patch: Parameters<typeof update>[0]["patch"]) => run(() => update({ patch }), "Saved");

  const submitStyle = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void save({
      homeCity: String(f.get("homeCity") ?? "").trim() || undefined,
      avoidColours: String(f.get("avoid") ?? "")
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12),
    });
  };

  return (
    <div className="page page-narrow">
      <PageHead title="Style & notifications" crumb={{ href: "/settings", label: "Settings" }} />

      <section className="grouped">
        <h2 className="section-header">Style</h2>
        <div className="grouped-list p-4 form-stack">
          <div className="field">
            <span className="field-label">Dress for</span>
            <div className="segmented" role="radiogroup" aria-label="Style presentation">
              {PRESENTATIONS.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={p.presentation === v} disabled={busy} onClick={() => save({ presentation: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Preferred fit</span>
            <div className="segmented" role="radiogroup" aria-label="Preferred fit">
              {FITS.map((v) => (
                <button key={v} type="button" role="radio" aria-checked={p.fit === v} disabled={busy} onClick={() => save({ fit: v })} className="capitalize">
                  {v}
                </button>
              ))}
            </div>
          </div>
          <form className="form-stack" onSubmit={submitStyle}>
            <label className="field">
              <span className="field-label">Colours to avoid</span>
              <input className="input" name="avoid" defaultValue={p.avoidColours.join(", ")} placeholder="mustard, neon green" />
            </label>
            <label className="field">
              <span className="field-label">Home city</span>
              <input className="input" name="homeCity" defaultValue={p.homeCity} placeholder="London" maxLength={80} />
            </label>
            <div className="form-submit">
              <button type="submit" className="btn-primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </div>
        <p className="section-footer">The stylist uses these when suggesting looks.</p>
      </section>

      <section className="grouped">
        <h2 className="section-header">Morning outfit</h2>
        <ul className="grouped-list">
          <li>
            <label className="check-row !px-4">
              <span className="flex-1">
                <span className="row-title">Suggest an outfit each morning</span>
                <span className="row-detail">From clean pieces you haven&apos;t worn lately. Appears in Today.</span>
              </span>
              <input type="checkbox" className="switch" checked={p.morningOutfit} disabled={busy} onChange={(e) => save({ morningOutfit: e.target.checked })} />
            </label>
          </li>
          <li>
            <label className="check-row !px-4">
              <span className="flex-1 row-title">Time</span>
              <select className="input !w-auto" value={p.morningHour} disabled={busy || !p.morningOutfit} onChange={(e) => save({ morningHour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" })}
                  </option>
                ))}
              </select>
            </label>
          </li>
          <li>
            <div className="check-row !px-4">
              <span className="flex-1">
                <span className="row-title">Time zone</span>
                <span className="row-detail">{p.timezone ?? "Not set — using UTC"}</span>
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => save({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
              >
                Use this device&apos;s
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section className="grouped">
        <h2 className="section-header">Quiet hours</h2>
        <ul className="grouped-list">
          <li>
            <label className="check-row !px-4">
              <span className="flex-1 row-title">Hold notifications overnight</span>
              <input type="checkbox" className="switch" checked={p.quietHoursEnabled} disabled={busy} onChange={(e) => save({ quietHoursEnabled: e.target.checked })} />
            </label>
          </li>
          <li>
            <div className="check-row !px-4">
              <span className="flex-1 row-title">From</span>
              <input type="time" className="input !w-auto" defaultValue={p.quietStart} disabled={busy || !p.quietHoursEnabled} onBlur={(e) => e.target.value !== p.quietStart && save({ quietStart: e.target.value })} />
            </div>
          </li>
          <li>
            <div className="check-row !px-4">
              <span className="flex-1 row-title">Until</span>
              <input type="time" className="input !w-auto" defaultValue={p.quietEnd} disabled={busy || !p.quietHoursEnabled} onBlur={(e) => e.target.value !== p.quietEnd && save({ quietEnd: e.target.value })} />
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}
