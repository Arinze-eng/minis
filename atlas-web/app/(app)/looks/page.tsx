import type { Metadata } from "next";
import { Shirt } from "lucide-react";
import Link from "next/link";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore, type GarmentRow } from "@/lib/server/store";
import { costPerWear, type Garment } from "@/lib/wardrobe";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Looks",
};

const VIBES = [
  { id: "minimal-coffee", label: "Minimalist coffee run" },
  { id: "office-day", label: "Office day" },
  { id: "date-night", label: "Date night" },
  { id: "rainy-errands", label: "Rainy errands" },
] as const;

function toDomainGarment(row: GarmentRow): Garment {
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

/**
 * Deterministic planner: picks a top + bottom + shoes from CONFIRMED
 * garments by vibe formality. The model may rank/explain these
 * candidates server-side; it never invents garments.
 */
function planOutfit(confirmed: Garment[], vibe: string): Garment[] {
  const formalityTarget =
    vibe === "office-day" ? 3 : vibe === "date-night" ? 2 : 1;
  const by = (cat: Garment["category"]) =>
    confirmed
      .filter((g) => g.category === cat)
      .sort(
        (a, b) =>
          Math.abs(a.formality - formalityTarget) -
          Math.abs(b.formality - formalityTarget),
      );
  const picks = [
    by("top")[0] ?? by("one_piece")[0],
    by("bottom")[0],
    by("shoes")[0],
    vibe === "rainy-errands"
      ? confirmed.find((g) => g.category === "outerwear")
      : undefined,
  ].filter((g): g is Garment => Boolean(g));
  return picks;
}

export default async function LooksPage({
  searchParams,
}: {
  searchParams: Promise<{ vibe?: string }>;
}) {
  const { vibe = VIBES[0].id } = await searchParams;

  const principal = await principalFromCookies();
  const { store } = getStore();
  const storeGarments = await store.listGarments(principal.userId);
  const confirmed = storeGarments
    .filter((g) => g.status === "confirmed")
    .map(toDomainGarment);

  const picks = planOutfit(confirmed, vibe);
  const totalCPWBasis = picks.reduce((sum, g) => sum + (g.price ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="flex items-center gap-1.5 text-[0.72rem] font-bold tracking-widest uppercase text-[var(--color-ink-muted)] mb-2">
          <Shirt size={13} aria-hidden="true" />
          Looks · composed from confirmed pieces
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-ink)] mb-2">
          Looks
        </h1>
        <p className="text-[0.95rem] text-[var(--color-ink-muted)] leading-relaxed max-w-prose">
          Outfits are composed only from garments you confirmed. Atlas can rank
          and explain candidates — it never invents pieces you do not own.
        </p>
      </div>

      {/* ── Vibe selector ───────────────────────────────────────────────── */}
      <nav
        className="flex flex-wrap gap-2 mb-6"
        aria-label="Occasion vibe"
      >
        {VIBES.map((v) => (
          <a
            key={v.id}
            href={`/looks?vibe=${v.id}`}
            aria-current={vibe === v.id ? "true" : undefined}
            className={[
              "inline-flex items-center px-4 py-2 rounded-full text-[0.87rem] font-medium no-underline transition-colors",
              vibe === v.id
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                : "bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]",
            ].join(" ")}
          >
            {v.label}
          </a>
        ))}
      </nav>

      {/* ── Outfit board ────────────────────────────────────────────────── */}
      <section
        className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[20px] shadow-[var(--shadow-card)] p-6"
        aria-label="Composed outfit"
      >
        {confirmed.length === 0 ? (
          /* Empty: no confirmed garments at all */
          <div className="text-center py-8 px-4">
            <h2 className="text-[1.1rem] font-bold text-[var(--color-ink)] mb-2">
              No confirmed garments yet
            </h2>
            <p className="text-[var(--color-ink-muted)] text-[0.92rem] mb-4">
              Add and confirm garments in your wardrobe to start planning looks.
            </p>
            <Link
              href="/wardrobe/add"
              className="inline-flex items-center gap-2 text-[0.9rem] font-semibold px-4 py-2 rounded-lg border border-[var(--color-line-strong)] text-[var(--color-ink)] hover:bg-[var(--color-surface-raised)] transition-colors no-underline"
            >
              Add a garment
            </Link>
          </div>
        ) : picks.length === 0 ? (
          /* Empty: confirmed garments exist but none match this vibe */
          <div className="text-center py-8 px-4">
            <h2 className="text-[1.1rem] font-bold text-[var(--color-ink)] mb-2">
              Nothing to compose for this vibe
            </h2>
            <p className="text-[var(--color-ink-muted)] text-[0.92rem]">
              Confirm more garment types (top, bottom, shoes) in your wardrobe
              and come back.
            </p>
          </div>
        ) : (
          /* Outfit list */
          <ol className="list-none m-0 p-0 grid gap-3">
            {picks.map((g) => {
              const cpw = costPerWear(g);
              return (
                <li
                  key={g.id}
                  className="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] gap-x-4 py-3 border-t border-[var(--color-line)] first:border-t-0"
                >
                  {/* Category badge — spans both rows */}
                  <span className="row-span-2 self-center text-[0.72rem] font-semibold uppercase tracking-widest text-[var(--color-accent-deep)] border border-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] rounded-full px-2.5 py-1 whitespace-nowrap">
                    {g.category.replace("_", " ")}
                  </span>
                  {/* Garment name */}
                  <span className="font-semibold text-[var(--color-ink)] text-[0.97rem]">
                    {g.name}
                  </span>
                  {/* Meta: colors · warmth · CPW */}
                  <span className="text-[0.85rem] text-[var(--color-ink-muted)] tabular-nums">
                    {g.colors.join(", ")} · warmth {g.warmth}/3 ·{" "}
                    {cpw.basis === "confirmed_wears"
                      ? `${formatMoney(cpw.value, cpw.currency)}/wear`
                      : "no CPW yet"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {picks.length > 0 && (
          <p className="mt-4 text-[0.88rem] text-[var(--color-ink-muted)] tabular-nums">
            {picks.length} confirmed pieces · owned value of the look{" "}
            {formatMoney(totalCPWBasis, "USD")}
          </p>
        )}
      </section>

      {/* ── Footnote ────────────────────────────────────────────────────── */}
      <p className="mt-6 text-[0.82rem] text-[var(--color-ink-muted)] max-w-[68ch] leading-relaxed">
        No person-image try-on is offered: visual simulation of garments on a
        person requires a separate consent flow that is intentionally not part
        of this release. Garment detail and fit in any future preview would be
        an AI-generated approximation, not a guarantee.
      </p>
    </div>
  );
}
