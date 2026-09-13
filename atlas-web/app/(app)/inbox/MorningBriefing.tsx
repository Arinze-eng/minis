"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CloudSun, Check } from "lucide-react";
import { demoWardrobe } from "@/lib/demo/wardrobe";
import { demoBriefing, withWearLogged } from "@/lib/demo/agent";
import { costPerWear } from "@/lib/wardrobe";
import { formatCPW, formatMoney } from "@/lib/format";

/**
 * Morning briefing: weather context + today's suggestion + the one-click
 * "Mark worn today" habit. Logging a wear is a user-confirmed action that
 * recomputes CPW immediately (pure `withWearLogged`; persistence arrives
 * with the server adapter). Announced via aria-live.
 */
export function MorningBriefing() {
  const briefing = useMemo(() => demoBriefing(), []);
  const wardrobe = useMemo(() => demoWardrobe(), []);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());

  const garments = briefing.suggestion.garmentIds
    .map((id) => wardrobe.garments.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .map((g) => (loggedIds.has(g.id) ? withWearLogged(g) : g));

  const allLogged = garments.every((g) => loggedIds.has(g.id));

  const markWorn = () => {
    setLoggedIds((prev) => new Set([...prev, ...briefing.suggestion.garmentIds]));
  };

  return (
    <section className="briefing" aria-labelledby="briefing-h">
      <div className="briefing-weather">
        <CloudSun size={17} aria-hidden="true" />
        <span className="weather-condition">{briefing.weather.condition}</span>
        <span className="weather-temp">{briefing.weather.temperatureC}°C</span>
        <span className="weather-rain">
          {briefing.weather.precipitationChance}% rain
        </span>
        <span className="weather-source" title={briefing.weather.source}>
          (demo snapshot)
        </span>
      </div>

      <h2 id="briefing-h">Today&rsquo;s suggestion</h2>
      <p className="briefing-outfit">{briefing.suggestion.headline}</p>
      <p className="briefing-reason">{briefing.suggestion.reason}</p>

      {garments.length > 0 ? (
        <div className="briefing-cpw">
          {garments.map((g) => {
            const cpw = costPerWear(g);
            return (
              <span key={g.id} className="briefing-cpw-item">
                {g.name}:{" "}
                <strong>
                  {cpw.basis === "confirmed_wears"
                    ? `${formatMoney(cpw.value, cpw.currency)}`
                    : formatCPW(cpw)}
                </strong>{" "}
                / wear · {cpw.wears} {cpw.wears === 1 ? "wear" : "wears"}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="briefing-actions">
        <button
          type="button"
          className={allLogged ? "btn-secondary" : "btn-primary"}
          onClick={markWorn}
          disabled={allLogged}
        >
          {allLogged ? (
            <>
              <Check size={15} aria-hidden="true" /> Logged for today
            </>
          ) : (
            "Mark worn today"
          )}
        </button>
        <Link className="btn-ghost" href="/looks">
          Pair into a look
        </Link>
      </div>

      {loggedIds.size > 0 ? (
        <p className="briefing-status" role="status" aria-live="polite">
          Wear logged — cost-per-wear updated for{" "}
          {loggedIds.size === 1 ? "1 garment" : `${loggedIds.size} garments`}{" "}
          (demo: persists locally tonight; server-side with your wear history
          once connected).
        </p>
      ) : null}
    </section>
  );
}
