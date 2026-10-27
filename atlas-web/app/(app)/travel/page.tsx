"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { CloudRain, ExternalLink, Luggage, Plane, Trash2 } from "lucide-react";
import { type FormEvent } from "react";
import { Empty, PageHead, PageLoading, useRun } from "@/components/ui";
import { ItemTile } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import { googleFlightsUrl, googleHotelsUrl } from "@/lib/travelLinks";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function TravelPage() {
  const plans = useQuery(api.travel.list);
  const me = useQuery(api.users.me);
  const plan = useAction(api.travel.plan);
  const remove = useMutation(api.travel.remove);
  const { run, busy } = useRun();
  const today = new Date();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await run(
      () =>
        plan({
          destination: String(f.get("destination") ?? ""),
          origin: String(f.get("origin") ?? "") || undefined,
          startDate: String(f.get("start") ?? ""),
          endDate: String(f.get("end") ?? ""),
        }),
      "Packing list ready",
    );
    if (ok) form.reset();
  };

  return (
    <div className="page">
      <PageHead title="Travel" sub="A packing list from your own wardrobe, matched to the forecast." />

      <form className="card card-pad section grid gap-3 md:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto] items-end" onSubmit={submit}>
        <label className="field">
          <span className="field-label">From</span>
          <input className="input" name="origin" maxLength={80} placeholder="London" defaultValue={me?.prefs.homeCity} key={me?.prefs.homeCity ?? ""} />
        </label>
        <label className="field">
          <span className="field-label">Where to?</span>
          <input className="input" name="destination" required maxLength={80} placeholder="Lisbon" />
        </label>
        <label className="field">
          <span className="field-label">Leaving</span>
          <input className="input" name="start" type="date" required min={iso(today)} defaultValue={iso(new Date(Date.now() + 7 * 86_400_000))} />
        </label>
        <label className="field">
          <span className="field-label">Back</span>
          <input className="input" name="end" type="date" required min={iso(today)} defaultValue={iso(new Date(Date.now() + 11 * 86_400_000))} />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          <Luggage size={16} aria-hidden="true" /> {busy ? "Planning…" : "Plan"}
        </button>
      </form>

      {plans === undefined ? (
        <PageLoading />
      ) : plans.length === 0 ? (
        <Empty icon={Plane} title="No trips yet" body="Tell Atlas where you're going. It checks the weather and picks clean pieces you haven't worn lately." />
      ) : (
        plans.map((p) => (
          <section key={p._id} className="section card card-pad stack-md">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-[20px] font-semibold">{p.destination}</h2>
                <p className="muted">
                  {new Date(p.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} –{" "}
                  {new Date(p.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                </p>
              </div>
              <button type="button" className="btn-ghost" aria-label={`Delete ${p.destination} trip`} disabled={busy} onClick={() => run(() => remove({ planId: p._id }), "Trip deleted")}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            {p.forecast.length > 0 && (
              <div className="chip-row">
                {p.forecast.map((d) => (
                  <div key={d.date} className="stat !p-3 flex-none min-w-[88px] text-center">
                    <span className="stat-label">{new Date(d.date).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</span>
                    <span className="font-semibold tabular-nums">
                      {Math.round(d.maxC)}° / {Math.round(d.minC)}°
                    </span>
                    {d.rainChance >= 40 && (
                      <span className="stat-note flex items-center justify-center gap-1">
                        <CloudRain size={12} aria-hidden="true" /> {d.rainChance}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {p.notes.map((n) => (
              <p key={n} className="muted">
                {n}
              </p>
            ))}
            {p.items.length > 0 && (
              <div className="tile-grid">
                {p.items.map((i) => (
                  <ItemTile key={i._id} item={i} />
                ))}
              </div>
            )}
            {p.gaps.length > 0 && <p className="notice notice-warn">Missing from your wardrobe: {p.gaps.join(", ")}.</p>}
            <div className="flex gap-2 flex-wrap items-center">
              <a className="btn-primary" href={googleFlightsUrl(p)} target="_blank" rel="noopener noreferrer">
                <Plane size={16} aria-hidden="true" /> Search flights <ExternalLink size={13} aria-hidden="true" />
              </a>
              <a className="btn" href={googleHotelsUrl(p)} target="_blank" rel="noopener noreferrer">
                Find a place to stay <ExternalLink size={13} aria-hidden="true" />
              </a>
              <span className="policy-line">Opens Google with your route and dates. You book and pay there; Atlas never takes payment.</span>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
