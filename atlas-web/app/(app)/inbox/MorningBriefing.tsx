"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CloudSun, Check } from "lucide-react";
import { costPerWear, type Garment } from "@/lib/wardrobe";
import { formatCPW, formatMoney } from "@/lib/format";
import { demoBriefing } from "@/lib/demo/agent";
import { atlasSpring, useMotionPrefs } from "@/lib/motion";

/**
 * Morning briefing backed by the store: garments come from /api/wardrobe
 * (server-derived principal). The weather chip stays a labelled sample until
 * the weather connector lands. "Mark worn today" POSTs an idempotent wear
 * event per garment (clientKey = today) and reflects the returned counts.
 */
export function MorningBriefing() {
  const briefing = useMemo(() => demoBriefing(), []); // weather + reason copy only
  const [garments, setGarments] = useState<Garment[]>([]);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const reduced = useMotionPrefs();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wardrobe", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { garments?: Garment[] };
      const confirmed = (data.garments ?? []).filter((g) => g.status === "confirmed");
      // Suggest a small rotation: most-worn first, up to 3 pieces.
      setGarments([...confirmed].sort((a, b) => b.wearCount - a.wearCount).slice(0, 3));
    } catch {
      /* offline */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const allLogged =
    garments.length > 0 && garments.every((g) => loggedIds.has(g.id));

  const markWorn = useCallback(async () => {
    const ids = garments.map((g) => g.id);
    if (ids.length === 0) return;
    const clientKey = `briefing-${new Date().toISOString().slice(0, 10)}`;
    try {
      const res = await fetch("/api/wardrobe/wear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ garmentIds: ids, clientKey }),
      });
      if (!res.ok) {
        setStatus("Could not log the wear — try again.");
        return;
      }
      const data = (await res.json()) as {
        results?: Array<{ garmentId: string; wearCount?: number; duplicate: boolean }>;
      };
      const counts = new Map(
        (data.results ?? []).map((r) => [r.garmentId, r.wearCount]),
      );
      setGarments((prev) =>
        prev.map((g) =>
          counts.has(g.id) && counts.get(g.id) !== undefined
            ? { ...g, wearCount: counts.get(g.id)! }
            : g,
        ),
      );
      setLoggedIds(new Set(ids));
      setStatus("Wear logged — cost-per-wear updated. Safe to repeat: logging today twice counts once.");
    } catch {
      setStatus("You appear to be offline — the wear will not be logged until you reconnect.");
    }
  }, [garments]);

  return (
    <section className="briefing" aria-labelledby="briefing-h">
      <div className="briefing-weather">
        <CloudSun size={17} aria-hidden="true" />
        <span className="weather-condition">{briefing.weather.condition}</span>
        <span className="weather-temp">{briefing.weather.temperatureC}°C</span>
        <span className="weather-rain">{briefing.weather.precipitationChance}% rain</span>
        <span className="weather-source" title={briefing.weather.source}>
          (demo snapshot)
        </span>
      </div>

      <h2 id="briefing-h">Today&rsquo;s rotation</h2>
      {garments.length === 0 ? (
        <p className="briefing-reason">
          {loaded
            ? "Add confirmed garments to see a daily suggestion here."
            : "Loading your wardrobe…"}
        </p>
      ) : (
        <>
          <p className="briefing-outfit">
            {garments.map((g) => g.name).join(" + ")}
          </p>
          <div className="briefing-cpw">
            {garments.map((g) => {
              const cpw = costPerWear(g);
              return (
                <span key={g.id} className="briefing-cpw-item">
                  {g.name}:{" "}
                  <strong>
                    {cpw.basis === "confirmed_wears"
                      ? formatMoney(cpw.value, cpw.currency)
                      : formatCPW(cpw)}
                  </strong>{" "}
                  / wear · {cpw.wears} {cpw.wears === 1 ? "wear" : "wears"}
                </span>
              );
            })}
          </div>
        </>
      )}

      <div className="briefing-actions">
        <button
          type="button"
          className={allLogged ? "btn-secondary" : "btn-primary"}
          onClick={() => void markWorn()}
          disabled={garments.length === 0 || allLogged}
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

      <AnimatePresence>
        {status ? (
          <motion.p
            className="briefing-status"
            role="status"
            aria-live="polite"
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={atlasSpring(reduced)}
          >
            {status}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
