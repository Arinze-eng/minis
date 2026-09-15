import type { Metadata } from "next";
import Link from "next/link";
import { principalFromCookies } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import type { Garment } from "@/lib/wardrobe";
import { CaptureFlow } from "./CaptureFlow";
import "./add.css";

export const metadata: Metadata = {
  title: "Add garment",
};

export default async function AddGarmentPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>;
}) {
  const { review } = await searchParams;
  const principal = await principalFromCookies();
  const { store } = getStore();

  // Deep-link support: an existing pending garment can be reopened for review.
  let pendingForReview = null;
  if (review) {
    const garments = await store.listGarments(principal.userId);
    const g = garments.find((x) => x.id === review && x.status === "needs_confirmation");
    if (g) {
      pendingForReview = {
        garment: {
          id: g.id,
          name: g.name,
          category: g.category as Garment["category"],
          colors: g.colors,
          warmth: g.warmth,
          formality: g.formality,
          seasons: g.seasons,
          occasions: g.occasions,
          wearCount: g.wearCount,
          status: "needs_confirmation" as const,
          analysisProvider: "user" as const,
          imageRef: g.imageRef ?? null,
          imageAlt: "Garment capture pending review",
          addedAt: g.addedAt,
          correctionHistory: [],
        },
        suggestedTags: {},
      };
    }
  }

  return (
    <main id="main" className="page page-narrow">
      <p className="crumb">
        <Link href="/wardrobe">← Wardrobe</Link>
      </p>
      <div className="page-head">
        <h1>Add a garment</h1>
      </div>
      <p className="page-sub add-sub">
        One piece at a time. Your photo is stored privately, access is
        consent-gated, and you can delete it at any time.
      </p>
      <CaptureFlow initialPending={pendingForReview} />
    </main>
  );
}
