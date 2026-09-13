import type { Metadata } from "next";
import Link from "next/link";
import { demoWardrobe } from "@/lib/demo/wardrobe";
import {
  costPerWear,
  filterGarments,
  availableColors,
  availableOccasions,
  CATEGORY_LABELS,
  DEFAULT_FILTERS,
  type Garment,
  type GarmentCategory,
  type WardrobeFilters,
} from "@/lib/wardrobe";
import { formatCPW } from "@/lib/format";
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

function GarmentCard({ garment }: { garment: Garment }) {
  const cpw = costPerWear(garment);
  const cpwClass =
    cpw.basis === "confirmed_wears" &&
    garment.price !== undefined &&
    cpw.value <= garment.price / 10
      ? "cpw-pill cpw-good"
      : cpw.basis === "confirmed_wears"
        ? "cpw-pill"
        : "cpw-pill cpw-unknown";
  return (
    <article className="garment-card">
      <div className="garment-media" aria-hidden="true">
        {/* Placeholder media: real assets arrive with the signed-upload phase. */}
        <span className="garment-media-letter">{garment.name.charAt(0)}</span>
      </div>
      <div className="garment-body">
        <h3>{garment.name}</h3>
        <p className="garment-tags">
          {CATEGORY_LABELS[garment.category]} · {garment.colors.join(", ")}
          {garment.material ? ` · ${garment.material}` : ""}
        </p>
        <p className="garment-occasions">{garment.occasions.join(" · ")}</p>
        <div className="garment-pills">
          <span className={cpwClass} title="Cost per wear (price / confirmed wears)">
            {formatCPW(cpw)}
          </span>
          <span className="wear-pill" title="Confirmed wear events">
            {garment.wearCount} {garment.wearCount === 1 ? "wear" : "wears"}
          </span>
        </div>
      </div>
    </article>
  );
}

export default async function WardrobePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = readFilters(params);
  const snapshot = demoWardrobe();
  const filtered = filterGarments(snapshot.garments, filters);
  const colors = availableColors(snapshot.garments);
  const occasions = availableOccasions(snapshot.garments);

  return (
    <main id="main" className="wardrobe-page">
      <p className="demo-note" role="note">
        {snapshot.demoLabel}
      </p>
      <header className="wardrobe-head">
        <h1>Wardrobe</h1>
        <Link className="btn-primary" href="/wardrobe/add">
          Add garment
        </Link>
      </header>

      {snapshot.pending.length > 0 ? (
        <section className="confirm-queue" aria-labelledby="queue-h">
          <h2 id="queue-h">Needs your confirmation ({snapshot.pending.length})</h2>
          {snapshot.pending.map((p) => (
            <Link
              key={p.garment.id}
              href={`/wardrobe/add?review=${p.garment.id}`}
              className="queue-row"
            >
              <span className="queue-name">{p.garment.name}</span>
              <span className="queue-detail">
                {Object.keys(p.suggestedTags).length} model-suggested tags await
                your review
              </span>
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
            .filter((c) => snapshot.garments.some((g) => g.category === c))
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
          <Link className="btn-secondary" href={buildFilterHref(params, DEFAULT_FILTERS)}>
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
