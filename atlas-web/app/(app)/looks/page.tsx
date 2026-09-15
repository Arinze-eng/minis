import type { Metadata } from "next";
import { demoWardrobe } from "@/lib/demo/wardrobe";
import { costPerWear, type Garment } from "@/lib/wardrobe";
import { formatMoney } from "@/lib/format";
import "./looks.css";

export const metadata: Metadata = {
  title: "Looks",
};

const VIBES = [
  { id: "minimal-coffee", label: "Minimalist coffee run" },
  { id: "office-day", label: "Office day" },
  { id: "date-night", label: "Date night" },
  { id: "rainy-errands", label: "Rainy errands" },
] as const;

/**
 * Deterministic demo planner: picks a top + bottom + shoes from CONFIRMED
 * garments by vibe formality, mirroring the backend rule that only confirmed
 * owned garments enter outfit logic. The model may rank/explain these
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
    vibe === "rainy-errands" ? confirmed.find((g) => g.category === "outerwear") : undefined,
  ].filter((g): g is Garment => Boolean(g));
  return picks;
}

export default async function LooksPage({
  searchParams,
}: {
  searchParams: Promise<{ vibe?: string }>;
}) {
  const { vibe = VIBES[0].id } = await searchParams;
  const snapshot = demoWardrobe();
  const confirmed = snapshot.garments.filter((g) => g.status === "confirmed");
  const picks = planOutfit(confirmed, vibe);
  const totalCPWBasis = picks.reduce((sum, g) => sum + (g.price ?? 0), 0);

  return (
    <main id="main" className="looks-page">
      <h1>Looks</h1>
      <p className="looks-sub">
        Outfits are composed only from garments you confirmed. Atlas can rank
        and explain candidates — it never invents pieces you do not own.
      </p>
      <p className="demo-note" role="note">
        {snapshot.demoLabel}
      </p>

      <nav className="vibe-row" aria-label="Occasion vibe">
        {VIBES.map((v) => (
          <a
            key={v.id}
            href={`/looks?vibe=${v.id}`}
            className={`pill ${vibe === v.id ? "pill-active" : ""}`}
            aria-current={vibe === v.id ? "true" : undefined}
          >
            {v.label}
          </a>
        ))}
      </nav>

      <section className="outfit-board" aria-label="Composed outfit">
        {picks.length === 0 ? (
          <div className="empty-state">
            <h2>Nothing to compose yet</h2>
            <p>Confirm a garment in the wardrobe and come back.</p>
          </div>
        ) : (
          <ol className="outfit-list">
            {picks.map((g) => {
              const cpw = costPerWear(g);
              return (
                <li key={g.id} className="outfit-piece">
                  <span className="outfit-role">{g.category.replace("_", " ")}</span>
                  <span className="outfit-name">{g.name}</span>
                  <span className="outfit-meta">
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
        {picks.length > 0 ? (
          <p className="outfit-sum">
            {picks.length} confirmed pieces · owned value of the look{" "}
            {formatMoney(totalCPWBasis, "USD")}
          </p>
        ) : null}
      </section>

      <p className="looks-footnote">
        No person-image try-on is offered: visual simulation of garments on a
        person requires a separate consent flow that is intentionally not part
        of this release. Garment detail and fit in any future preview would be
        an AI-generated approximation, not a guarantee.
      </p>
    </main>
  );
}
