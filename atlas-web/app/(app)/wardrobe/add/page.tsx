import type { Metadata } from "next";
import Link from "next/link";
import { demoWardrobe } from "@/lib/demo/wardrobe";
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
  const snapshot = demoWardrobe();
  const pendingForReview = review
    ? snapshot.pending.find((p) => p.garment.id === review)
    : undefined;

  return (
    <main id="main" className="add-page">
      <p className="crumb">
        <Link href="/wardrobe">← Wardrobe</Link>
      </p>
      <h1>Add a garment</h1>
      <p className="add-sub">
        One piece at a time. The image stays private; analysis runs only for
        tagging, and nothing is stored until you confirm.
      </p>
      <p className="demo-note" role="note">
        {snapshot.demoLabel}
      </p>
      <CaptureFlow initialPending={pendingForReview ?? null} />
    </main>
  );
}
