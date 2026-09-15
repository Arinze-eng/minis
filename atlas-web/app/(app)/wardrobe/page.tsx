import type { Metadata } from "next";
import Link from "next/link";
import { Shirt, Layers } from "lucide-react";
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

  const storeGarments = await listGarmentsSafe(principal.userId);
  const garments = storeGarments.map(toDomainGarment);
  const pending = garments.filter((g) => g.status === "needs_confirmation");
  const filtered = filterGarments(garments, filters);
  const colors = availableColors(garments);
  const occasions = availableOccasions(garments);

  const hasActiveFilters =
    filters.category !== "all" ||
    filters.occasion !== "all" ||
    filters.color !== "all" ||
    filters.query !== "";

  return (
    <main id="main" className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-muted)] uppercase tracking-wider mb-1">
            <Shirt size={14} aria-hidden="true" />
            Wardrobe · cost per wear
          </p>
          <h1 className="text-2xl font-bold text-[var(--color-ink)] leading-tight">
            Your Wardrobe
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)] max-w-prose">
            Every piece carries the price and wears you entered — Atlas only
            composes outfits from garments you confirmed.
          </p>
        </div>
        <Link
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          href="/wardrobe/add"
        >
          Add garment
        </Link>
      </div>

      {/* Confirmation queue */}
      {pending.length > 0 ? (
        <section
          className="mb-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-4"
          aria-labelledby="queue-h"
        >
          <h2 id="queue-h" className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Needs your confirmation ({pending.length})
          </h2>
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <Link
                key={p.id}
                href={`/wardrobe/add?review=${p.id}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-line)] hover:border-[var(--color-accent)] transition-colors"
              >
                <span className="font-medium text-sm text-[var(--color-ink)]">{p.name}</span>
                <span className="text-xs text-[var(--color-ink-muted)] hidden sm:block">
                  Confirm tags to unlock outfit planning
                </span>
                <span className="text-xs font-medium text-[var(--color-accent)] shrink-0">
                  Review tags →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Filter rail */}
      {garments.length > 0 ? (
        <section className="mb-4 flex flex-col gap-3" aria-label="Filters">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
            <Link
              href={buildFilterHref(params, { category: "all" })}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filters.category === "all"
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              }`}
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
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filters.category === c
                      ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                      : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  }`}
                  aria-pressed={filters.category === c}
                >
                  {CATEGORY_LABELS[c]}
                </Link>
              ))}
          </div>

          {/* Occasion pills */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Occasion">
            <Link
              href={buildFilterHref(params, { occasion: "all" })}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filters.occasion === "all"
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              }`}
            >
              Any occasion
            </Link>
            {occasions.map((o) => (
              <Link
                key={o}
                href={buildFilterHref(params, { occasion: o })}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filters.occasion === o
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                }`}
              >
                {o}
              </Link>
            ))}
          </div>

          {/* Color pills */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Color">
            <Link
              href={buildFilterHref(params, { color: "all" })}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filters.color === "all"
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              }`}
            >
              Any color
            </Link>
            {colors.map((c) => (
              <Link
                key={c}
                href={buildFilterHref(params, { color: c })}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filters.color === c
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                }`}
              >
                {c}
              </Link>
            ))}
          </div>

          {/* Search */}
          <form className="flex gap-2" action="/wardrobe" method="get" role="search">
            {params.category && params.category !== "all" ? (
              <input type="hidden" name="category" value={params.category} />
            ) : null}
            <label htmlFor="wardrobe-search" className="sr-only">
              Search wardrobe
            </label>
            <input
              id="wardrobe-search"
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="Search name, material, color…"
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
            >
              Search
            </button>
          </form>
        </section>
      ) : null}

      {/* Content area */}
      {garments.length === 0 ? (
        /* Completely empty wardrobe */
        <div
          className="mt-12 flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-[var(--color-line)] p-12 text-center"
          role="region"
          aria-label="Empty wardrobe"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]" aria-hidden="true">
            <Layers size={40} />
          </div>
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Your wardrobe is empty</h2>
          <p className="text-sm text-[var(--color-ink-muted)] max-w-sm">
            Add your first garment to start tracking cost per wear and getting
            outfit suggestions from Atlas.
          </p>
          <Link
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            href="/wardrobe/add"
          >
            Add your first garment
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        /* Garments exist but filters return nothing */
        <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--color-line)] p-12 text-center">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">
            No garments match these filters
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Loosen a filter, or add the piece you are thinking of.
          </p>
          <Link
            className="px-3 py-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
            href={buildFilterHref(params, {
              category: "all",
              occasion: "all",
              color: "all",
              q: "",
            })}
          >
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 mt-6">
          {filtered.map((g) => (
            <GarmentCard key={g.id} garment={g} />
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-[var(--color-ink-muted)]">
        Cost per wear uses confirmed wear events only — never estimates dressed
        up as data. Prices are what you entered, if you entered them.
      </p>
    </main>
  );
}
