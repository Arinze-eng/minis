import type { Metadata } from "next";
import Link from "next/link";
import { Shirt } from "lucide-react";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { syncSignalsAndNotifications } from "@/lib/server/seed";
import {
  costPerWear,
  filterGarments,
  availableColors,
  availableOccasions,
  CATEGORY_LABELS,
  type Garment,
  type GarmentCategory,
  type WardrobeFilters,
} from "@/lib/wardrobe";
import { formatCPW } from "@/lib/format";
import { GarmentCard } from "./GarmentCard";
import "./wardrobe.css";

export const metadata: Metadata = {
  title: "Wardrobe",
};

interface SearchParams {
  category?: string;
  occasion?: string;
  color?: string;
  q?: string;
}

function readFilters(params: SearchParams): WardrobeFilters {
  const category = (
    params.category && params.category in CATEGORY_LABELS ? params.category : "all"
  ) as WardrobeFilters["category"];
  return {
    category,
    occasion: params.occasion ?? "all",
    color: params.color ?? "all",
    query: params.q ?? "",
  };
}

function buildFilterHref(current: SearchParams, patch: Partial<SearchParams>): string {
  const merged = { ...current, ...patch };
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== "all") usp.set(k, v);
  }
  const qs = usp.toString();
  return qs ? `/wardrobe?${qs}` : "/wardrobe";
}

function toDomainGarment(row: Awaited<ReturnType<typeof getStore>>["store"] extends never ? never : GarmentFromStore): Garment {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Garment["category"],
    colors: row.colors,
    material: row.material ?? undefined,
    pattern: row.pattern ?? undefined,
    warmth: row.warmth,
    formality: row.formality,
    seasons: row.seasons,
    occasions: row.occasions,
    price: row.price ?? undefined,
    currency: row.currency ?? undefined,
    wearCount: row.wearCount,
    status: row.status === "confirmed" ? "confirmed" : "needs_confirmation",
    analysisProvider: (row.analysisProvider as Garment["analysisProvider"]) ?? "user",
    imageRef: row.imageRef ?? null,
    imageAlt: `${row.name}, garment record`,
    addedAt: row.addedAt,
    correctionHistory: [],
  };
}

type GarmentFromStore = Awaited<ReturnType<typeof listGarmentsSafe>>[number];

async function listGarmentsSafe(principalId: string) {
  const { store } = getStore();
  return store.listGarments(principalId);
}

export default async function WardrobePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = readFilters(params);
  const principal = await principalFromCookies();

  // First-run sync: derive signals from whatever exists (idempotent).
  await syncSignalsAndNotifications(principal.userId);

  const { mode } = getStore();
  const storeGarments = await listGarmentsSafe(principal.userId);
  const garments = storeGarments.map(toDomainGarment);
  const pending = garments.filter((g) => g.status === "needs_confirmation");
  const filtered = filterGarments(garments, filters);
  const colors = availableColors(garments);
  const occasions = availableOccasions(garments);

  return (
    <main id="main" className="page">
      {mode === "local_file" ? (
        <p className="demo-note" role="note">
          Local store — records stay on this device under your session.
          Set DATABASE_URL for the shared Postgres store.
        </p>
      ) : null}
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Shirt size={14} aria-hidden="true" />
            Wardrobe · cost per wear
          </p>
          <h1>Wardrobe</h1>
          <p className="page-sub">
            Every piece carries the price and wears you entered — Atlas only
            composes outfits from garments you confirmed.
          </p>
        </div>
        <Link className="btn-primary" href="/wardrobe/add">
          Add garment
        </Link>
      </div>

      {pending.length > 0 ? (
        <section className="confirm-queue" aria-labelledby="queue-h">
          <h2 id="queue-h">Needs your confirmation ({pending.length})</h2>
          {pending.map((p) => (
            <Link key={p.id} href={`/wardrobe/add?review=${p.id}`} className="queue-row">
              <span className="queue-name">{p.name}</span>
              <span className="queue-detail">Confirm tags to unlock outfit planning</span>
              <span className="queue-cta">Review tags →</span>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="filter-rail" aria-label="Filters">
        <div className="pill-row" role="group" aria-label="Category">
          <Link
            href={buildFilterHref(params, { category: "all" })}
            className={`pill ${filters.category === "all" ? "pill-active" : ""}`}
            aria-pressed={filters.category === "all"}
          >
            All
          </Link>
          {(Object.keys(CATEGORY_LABELS) as GarmentCategory[])
            .filter((c) => garments.some((g) => g.category === c))
            .map((c) => (
              <Link
                key={c}
                href={buildFilterHref(params, { category: c })}
                className={`pill ${filters.category === c ? "pill-active" : ""}`}
                aria-pressed={filters.category === c}
              >
                {CATEGORY_LABELS[c]}
              </Link>
            ))}
        </div>

        <div className="pill-row" role="group" aria-label="Occasion">
          <Link
            href={buildFilterHref(params, { occasion: "all" })}
            className={`pill ${filters.occasion === "all" ? "pill-active" : ""}`}
          >
            Any occasion
          </Link>
          {occasions.map((o) => (
            <Link
              key={o}
              href={buildFilterHref(params, { occasion: o })}
              className={`pill ${filters.occasion === o ? "pill-active" : ""}`}
            >
              {o}
            </Link>
          ))}
        </div>

        <div className="pill-row" role="group" aria-label="Color">
          <Link
            href={buildFilterHref(params, { color: "all" })}
            className={`pill ${filters.color === "all" ? "pill-active" : ""}`}
          >
            Any color
          </Link>
          {colors.map((c) => (
            <Link
              key={c}
              href={buildFilterHref(params, { color: c })}
              className={`pill ${filters.color === c ? "pill-active" : ""}`}
            >
              {c}
            </Link>
          ))}
        </div>

        <form className="search-form" action="/wardrobe" method="get" role="search">
          {params.category && params.category !== "all" ? (
            <input type="hidden" name="category" value={params.category} />
          ) : null}
          <label htmlFor="wardrobe-search" className="visually-hidden">
            Search wardrobe
          </label>
          <input
            id="wardrobe-search"
            type="search"
            name="q"
            defaultValue={filters.query}
            placeholder="Search name, material, color…"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
      </section>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>No garments match these filters</h2>
          <p>Loosen a filter, or add the piece you are thinking of.</p>
          <Link className="btn-secondary" href={buildFilterHref(params, { category: "all", occasion: "all", color: "all", q: "" })}>
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="garment-grid">
          {filtered.map((g) => (
            <GarmentCard key={g.id} garment={g} />
          ))}
        </div>
      )}

      <p className="wardrobe-footnote">
        Cost per wear uses confirmed wear events only — never estimates dressed
        up as data. Prices are what you entered, if you entered them.
      </p>
    </main>
  );
}
